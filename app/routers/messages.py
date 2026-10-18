from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from app.models import UserInfo, Message, Block_user, Conversations, Message_request, Feed_alert
from app.privacy import (
    can_send_dm,
    drop_blocked_rows,
    dm_access_value,
    find_conversation,
    conversation_is_open,
    pair_has_messages,
    blocked_either_way,
    pending_dm_request,
    are_friends,
)
from app.schemas import Message_schema, Dm_request_in, Dm_request_respond, Conversation_mute_in
from app.database import get_db
from app.auth import get_current_user
from app.r2 import attachment_public, require_message_body, store_attachment
from app.routers.deletion import deletion_fields, refresh_pending_messages
from app.routers.reactions import reactions_for_messages
from app.routers.mentions import accepted_reply_parent, reply_map_for
from app.routers.profile import STATUS_MAX, avatar_lookup, clip_text, public_avatar, public_display_name
from app.routers.feed import notify_activity_reply, notify_feed_alert
from app.routers.realtime import notify_user
from app.site_moderation import mask_message_payloads, permaban_by_user_id
from datetime import datetime, timedelta

router = APIRouter()

MUTE_DURATION_DELTAS = {
    "15m": timedelta(minutes=15),
    "1h": timedelta(hours=1),
    "8h": timedelta(hours=8),
    "24h": timedelta(hours=24),
}
MUTE_FOREVER = datetime(9999, 1, 1)


def mute_until_for(duration):
    key = (duration or "").strip().lower()
    if key in ("off", "unmute"):
        return None
    if key == "on":
        return MUTE_FOREVER
    delta = MUTE_DURATION_DELTAS.get(key)
    if not delta:
        raise HTTPException(status_code=400, detail="Invalid mute duration.")
    return datetime.now() + delta


def mute_is_active(until, now=None):
    if not until:
        return False
    return until > (now or datetime.now())


def mute_public(until):
    if not mute_is_active(until):
        return {"muted": False, "muted_until": None}
    if until.year >= 9999:
        return {"muted": True, "muted_until": None}
    return {"muted": True, "muted_until": int(until.timestamp() * 1000)}


def conversation_mute_until(convo, user_id):
    if not convo:
        return None
    if convo.user_1 == user_id:
        return convo.muted_until_user_1
    if convo.user_2 == user_id:
        return convo.muted_until_user_2
    return None


def set_conversation_mute_until(convo, user_id, until):
    if convo.user_1 == user_id:
        convo.muted_until_user_1 = until
    elif convo.user_2 == user_id:
        convo.muted_until_user_2 = until


def conversation_closed_for(convo, user_id):
    if convo.user_1 == user_id:
        return bool(convo.closed_by_user_1)
    return bool(convo.closed_by_user_2)


def open_conversation(database, user_a, user_b):
    convo = find_conversation(database, user_a, user_b)
    now = datetime.now()
    if not convo:
        convo = Conversations(
            user_1=user_a,
            user_2=user_b,
            last_message_at=now,
            closed_by_user_1=False,
            closed_by_user_2=False,
        )
        database.add(convo)
    else:
        convo.last_message_at = now
        convo.closed_by_user_1 = False
        convo.closed_by_user_2 = False
    return convo


def insert_system_dm(database, actor, recipient_id, content):
    open_conversation(database, actor.id, recipient_id)
    row = Message(
        sender_id=actor.id,
        receiver_id=recipient_id,
        content=content,
        read=False,
        is_system=True,
    )
    database.add(row)
    database.commit()
    database.refresh(row)
    return row


async def notify_system_dm(actor, recipient_id, row):
    await notify_user(recipient_id, {
        "type": "message",
        "id": row.id,
        "username": actor.username,
        "display_name": public_display_name(actor),
        "status": clip_text(actor.profile_status, STATUS_MAX).strip(),
        "sender_id": actor.id,
        "content": row.content,
        "attachment": None,
        "timestamp": str(row.timestamp),
        "is_system": True,
        "avatar": public_avatar(actor),
    })


