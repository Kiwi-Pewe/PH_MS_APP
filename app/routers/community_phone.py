from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import (
    Community_edge,
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
from app.routers.community_posts import COMMUNITY_FILTER_MAX, clean_filter_label
from app.routers.feed import notify_feed_alert
from app.routers.messages import insert_system_dm, notify_system_dm, open_conversation
from app.routers.profile import public_avatar, public_display_name
from app.routers.realtime import notify_user
from app.schemas import Block_schema, Community_filter_entry, Community_phone_prefs, Community_phone_topic

router = APIRouter()

PHONE_FIND_MINUTES = 5
PHONE_IDLE_MINUTES = 15
PHONE_TOPIC_SECONDS = 60
PHONE_TOPIC_MAX = 5
PHONE_FIND_FAIL = "User finder failed, no user found within 5 minutes."
PHONE_IDLE_END = "No activity within last 15 minutes."
PHONE_FRIEND_LINE = "You both connected via Phone a User."
PHONE_CALLER = "Caller"
PHONE_HIDDEN_ID = -1
PHONE_TOPIC_KIND = "phone_topic"
PHONE_WORD_KIND = "phone_word"
PHONE_PREF_KIND = "phone_pref"
PHONE_SOUNDS = ("all", "off")
PHONE_PREF_FLAGS = {
    "show_profile": False,
    "allow_friend": True,
    "match_sound": True,
    "unread_count": True,
    "cover_media": False,
    "confirm_end": False,
    "auto_find": False,
}


def load_phone_prefs(database, user_id):
    found = {"words": [], "message_sound": "all"}
    found.update(PHONE_PREF_FLAGS)
    if not user_id:
        return found
    rows = database.query(Community_edge).filter(
        Community_edge.user_id == user_id,
        Community_edge.kind.in_((PHONE_WORD_KIND, PHONE_PREF_KIND)),
    ).order_by(Community_edge.created_at.asc(), Community_edge.id.asc()).all()
    for edge in rows:
        if edge.kind == PHONE_WORD_KIND and edge.label:
            found["words"].append(edge.label)
        elif edge.kind == PHONE_PREF_KIND:
            if edge.label == "message_sound" and edge.mode in PHONE_SOUNDS:
                found["message_sound"] = edge.mode
            elif edge.label in PHONE_PREF_FLAGS:
                found[edge.label] = edge.mode == "on"
    return found


def phone_pref_on(database, user_id, label):
    edge = database.query(Community_edge).filter(
        Community_edge.user_id == user_id,
        Community_edge.kind == PHONE_PREF_KIND,
        Community_edge.target_id == 0,
        Community_edge.label == label,
    ).first()
    if not edge:
        return PHONE_PREF_FLAGS.get(label, False)
    return edge.mode == "on"


def phone_shown(database, user_id):
    return phone_pref_on(database, user_id, "show_profile")


def phone_topic_rows(database, user_id):
    return database.query(Community_edge).filter(
        Community_edge.user_id == user_id,
        Community_edge.kind == PHONE_TOPIC_KIND,
    ).order_by(Community_edge.created_at.asc(), Community_edge.id.asc()).all()


def phone_topic_keys(database, user_id):
    return {edge.label for edge in phone_topic_rows(database, user_id) if edge.label}


def phone_name(database, user, viewer_id=None):
    if not user:
        return PHONE_CALLER
    if user.id != viewer_id and not phone_shown(database, user.id):
        return PHONE_CALLER
    return public_display_name(user)


def phone_end_line(database, user):
    return phone_name(database, user) + " has ended the chat"


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


def drop_phone_requests(database, user_a, user_b):
    database.query(Friend_request).filter(
        Friend_request.pending == True,
        Friend_request.from_phone.is_(True),
        or_(
            and_(Friend_request.user_1 == user_a, Friend_request.user_2 == user_b),
            and_(Friend_request.user_1 == user_b, Friend_request.user_2 == user_a),
        ),
    ).delete(synchronize_session=False)


def phone_request(database, sender_id, receiver_id):
    return database.query(Friend_request).filter(
        Friend_request.user_1 == sender_id,
        Friend_request.user_2 == receiver_id,
        Friend_request.pending == True,
    ).first()


def drop_phone_messages(database, call_id):
    database.query(Community_phone_message).filter(Community_phone_message.call_id == call_id).delete(synchronize_session=False)


def finish_phone_call(database, call, kind, ended_by):
    if call.status != "active":
        return []
    call.status = "ended"
    drop_phone_messages(database, call.id)
    drop_phone_requests(database, call.user_a, call.user_b)
    pair = (call.user_a, call.user_b)
    if kind == "idle":
        text = PHONE_IDLE_END
    else:
        actor = database.query(UserInfo).filter(UserInfo.id == ended_by).first()
        text = phone_end_line(database, actor) if actor else PHONE_IDLE_END
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


def phone_friend_state(database, me, other):
    if not other:
        return ""
    if phone_request(database, other.id, me.id):
        return "in"
    if phone_request(database, me.id, other.id):
        return "out"
    return ""


def phone_friend_note(database, me, other):
    state = phone_friend_state(database, me, other)
    if state == "in":
        return phone_name(database, other, me.id) + " has sent a friend request."
    if state == "out":
        return "Friend request sent."
    return ""


def partner_pack(user, shown=True):
    if not user:
        return None
    if not shown:
        return {"id": PHONE_HIDDEN_ID, "username": "", "display_name": PHONE_CALLER, "avatar": None, "hidden": True}
    return {
        "id": user.id,
        "username": user.username,
        "display_name": public_display_name(user),
        "avatar": public_avatar(user),
        "hidden": False,
    }


def phone_face(database, author, viewer_id, cache):
    if not author:
        return {"id": PHONE_HIDDEN_ID, "username": "", "display_name": PHONE_CALLER, "avatar": None}
    if author.id not in cache:
        cache[author.id] = author.id == viewer_id or phone_shown(database, author.id)
    if not cache[author.id]:
        return {"id": PHONE_HIDDEN_ID, "username": "", "display_name": PHONE_CALLER, "avatar": None}
    return {"id": author.id, "username": author.username, "display_name": public_display_name(author), "avatar": public_avatar(author)}


def pack_phone_message(database, row, viewer_id, cache=None):
    cache = {} if cache is None else cache
    author = database.query(UserInfo).filter(UserInfo.id == row.author_id).first()
    face = phone_face(database, author, viewer_id, cache)
    reply_to = None
    if row.reply_to_id:
        parent = database.query(Community_phone_message).filter(
            Community_phone_message.id == row.reply_to_id,
            Community_phone_message.call_id == row.call_id,
        ).first()
        if parent:
            parent_author = database.query(UserInfo).filter(UserInfo.id == parent.author_id).first()
            parent_face = phone_face(database, parent_author, viewer_id, cache)
            reply_to = {
                "id": parent.id,
                "sender_id": parent_face["id"],
                "username": parent_face["username"] or parent_face["display_name"],
                "content": parent.content or "",
            }
    return {
        "id": row.id,
        "sender_id": face["id"],
        "username": face["username"],
        "display_name": face["display_name"],
        "content": row.content or "",
        "attachment": attachment_public(row.attachment),
        "timestamp": str(row.created_at),
        "avatar": face["avatar"],
        "reply_to": reply_to,
        "mine": row.author_id == viewer_id,
    }


def phone_shared_topics(database, me_id, other_id):
    theirs = phone_topic_keys(database, other_id)
    if not theirs:
        return []
    return [edge.mode or edge.label for edge in phone_topic_rows(database, me_id) if edge.label in theirs]


def pack_phone_state(database, user):
    call = active_phone_call(database, user.id)
    waiting = database.query(Community_phone_wait).filter(Community_phone_wait.user_id == user.id).first()
    payload = {
        "waiting": bool(waiting) and not call,
        "warning": "" if call else phone_notice_text(database, user.id),
        "unread": phone_badge(call, user.id),
        "started_at": str(waiting.started_at) if waiting and not call else None,
        "topics": [edge.mode or edge.label for edge in phone_topic_rows(database, user.id)],
        "prefs": load_phone_prefs(database, user.id),
        "call": None,
    }
    if not call:
        return payload
    other = database.query(UserInfo).filter(UserInfo.id == phone_other_id(call, user.id)).first()
    rows = database.query(Community_phone_message).filter(
        Community_phone_message.call_id == call.id
    ).order_by(Community_phone_message.id.asc()).all()
    cache = {}
    payload["call"] = {
        "id": call.id,
        "active_at": str(call.active_at),
        "partner": partner_pack(other, bool(other) and phone_shown(database, other.id)),
        "friend_note": phone_friend_note(database, user, other),
        "friend_state": phone_friend_state(database, user, other),
        "shared_topics": phone_shared_topics(database, user.id, other.id) if other else [],
        "messages": [pack_phone_message(database, row, user.id, cache) for row in rows],
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
        text = phone_end_line(database, user) if user else PHONE_IDLE_END
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
    if await pair_community_phone(database, current_user, False):
        return pack_phone_state(database, current_user)
    database.add(Community_phone_wait(user_id=current_user.id, started_at=phone_now()))
    database.commit()
    return pack_phone_state(database, current_user)


@router.post("/community_phone/widen")
async def widen_community_phone(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    events = sweep_phone(database)
    database.commit()
    await push_phone_ends(events)
    if active_phone_call(database, current_user.id):
        return pack_phone_state(database, current_user)
    wait = database.query(Community_phone_wait).filter(Community_phone_wait.user_id == current_user.id).first()
    if not wait or wait.started_at > phone_now() - timedelta(seconds=PHONE_TOPIC_SECONDS - 5):
        return pack_phone_state(database, current_user)
    await pair_community_phone(database, current_user, True)
    return pack_phone_state(database, current_user)


def phone_can_pair(my_keys, my_open, other_keys, other_open):
    if my_keys & other_keys:
        return True
    return (not my_keys or my_open) and (not other_keys or other_open)


async def pair_community_phone(database, current_user, my_open):
    now = phone_now()
    my_keys = phone_topic_keys(database, current_user.id)
    waits = database.query(Community_phone_wait).filter(
        Community_phone_wait.user_id != current_user.id
    ).order_by(Community_phone_wait.started_at.asc(), Community_phone_wait.user_id.asc()).all()
    shared = []
    loose = []
    for wait in waits:
        other_keys = phone_topic_keys(database, wait.user_id)
        other_open = wait.started_at <= now - timedelta(seconds=PHONE_TOPIC_SECONDS)
        if not phone_can_pair(my_keys, my_open, other_keys, other_open):
            continue
        if my_keys & other_keys:
            shared.append(wait)
        else:
            loose.append(wait)
    for wait in shared + loose:
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
            return True
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
        return True
    return False


@router.post("/community_phone/cancel")
async def cancel_community_phone(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    if active_phone_call(database, current_user.id):
        return pack_phone_state(database, current_user)
    database.query(Community_phone_wait).filter(Community_phone_wait.user_id == current_user.id).delete(synchronize_session=False)
    database.commit()
    return pack_phone_state(database, current_user)


@router.post("/community_phone/dismiss")
def dismiss_community_phone(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    clear_phone_notice(database, current_user.id)
    database.commit()
    return pack_phone_state(database, current_user)


@router.post("/community_phone/end")
async def end_community_phone(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    call = active_phone_call(database, current_user.id)
    if not call:
        raise HTTPException(status_code=404, detail="No chat is open.")
    text = phone_end_line(database, current_user)
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


def phone_partner_or_404(database, current_user):
    call = active_phone_call(database, current_user.id)
    if not call:
        raise HTTPException(status_code=404, detail="No chat is open.")
    other = database.query(UserInfo).filter(UserInfo.id == phone_other_id(call, current_user.id)).first()
    if not other:
        raise HTTPException(status_code=404, detail="No chat is open.")
    return call, other


@router.post("/community_phone/friend")
async def phone_friend_request(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    call, other = phone_partner_or_404(database, current_user)
    if blocked_either_way(database, current_user.id, other.id):
        raise HTTPException(status_code=400, detail="You cannot send a friend request here.")
    if are_friends(database, current_user.id, other.id):
        return pack_phone_state(database, current_user)
    if phone_request(database, other.id, current_user.id):
        return await phone_friend_accept(database, current_user)
    if phone_request(database, current_user.id, other.id):
        return pack_phone_state(database, current_user)
    if not phone_pref_on(database, other.id, "allow_friend"):
        raise HTTPException(status_code=403, detail=phone_name(database, other, current_user.id) + " is not accepting friend requests.")
    database.query(Friend_request).filter(
        Friend_request.user_1 == current_user.id,
        Friend_request.user_2 == other.id,
    ).delete(synchronize_session=False)
    database.add(Friend_request(user_1=current_user.id, user_2=other.id, pending=True, from_phone=True))
    database.commit()
    await notify_user(other.id, {"type": "phone_friend", "call_id": call.id, "incoming": True})
    return pack_phone_state(database, current_user)


@router.post("/community_phone/friend/accept")
async def accept_phone_friend(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    return await phone_friend_accept(database, current_user)


async def phone_friend_accept(database, current_user):
    call, other = phone_partner_or_404(database, current_user)
    request = phone_request(database, other.id, current_user.id)
    if not request:
        raise HTTPException(status_code=404, detail="No friend request to accept.")
    request.pending = False
    request.from_phone = False
    database.commit()
    await transfer_phone_chat(database, current_user, other)
    await notify_feed_alert(
        database,
        receiver_id=other.id,
        alert_type="friend_accept",
        sender_id=current_user.id,
        alert_family="profile",
    )
    return pack_phone_state(database, current_user)


@router.post("/community_phone/friend/decline")
async def decline_phone_friend(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    call, other = phone_partner_or_404(database, current_user)
    database.query(Friend_request).filter(
        Friend_request.user_1 == other.id,
        Friend_request.user_2 == current_user.id,
        Friend_request.pending == True,
    ).delete(synchronize_session=False)
    database.commit()
    await notify_user(other.id, {"type": "phone_friend", "call_id": call.id, "incoming": False})
    return pack_phone_state(database, current_user)


@router.post("/community_phone/block")
async def block_phone_partner(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    from app.routers.friends import block_account
    call, other = phone_partner_or_404(database, current_user)
    text = phone_end_line(database, current_user)
    finish_phone_call(database, call, "user", current_user.id)
    database.commit()
    if not blocked_either_way(database, current_user.id, other.id):
        await block_account(Block_schema(blocked_user=other.id), database=database, current_user=current_user)
    await push_phone_ends([
        {"user_id": call.user_a, "warning": text},
        {"user_id": call.user_b, "warning": text},
    ])
    return pack_phone_state(database, current_user)


@router.post("/community_phone/topics")
def add_phone_topic(
    body: Community_phone_topic,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    phone_topics_unlocked(database, current_user)
    display = " ".join(str(body.label or "").split())[:40].rstrip()
    label = clean_filter_label(display)
    if not label:
        raise HTTPException(status_code=400, detail="Type a topic first.")
    rows = phone_topic_rows(database, current_user.id)
    if not any(edge.label == label for edge in rows):
        if len(rows) >= PHONE_TOPIC_MAX:
            raise HTTPException(status_code=400, detail="You can choose up to 5 topics.")
        database.add(Community_edge(user_id=current_user.id, kind=PHONE_TOPIC_KIND, target_id=0, label=label, mode=display))
        database.commit()
    return pack_phone_state(database, current_user)


@router.delete("/community_phone/topics")
def remove_phone_topic(
    body: Community_phone_topic,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    phone_topics_unlocked(database, current_user)
    label = clean_filter_label(body.label)
    database.query(Community_edge).filter(
        Community_edge.user_id == current_user.id,
        Community_edge.kind == PHONE_TOPIC_KIND,
        Community_edge.label == label,
    ).delete(synchronize_session=False)
    database.commit()
    return pack_phone_state(database, current_user)


def phone_topics_unlocked(database, current_user):
    if active_phone_call(database, current_user.id):
        raise HTTPException(status_code=400, detail="Topics can't change during a chat.")
    if database.query(Community_phone_wait).filter(Community_phone_wait.user_id == current_user.id).first():
        raise HTTPException(status_code=400, detail="Topics can't change while searching.")


def save_phone_pref(database, user_id, label, mode):
    edge = database.query(Community_edge).filter(
        Community_edge.user_id == user_id,
        Community_edge.kind == PHONE_PREF_KIND,
        Community_edge.target_id == 0,
        Community_edge.label == label,
    ).first()
    if edge:
        edge.mode = mode
    else:
        database.add(Community_edge(user_id=user_id, kind=PHONE_PREF_KIND, target_id=0, label=label, mode=mode))


@router.get("/community_phone_settings")
def get_phone_settings(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    return load_phone_prefs(database, current_user.id)


@router.patch("/community_phone_settings")
def update_phone_settings(
    body: Community_phone_prefs,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    if body.message_sound is not None:
        sound = str(body.message_sound).strip().lower()
        if sound not in PHONE_SOUNDS:
            raise HTTPException(status_code=400, detail="Unknown sound setting.")
        save_phone_pref(database, current_user.id, "message_sound", sound)
    for label in PHONE_PREF_FLAGS:
        value = getattr(body, label, None)
        if value is not None:
            save_phone_pref(database, current_user.id, label, "on" if value else "off")
    database.commit()
    return load_phone_prefs(database, current_user.id)


@router.post("/community_phone_settings/filters")
def add_phone_filter(
    body: Community_filter_entry,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    label = clean_filter_label(body.label)
    if not label:
        raise HTTPException(status_code=400, detail="Type something first.")
    exists = database.query(Community_edge).filter(
        Community_edge.user_id == current_user.id,
        Community_edge.kind == PHONE_WORD_KIND,
        Community_edge.target_id == 0,
        Community_edge.label == label,
    ).first()
    if not exists:
        count = database.query(func.count(Community_edge.id)).filter(
            Community_edge.user_id == current_user.id,
            Community_edge.kind == PHONE_WORD_KIND,
        ).scalar() or 0
        if count >= COMMUNITY_FILTER_MAX:
            raise HTTPException(status_code=400, detail="This list is full.")
        database.add(Community_edge(user_id=current_user.id, kind=PHONE_WORD_KIND, target_id=0, label=label))
        database.commit()
    return load_phone_prefs(database, current_user.id)


@router.delete("/community_phone_settings/filters")
def remove_phone_filter(
    body: Community_filter_entry,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    label = clean_filter_label(body.label)
    database.query(Community_edge).filter(
        Community_edge.user_id == current_user.id,
        Community_edge.kind == PHONE_WORD_KIND,
        Community_edge.target_id == 0,
        Community_edge.label == label,
    ).delete(synchronize_session=False)
    database.commit()
    return load_phone_prefs(database, current_user.id)
