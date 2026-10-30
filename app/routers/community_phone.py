from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import (
    Community_phone_call,
    Community_phone_message,
    Community_phone_notice,
    Community_phone_wait,
    Friend_request,
    Message,
    UserInfo,
)
from app.privacy import are_friends, blocked_either_way
from app.r2 import attachment_public, require_message_body, store_attachment
from app.routers.messages import insert_system_dm, notify_system_dm, open_conversation
from app.routers.profile import public_avatar, public_display_name
from app.routers.realtime import notify_user

router = APIRouter()

PHONE_FIND_MINUTES = 5
PHONE_IDLE_MINUTES = 15
PHONE_FIND_FAIL = "User finder failed, no user found within 5 minutes."
PHONE_IDLE_END = "No activity within last 15 minutes."
PHONE_FRIEND_LINE = "You both connected via Phone a User."


def phone_end_line(user):
    return public_display_name(user) + " has ended the chat"


def phone_now():
    return datetime.now()


def active_phone_call(database, user_id):
    return database.query(Community_phone_call).filter(
        Community_phone_call.status == "active",
        (Community_phone_call.user_a == user_id) | (Community_phone_call.user_b == user_id),
    ).first()


def phone_side(call, user_id):
    return "a" if call.user_a == user_id else "b"


def phone_other_id(call, user_id):
    return call.user_b if call.user_a == user_id else call.user_a


def phone_badge(call, user_id):
    if not call or call.status != "active":
        return 0
    if phone_side(call, user_id) == "a":
        if call.unread_a:
            return int(call.unread_a)
        return 1 if call.ping_a else 0
    if call.unread_b:
        return int(call.unread_b)
    return 1 if call.ping_b else 0


def set_phone_notice(database, user_id, text):
    row = database.query(Community_phone_notice).filter(Community_phone_notice.user_id == user_id).first()
    if row:
        row.text = text
        return
    database.add(Community_phone_notice(user_id=user_id, text=text))


def clear_phone_notice(database, user_id):
    database.query(Community_phone_notice).filter(Community_phone_notice.user_id == user_id).delete(synchronize_session=False)


def phone_notice_text(database, user_id):
    row = database.query(Community_phone_notice).filter(Community_phone_notice.user_id == user_id).first()
    return row.text if row else ""


def drop_phone_messages(database, call_id):
    database.query(Community_phone_message).filter(Community_phone_message.call_id == call_id).delete(synchronize_session=False)


def finish_phone_call(database, call, kind, ended_by):
    if call.status != "active":
        return []
    call.status = "ended"
    drop_phone_messages(database, call.id)
    pair = (call.user_a, call.user_b)
    if kind == "idle":
        text = PHONE_IDLE_END
    else:
        actor = database.query(UserInfo).filter(UserInfo.id == ended_by).first()
        text = phone_end_line(actor) if actor else PHONE_IDLE_END
    for user_id in pair:
        set_phone_notice(database, user_id, text)
    database.delete(call)
    return list(pair)


def sweep_phone(database):
    now = phone_now()
    ended = []
    stale = database.query(Community_phone_wait).filter(
        Community_phone_wait.started_at <= now - timedelta(minutes=PHONE_FIND_MINUTES)
    ).all()
    for row in stale:
        set_phone_notice(database, row.user_id, PHONE_FIND_FAIL)
        ended.append({"user_id": row.user_id, "warning": PHONE_FIND_FAIL})
        database.delete(row)
    idle = database.query(Community_phone_call).filter(
        Community_phone_call.status == "active",
        Community_phone_call.active_at <= now - timedelta(minutes=PHONE_IDLE_MINUTES),
    ).all()
    for call in idle:
        for user_id in finish_phone_call(database, call, "idle", None):
            ended.append({"user_id": user_id, "warning": PHONE_IDLE_END})
    return ended


async def push_phone_ends(events):
    seen = set()
    for event in events:
        key = (event["user_id"], event["warning"])
        if key in seen:
            continue
        seen.add(key)
        await notify_user(event["user_id"], {"type": "phone_ended", "warning": event["warning"]})


def phone_friend_note(database, me, other):
    if not other:
        return ""
    incoming = database.query(Friend_request).filter(
        Friend_request.user_1 == other.id,
        Friend_request.user_2 == me.id,
        Friend_request.pending == True,
    ).first()
    if incoming:
        return public_display_name(other) + " has sent a friend request."
    outgoing = database.query(Friend_request).filter(
        Friend_request.user_1 == me.id,
        Friend_request.user_2 == other.id,
        Friend_request.pending == True,
    ).first()
    if outgoing:
        return "Friend request sent."
    return ""