def drop_dm_request_alerts(database, receiver_id, sender_id):
    rows = database.query(Feed_alert).filter(
        Feed_alert.receiver_id == receiver_id,
        Feed_alert.sender_id == sender_id,
        Feed_alert.alert_type == "dm_request",
    ).all()
    for row in rows:
        database.delete(row)


@router.post("/messages")
async def send_message(message: Message_schema, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    is_blocked = database.query(Block_user).filter(Block_user.initiated_by == current_user.id, Block_user.blocked_user == message.receiver_id).first()
    blocked_mirrored = database.query(Block_user).filter(Block_user.initiated_by == message.receiver_id, Block_user.blocked_user == current_user.id).first()

    if is_blocked or blocked_mirrored:
        raise HTTPException(status_code= 400, detail= "User is blocked.")

    recipient = database.query(UserInfo).filter(UserInfo.id == message.receiver_id).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="User not found.")
    if not can_send_dm(database, current_user.id, recipient):
        raise HTTPException(status_code=403, detail="This user does not accept Direct Messages from you.")

    require_message_body(message.content, message.attachment)
    attachment_json = store_attachment(message.attachment, current_user)

    convo_exists = database.query(Conversations).filter(Conversations.user_1 == current_user.id, Conversations.user_2 == message.receiver_id).first()
    mirrored_convo = database.query(Conversations).filter(Conversations.user_1 == message.receiver_id, Conversations.user_2 == current_user.id).first()
    active_convo = convo_exists or mirrored_convo

    if not active_convo:
        new_convo = Conversations(user_1 = current_user.id, user_2 = message.receiver_id, last_message_at = datetime.now()) 
        database.add(new_convo)
        database.commit()
        database.refresh(new_convo)
        active_convo = new_convo
    else:
        active_convo.last_message_at = datetime.now()

    active_convo.closed_by_user_1 = False
    active_convo.closed_by_user_2 = False
    parent = None
    if message.reply_to_id:
        candidate = database.query(Message).filter(Message.id == message.reply_to_id).first()
        if accepted_reply_parent(candidate):
            pair = {candidate.sender_id, candidate.receiver_id}
            if current_user.id in pair and message.receiver_id in pair:
                parent = candidate
    new_message = Message(sender_id = current_user.id, 
    receiver_id = message.receiver_id,
    content = message.content,
    attachment = attachment_json,
    read = False,
    reply_to_id = parent.id if parent else None,
    )
    database.add(new_message)
    database.commit()
    database.refresh(new_message)
    if parent and parent.sender_id:
        await notify_activity_reply(
            database,
            receiver_id=parent.sender_id,
            actor_id=current_user.id,
            message_kind="dm",
            message_id=new_message.id,
        )

    return new_message