def partner_pack(user):
    if not user:
        return None
    return {
        "id": user.id,
        "username": user.username,
        "display_name": public_display_name(user),
        "avatar": public_avatar(user),
    }


def pack_phone_message(database, row, viewer_id):
    author = database.query(UserInfo).filter(UserInfo.id == row.author_id).first()
    reply_to = None
    if row.reply_to_id:
        parent = database.query(Community_phone_message).filter(
            Community_phone_message.id == row.reply_to_id,
            Community_phone_message.call_id == row.call_id,
        ).first()
        if parent:
            parent_author = database.query(UserInfo).filter(UserInfo.id == parent.author_id).first()
            reply_to = {
                "id": parent.id,
                "sender_id": parent.author_id,
                "username": parent_author.username if parent_author else "",
                "content": parent.content or "",
            }
    return {
        "id": row.id,
        "sender_id": row.author_id,
        "username": author.username if author else "",
        "display_name": public_display_name(author) if author else "",
        "content": row.content or "",
        "attachment": attachment_public(row.attachment),
        "timestamp": str(row.created_at),
        "avatar": public_avatar(author) if author else None,
        "reply_to": reply_to,
        "mine": row.author_id == viewer_id,
    }


def pack_phone_state(database, user):
    call = active_phone_call(database, user.id)
    waiting = database.query(Community_phone_wait).filter(Community_phone_wait.user_id == user.id).first()
    payload = {
        "waiting": bool(waiting) and not call,
        "warning": "" if call else phone_notice_text(database, user.id),
        "unread": phone_badge(call, user.id),
        "started_at": str(waiting.started_at) if waiting and not call else None,
        "call": None,
    }
    if not call:
        return payload
    other = database.query(UserInfo).filter(UserInfo.id == phone_other_id(call, user.id)).first()
    rows = database.query(Community_phone_message).filter(
        Community_phone_message.call_id == call.id
    ).order_by(Community_phone_message.id.asc()).all()
    payload["call"] = {
        "id": call.id,
        "active_at": str(call.active_at),
        "partner": partner_pack(other),
        "friend_note": phone_friend_note(database, user, other),
        "messages": [pack_phone_message(database, row, user.id) for row in rows],
    }
    return payload


async def open_friend_dm(database, actor, other):
    system = insert_system_dm(database, actor, other.id, PHONE_FRIEND_LINE)
    await notify_system_dm(actor, other.id, system)
    pack_a = partner_pack(other)
    pack_b = partner_pack(actor)
    await notify_user(actor.id, {"type": "phone_open", "partner": pack_a})
    await notify_user(other.id, {"type": "phone_open", "partner": pack_b})


def copy_phone_transcript(database, call):
    rows = database.query(Community_phone_message).filter(
        Community_phone_message.call_id == call.id
    ).order_by(Community_phone_message.id.asc()).all()
    open_conversation(database, call.user_a, call.user_b)
    mapped = []
    id_map = {}
    for row in rows:
        receiver_id = call.user_b if row.author_id == call.user_a else call.user_a
        message = Message(
            sender_id=row.author_id,
            receiver_id=receiver_id,
            content=row.content or "",
            attachment=row.attachment,
            timestamp=row.created_at,
            read=row.author_id == receiver_id,
        )
        database.add(message)
        database.flush()
        id_map[row.id] = message.id
        mapped.append((row, message))
    for row, message in mapped:
        if row.reply_to_id and row.reply_to_id in id_map:
            message.reply_to_id = id_map[row.reply_to_id]
    drop_phone_messages(database, call.id)
    clear_phone_notice(database, call.user_a)
    clear_phone_notice(database, call.user_b)
    database.delete(call)
    database.commit()


async def transfer_phone_chat(database, actor, other):
    call = active_phone_call(database, actor.id)
    if not call or phone_other_id(call, actor.id) != other.id:
        call = active_phone_call(database, other.id)
        if not call or phone_other_id(call, other.id) != actor.id:
            return
    copy_phone_transcript(database, call)
    await notify_user(actor.id, {"type": "phone_moved", "partner": partner_pack(other)})
    await notify_user(other.id, {"type": "phone_moved", "partner": partner_pack(actor)})


async def end_phone_for_logout(database, user_id):
    database.query(Community_phone_wait).filter(Community_phone_wait.user_id == user_id).delete(synchronize_session=False)
    call = active_phone_call(database, user_id)
    events = []
    if call:
        user = database.query(UserInfo).filter(UserInfo.id == user_id).first()
        text = phone_end_line(user) if user else PHONE_IDLE_END
        finish_phone_call(database, call, "user", user_id)
        events = [
            {"user_id": call.user_a, "warning": text},
            {"user_id": call.user_b, "warning": text},
        ]
    database.commit()
    await push_phone_ends(events)