@router.get("/messages/{user_id}")
def get_conversation(user_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user), before_id: int = None, around_id: int = None):

    base = database.query(Message).filter(or_(
        (Message.sender_id == current_user.id) & (Message.receiver_id == user_id),
        (Message.sender_id == user_id) & (Message.receiver_id == current_user.id)
    ))
    if around_id:
        target = base.filter(Message.id == around_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="No message found")
        before = base.filter(Message.id < around_id).order_by(Message.timestamp.desc()).limit(12).all()
        after = base.filter(Message.id > around_id).order_by(Message.timestamp.asc()).limit(12).all()
        History = list(reversed(before)) + [target] + after
    elif before_id:
        History = base.filter(Message.id < before_id).order_by(Message.timestamp.desc()).limit(25).all()
        History = list(reversed(History))
    else:
        History = base.order_by(Message.timestamp.desc()).limit(25).all()
        History = list(reversed(History))

    History = drop_blocked_rows(database, current_user.id, History)

    target_user = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    banned = permaban_by_user_id(database, user_id)
    if not target_user and not banned:
        raise HTTPException(status_code= 404,  detail="No user found")
    refresh_pending_messages(database, History)
    reaction_map = reactions_for_messages(database, "dm", [msg.id for msg in History], current_user.id)
    reply_map = reply_map_for(database, Message, History)
    sender_ids = list({msg.sender_id for msg in History if msg.sender_id})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(sender_ids)).all() if sender_ids else []
    faces = avatar_lookup(accounts)
    messages_out = []
    for msg in History:
        fields = deletion_fields(msg, attachment_public(msg.attachment))
        messages_out.append({
            "id": msg.id,
            "sender_id": msg.sender_id,
            "receiver_id": msg.receiver_id,
            "content": fields["content"],
            "attachment": fields["attachment"],
            "timestamp": msg.timestamp,
            "read": msg.read,
            "deletion_state": fields["deletion_state"],
            "deletion_requested_at": fields["deletion_requested_at"],
            "edited": fields["edited"],
            "is_system": bool(getattr(msg, "is_system", False)),
            "reactions": reaction_map.get(msg.id, []),
            "reply_to": reply_map.get(msg.reply_to_id) if msg.reply_to_id else None,
            "avatar": faces.get(msg.sender_id),
        })
    mask_message_payloads(database, messages_out)
    return {
        "other_username": target_user.username if target_user else "",
        "session_username": current_user.username,
        "other_avatar": public_avatar(target_user) if target_user else None,
        "permaban": bool(banned and not target_user),
        "messages": messages_out,
    }