@router.get("/community_phone")
async def get_community_phone(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    events = sweep_phone(database)
    database.commit()
    await push_phone_ends(events)
    return pack_phone_state(database, current_user)


@router.post("/community_phone/find")
async def find_community_phone(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    events = sweep_phone(database)
    database.commit()
    await push_phone_ends(events)
    if active_phone_call(database, current_user.id):
        return pack_phone_state(database, current_user)
    if database.query(Community_phone_wait).filter(Community_phone_wait.user_id == current_user.id).first():
        return pack_phone_state(database, current_user)
    clear_phone_notice(database, current_user.id)
    waits = database.query(Community_phone_wait).filter(
        Community_phone_wait.user_id != current_user.id
    ).order_by(Community_phone_wait.started_at.asc(), Community_phone_wait.user_id.asc()).all()
    for wait in waits:
        other = database.query(UserInfo).filter(UserInfo.id == wait.user_id).first()
        if not other or blocked_either_way(database, current_user.id, other.id):
            continue
        if active_phone_call(database, other.id):
            database.delete(wait)
            continue
        removed = database.query(Community_phone_wait).filter(
            Community_phone_wait.user_id == other.id
        ).delete(synchronize_session=False)
        if not removed:
            continue
        database.query(Community_phone_wait).filter(
            Community_phone_wait.user_id == current_user.id
        ).delete(synchronize_session=False)
        if are_friends(database, current_user.id, other.id):
            database.commit()
            await open_friend_dm(database, current_user, other)
            return pack_phone_state(database, current_user)
        now = phone_now()
        call = Community_phone_call(
            user_a=other.id,
            user_b=current_user.id,
            started_at=now,
            active_at=now,
            status="active",
            ping_a=True,
            ping_b=True,
            unread_a=0,
            unread_b=0,
        )
        database.add(call)
        database.commit()
        database.refresh(call)
        await notify_user(other.id, {"type": "phone_matched", "call_id": call.id})
        await notify_user(current_user.id, {"type": "phone_matched", "call_id": call.id})
        return pack_phone_state(database, current_user)
    database.add(Community_phone_wait(user_id=current_user.id, started_at=phone_now()))
    database.commit()
    return pack_phone_state(database, current_user)


@router.post("/community_phone/end")
async def end_community_phone(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    call = active_phone_call(database, current_user.id)
    if not call:
        raise HTTPException(status_code=404, detail="No chat is open.")
    text = phone_end_line(current_user)
    finish_phone_call(database, call, "user", current_user.id)
    database.commit()
    await push_phone_ends([
        {"user_id": call.user_a, "warning": text},
        {"user_id": call.user_b, "warning": text},
    ])
    return pack_phone_state(database, current_user)


@router.post("/community_phone/seen")
def see_community_phone(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    call = active_phone_call(database, current_user.id)
    if call:
        if phone_side(call, current_user.id) == "a":
            call.ping_a = False
            call.unread_a = 0
        else:
            call.ping_b = False
            call.unread_b = 0
        database.commit()
    return {"unread": phone_badge(call, current_user.id) if call else 0}


def save_community_phone_message(database, current_user, content, attachment, reply_to_id):
    call = active_phone_call(database, current_user.id)
    if not call:
        raise HTTPException(status_code=404, detail="No chat is open.")
    require_message_body(content, attachment)
    stored = store_attachment(attachment, current_user)
    parent_id = None
    if reply_to_id:
        try:
            parent_key = int(reply_to_id)
        except (TypeError, ValueError):
            parent_key = None
        if parent_key:
            parent = database.query(Community_phone_message).filter(
                Community_phone_message.id == parent_key,
                Community_phone_message.call_id == call.id,
            ).first()
            if parent:
                parent_id = parent.id
    row = Community_phone_message(
        call_id=call.id,
        author_id=current_user.id,
        content=content or "",
        attachment=stored,
        reply_to_id=parent_id,
        created_at=phone_now(),
    )
    other_id = phone_other_id(call, current_user.id)
    if phone_side(call, other_id) == "a":
        call.unread_a = int(call.unread_a or 0) + 1
        call.ping_a = False
    else:
        call.unread_b = int(call.unread_b or 0) + 1
        call.ping_b = False
    call.active_at = row.created_at
    database.add(row)
    database.commit()
    database.refresh(row)
    return row


async def fanout_phone_message(database, row, current_user):
    call = database.query(Community_phone_call).filter(Community_phone_call.id == row.call_id).first()
    if not call:
        return
    other_id = phone_other_id(call, current_user.id)
    payload = pack_phone_message(database, row, other_id)
    payload["type"] = "phone_message"
    payload["call_id"] = call.id
    payload["unread"] = phone_badge(call, other_id)
    await notify_user(other_id, payload)