@router.post("/messages/{user_id}/read")
def mark_conversation_read(user_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    database.query(Message).filter(
        Message.sender_id == user_id,
        Message.receiver_id == current_user.id,
        Message.read == False
    ).update({Message.read: True}, synchronize_session=False)
    database.commit()
    return {"ok": True}

@router.get("/conversation_history")
def conversation_history(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    convo_history = database.query(Conversations).filter(
        or_(Conversations.user_1 == current_user.id, Conversations.user_2 == current_user.id)
    ).order_by(Conversations.last_message_at.desc()).all()

    open_rows = []
    closed_mutes = []
    for convo in convo_history:
        other_id = convo.user_2 if convo.user_1 == current_user.id else convo.user_1
        mute_info = mute_public(conversation_mute_until(convo, current_user.id))
        if conversation_closed_for(convo, current_user.id):
            if mute_info["muted"]:
                closed_mutes.append({"id": other_id, "muted": True, "muted_until": mute_info["muted_until"]})
            continue
        open_rows.append((convo, other_id, mute_info))

    other_ids = [other_id for _, other_id, _ in open_rows]
    accounts = {row.id: row for row in database.query(UserInfo).filter(UserInfo.id.in_(other_ids)).all()} if other_ids else {}
    unread_counts = {}
    if other_ids:
        for sender_id, count in database.query(Message.sender_id, func.count(Message.id)).filter(
            Message.receiver_id == current_user.id,
            Message.read == False,
            Message.sender_id.in_(other_ids),
        ).group_by(Message.sender_id).all():
            unread_counts[sender_id] = int(count or 0)

    conversations_out = []
    for convo, other_id, mute_info in open_rows:
        other_account = accounts.get(other_id)
        conversations_out.append({
            "type": "dm",
            "id": other_id,
            "username": other_account.username if other_account else "",
            "display_name": public_display_name(other_account) if other_account else "",
            "status": clip_text(other_account.profile_status, STATUS_MAX).strip() if other_account else "",
            "unread_count": unread_counts.get(other_id, 0),
            "last_message_at": str(convo.last_message_at),
            "avatar": public_avatar(other_account) if other_account else None,
            "permaban": not bool(other_account),
            "muted": mute_info["muted"],
            "muted_until": mute_info["muted_until"],
        })

    return {"conversations": conversations_out, "closed_mutes": closed_mutes}

@router.post("/conversation/{other_user_id}/mute")
def mute_conversation(other_user_id: int, body: Conversation_mute_in, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    if other_user_id == current_user.id:
        raise HTTPException(status_code=409, detail="Cannot mute yourself.")
    target = database.query(UserInfo).filter(UserInfo.id == other_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    until = mute_until_for(body.duration)
    convo = find_conversation(database, current_user.id, other_user_id)
    if not convo:
        convo = Conversations(
            user_1=current_user.id,
            user_2=other_user_id,
            last_message_at=datetime.now(),
            closed_by_user_1=True,
            closed_by_user_2=True,
        )
        database.add(convo)
        database.flush()
    set_conversation_mute_until(convo, current_user.id, until)
    database.commit()
    return mute_public(until)

@router.post("/conversation/{other_user_id}/close")
def close_conversation(other_user_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    convo = database.query(Conversations).filter(Conversations.user_1 == current_user.id, Conversations.user_2 == other_user_id).first()
    mirrored_convo = database.query(Conversations).filter(Conversations.user_1 == other_user_id, Conversations.user_2 == current_user.id).first()

    active_convo = convo or mirrored_convo

    if not active_convo:
        raise HTTPException(status_code= 404, detail= "No conversation found.")

    if active_convo.user_1 == current_user.id:
        active_convo.closed_by_user_1 = True
        database.commit()
    else:
        active_convo.closed_by_user_2 = True
        database.commit()


@router.post("/dm_request")
async def send_dm_request(body: Dm_request_in, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    if body.user_id == current_user.id:
        raise HTTPException(status_code=409, detail="Cannot request a DM with yourself.")
    target = database.query(UserInfo).filter(UserInfo.id == body.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    if blocked_either_way(database, current_user.id, target.id):
        raise HTTPException(status_code=400, detail="User is blocked.")
    if are_friends(database, current_user.id, target.id) or conversation_is_open(find_conversation(database, current_user.id, target.id)):
        raise HTTPException(status_code=409, detail="You can already message this user.")
    mode = dm_access_value(target)
    if mode == "open":
        raise HTTPException(status_code=409, detail="You can already message this user.")
    if mode == "closed":
        raise HTTPException(status_code=403, detail="This user is not accepting message requests.")
    existing = database.query(Message_request).filter(
        Message_request.sender_id == current_user.id,
        Message_request.receiver_id == target.id,
    ).first()
    if existing and existing.status == "pending":
        raise HTTPException(status_code=409, detail="A message request is already pending.")
    if existing:
        existing.status = "pending"
        existing.created_at = datetime.now()
        row = existing
    else:
        row = Message_request(sender_id=current_user.id, receiver_id=target.id, status="pending")
        database.add(row)
    database.commit()
    database.refresh(row)
    await notify_feed_alert(
        database,
        receiver_id=target.id,
        alert_type="dm_request",
        sender_id=current_user.id,
        alert_family="profile",
        force=True,
    )
    return {"ok": True, "status": "pending"}


@router.post("/dm_request/respond")
async def respond_dm_request(body: Dm_request_respond, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    row = pending_dm_request(database, body.user_id, current_user.id)
    if not row:
        raise HTTPException(status_code=404, detail="No pending message request.")
    sender = database.query(UserInfo).filter(UserInfo.id == row.sender_id).first()
    if not sender:
        raise HTTPException(status_code=404, detail="User not found.")
    if blocked_either_way(database, current_user.id, sender.id):
        raise HTTPException(status_code=400, detail="User is blocked.")
    drop_dm_request_alerts(database, current_user.id, sender.id)
    if not body.accept:
        row.status = "denied"
        database.commit()
        return {"ok": True, "accepted": False}
    row.status = "accepted"
    system = insert_system_dm(
        database,
        current_user,
        sender.id,
        current_user.username + " accepted your DM Request",
    )
    await notify_system_dm(current_user, sender.id, system)
    await notify_feed_alert(
        database,
        receiver_id=sender.id,
        alert_type="dm_request_accept",
        sender_id=current_user.id,
        alert_family="profile",
    )
    return {
        "ok": True,
        "accepted": True,
        "user_id": sender.id,
        "username": sender.username,
    }

