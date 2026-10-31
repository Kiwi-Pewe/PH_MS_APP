import json
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Community_edge, Community_room, Community_room_member, Community_room_message, Message_mention, UserInfo
from app.privacy import blocked_user_ids, drop_blocked_rows
from app.routers.community_posts import (
    COMMUNITY_FILTER_MAX,
    clean_filter_label,
    community_has_match,
    community_mentions_any,
    community_search_on,
    community_search_account,
    community_search_has,
    community_topic_hit,
)
from app.routers.messages import mute_is_active, mute_public, mute_until_for
from app.r2 import attachment_public, require_message_body, store_attachment
from app.routers.mentions import (
    accepted_reply_parent,
    apply_room_mentions,
    decorate_history,
    live_reply_to,
    mention_user_map,
    mentioned_user_ids,
    reply_map_for,
)
from app.routers.profile import avatar_lookup, public_avatar
from app.routers.realtime import notify_user, serialize_member
from app.schemas import Community_filter_entry, Community_room_create, Community_room_hide, Community_room_prefs, Conversation_mute_in
from app.site_moderation import mask_message_payloads

router = APIRouter()

COMMUNITY_ROOM_NAME_MAX = 15
COMMUNITY_ROOM_OWN_MAX = 3
ROOM_NAME_BLOCKED = "Room name cannnot but used."
COMMUNITY_ROOM_ABOUT_MAX = 500
COMMUNITY_ROOM_TOPIC_MAX = 3
COMMUNITY_ROOM_TOPIC_LEN = 40
COMMUNITY_ROOM_CAP = 15
COMMUNITY_ROOM_PAGE = 25
COMMUNITY_ROOM_JOIN_MAX = 5
ROOM_JOIN_FULL = "You can only be in 5 rooms at once."
ROOM_FILTER_KINDS = {"word": "room_word", "topic": "room_topic"}
ROOM_PREF_KIND = "room_pref"
ROOM_HIDDEN_KIND = "room_hidden"
ROOM_MUTE_KIND = "room_mute"
ROOM_SORTS = ("newest", "active", "most", "fewest")
ROOM_SOUNDS = ("all", "mentions", "off")
ROOM_PREF_FLAGS = {
    "blacklist_hide": False,
    "hide_full": False,
    "hide_joined": False,
    "unread_counts": False,
    "cover_media": False,
    "allow_mentions": True,
    "show_members": True,
    "confirm_leave": False,
}


def clean_room_name(value):
    name = " ".join(str(value or "").split())
    if not name:
        raise HTTPException(status_code=400, detail="Name the room.")
    if len(name) > COMMUNITY_ROOM_NAME_MAX:
        raise HTTPException(status_code=400, detail="Room names can be 15 characters.")
    return name


def room_name_blocklist(database):
    try:
        words = load_room_name_blocklist(database)
    except Exception:
        return []
    if not words:
        return []
    cleaned = []
    for item in words:
        word = " ".join(str(item or "").split()).casefold()
        if word:
            cleaned.append(word)
    return cleaned


def load_room_name_blocklist(database):
    return []


def room_name_is_blocked(name, database, words=None):
    source = room_name_blocklist(database) if words is None else words
    if not source:
        return False
    folded = " ".join(str(name or "").split()).casefold()
    if not folded:
        return False
    for item in source:
        word = " ".join(str(item or "").split()).casefold()
        if word and word in folded:
            return True
    return False


def raise_if_room_name_blocked(name, database):
    if room_name_is_blocked(name, database):
        raise HTTPException(status_code=400, detail=ROOM_NAME_BLOCKED)


def clean_room_about(value):
    text = str(value or "").replace("\r\n", "\n").replace("\r", "\n")
    text = "\n".join(line.rstrip() for line in text.split("\n")).strip()
    if len(text) > COMMUNITY_ROOM_ABOUT_MAX:
        text = text[:COMMUNITY_ROOM_ABOUT_MAX].rstrip()
    return text or None


def clean_room_topics(raw):
    topics = []
    seen = set()
    for item in raw or []:
        word = " ".join(str(item or "").split())
        if len(word) > COMMUNITY_ROOM_TOPIC_LEN:
            word = word[:COMMUNITY_ROOM_TOPIC_LEN].rstrip()
        if not word:
            continue
        key = word.lower()
        if key in seen:
            continue
        seen.add(key)
        topics.append(word)
        if len(topics) >= COMMUNITY_ROOM_TOPIC_MAX:
            break
    return topics


def room_topics(raw):
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item) for item in parsed if str(item or "").strip()]


def room_people(database, user_ids):
    ids = [item for item in set(user_ids) if item]
    if not ids:
        return {}
    rows = database.query(UserInfo).filter(UserInfo.id.in_(ids)).all()
    return {row.id: (row.username or "") for row in rows}


def member_counts(database, room_ids):
    ids = [item for item in room_ids if item]
    if not ids:
        return {}
    rows = (
        database.query(Community_room_member.room_id, func.count(Community_room_member.id))
        .filter(Community_room_member.room_id.in_(ids))
        .group_by(Community_room_member.room_id)
        .all()
    )
    return {room_id: count for room_id, count in rows}


def joined_room_ids(database, user_id, room_ids):
    ids = [item for item in room_ids if item]
    if not ids or not user_id:
        return set()
    rows = database.query(Community_room_member.room_id).filter(
        Community_room_member.user_id == user_id,
        Community_room_member.room_id.in_(ids),
    ).all()
    return {room_id for (room_id,) in rows}


def pack_community_room(row, viewer_id, people, counts, joined):
    return {
        "id": row.id,
        "name": row.name or "",
        "about": row.about or "",
        "topics": room_topics(row.topics),
        "handle": people.get(row.owner_id) or "",
        "owned": row.owner_id == viewer_id,
        "joined": row.id in joined,
        "n": int(counts.get(row.id, 0)),
        "created_at": str(row.created_at) if row.created_at else "",
        "active_at": str(row.active_at) if row.active_at else "",
    }


def pack_community_rooms(database, rows, viewer_id):
    ids = [row.id for row in rows]
    people = room_people(database, [row.owner_id for row in rows])
    counts = member_counts(database, ids)
    joined = joined_room_ids(database, viewer_id, ids)
    return [pack_community_room(row, viewer_id, people, counts, joined) for row in rows]


def community_room_text_hit(row, messages, needle, blocked):
    query = str(needle or "").strip().lower()
    if not query:
        return True
    fields = [row.name or "", row.about or ""]
    fields.extend(room_topics(row.topics))
    if any(query in str(field).lower() for field in fields):
        return True
    for message in messages:
        if message.author_id in blocked:
            continue
        if query in str(message.content or "").lower():
            return True
    return False


@router.get("/community_rooms")
def list_community_rooms(
    q: str = "",
    author: str = "",
    mentions: str = "",
    topic: str = "",
    has: list[str] = Query(default=[]),
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    rows = drop_blocked_rows(
        database,
        current_user.id,
        database.query(Community_room).order_by(Community_room.created_at.desc(), Community_room.id.desc()).all(),
        "owner_id",
    )
    kinds = community_search_has(has)
    if not community_search_on(q, author, mentions, topic, kinds):
        return {"rooms": pack_community_rooms(database, rows, current_user.id)}
    author_name = str(author or "").strip()
    mention_name = str(mentions or "").strip()
    author_account = community_search_account(database, author_name) if author_name else None
    mention_account = community_search_account(database, mention_name) if mention_name else None
    if (author_name and author_account is None) or (mention_name and mention_account is None):
        return {"rooms": []}
    if author_account is not None:
        rows = [row for row in rows if row.owner_id == author_account.id]
    blocked = blocked_user_ids(database, current_user.id)
    messages_by_room = {}
    if rows and (str(q or "").strip() or mention_account is not None or kinds):
        found = database.query(Community_room_message).filter(
            Community_room_message.room_id.in_([row.id for row in rows])
        ).all()
        for message in found:
            messages_by_room.setdefault(message.room_id, []).append(message)
    kept = []
    for row in rows:
        messages = messages_by_room.get(row.id, [])
        visible = [message for message in messages if message.author_id not in blocked]
        if not community_topic_hit(row.topics, topic):
            continue
        if not community_has_match(
            [row.about] + [message.content for message in visible],
            [message.attachment for message in visible],
            kinds,
        ):
            continue
        if not community_mentions_any([row.about] + [message.content for message in visible], mention_account):
            continue
        if not community_room_text_hit(row, messages, q, blocked):
            continue
        kept.append(row)
    return {"rooms": pack_community_rooms(database, kept, current_user.id)}


@router.post("/community_rooms")
def create_community_room(
    body: Community_room_create,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    owned = database.query(func.count(Community_room.id)).filter(Community_room.owner_id == current_user.id).scalar() or 0
    if owned >= COMMUNITY_ROOM_OWN_MAX:
        raise HTTPException(status_code=400, detail="You can only own 3 rooms.")
    if joined_room_total(database, current_user.id) >= COMMUNITY_ROOM_JOIN_MAX:
        raise HTTPException(status_code=400, detail=ROOM_JOIN_FULL)
    name = clean_room_name(body.name)
    raise_if_room_name_blocked(name, database)
    topics = clean_room_topics(body.topics)
    row = Community_room(
        owner_id=current_user.id,
        name=name,
        about=clean_room_about(body.about),
        topics=json.dumps(topics) if topics else None,
    )
    database.add(row)
    database.flush()
    database.add(Community_room_member(room_id=row.id, user_id=current_user.id))
    database.commit()
    database.refresh(row)
    return pack_community_rooms(database, [row], current_user.id)[0]


@router.patch("/community_rooms/{room_id}")
def update_community_room(
    room_id: int,
    body: Community_room_create,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    room = room_or_404(database, room_id)
    if room.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Room not found.")
    name = clean_room_name(body.name)
    raise_if_room_name_blocked(name, database)
    room.name = name
    room.about = clean_room_about(body.about)
    topics = clean_room_topics(body.topics)
    room.topics = json.dumps(topics) if topics else None
    database.commit()
    database.refresh(room)
    return pack_community_rooms(database, [room], current_user.id)[0]


@router.delete("/community_rooms/{room_id}")
async def delete_community_room(
    room_id: int,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    room = room_or_404(database, room_id)
    if room.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Room not found.")
    member_ids = [
        row.user_id for row in database.query(Community_room_member).filter(
            Community_room_member.room_id == room.id
        ).all()
    ]
    message_ids = [
        row[0] for row in database.query(Community_room_message.id).filter(
            Community_room_message.room_id == room.id
        ).all()
    ]
    if message_ids:
        database.query(Message_mention).filter(
            Message_mention.kind == "room",
            Message_mention.message_id.in_(message_ids),
        ).delete(synchronize_session=False)
    database.query(Community_room_message).filter(
        Community_room_message.room_id == room.id
    ).delete(synchronize_session=False)
    database.query(Community_room_member).filter(
        Community_room_member.room_id == room.id
    ).delete(synchronize_session=False)
    database.query(Community_edge).filter(
        Community_edge.kind.in_((ROOM_HIDDEN_KIND, ROOM_MUTE_KIND)),
        Community_edge.target_id == room.id,
    ).delete(synchronize_session=False)
    database.delete(room)
    database.commit()
    for user_id in member_ids:
        if user_id == current_user.id:
            continue
        await notify_user(user_id, {"type": "room_closed", "room_id": room.id})
    return {"ok": True}


def room_or_404(database, room_id):
    room = database.query(Community_room).filter(Community_room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found.")
    return room


def room_member(database, room_id, user_id):
    return database.query(Community_room_member).filter(
        Community_room_member.room_id == room_id,
        Community_room_member.user_id == user_id,
    ).first()


def joined_room_total(database, user_id):
    return database.query(func.count(Community_room_member.id)).filter(
        Community_room_member.user_id == user_id
    ).scalar() or 0


def room_member_count(database, room_id):
    return database.query(func.count(Community_room_member.id)).filter(
        Community_room_member.room_id == room_id
    ).scalar() or 0


def room_member_payloads(database, room):
    rows = database.query(Community_room_member).filter(Community_room_member.room_id == room.id).all()
    ids = [row.user_id for row in rows]
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(ids)).all() if ids else []
    lookup = {account.id: account for account in accounts}
    members = []
    for row in rows:
        account = lookup.get(row.user_id)
        if not account:
            continue
        members.append(serialize_member(account, account.id == room.owner_id))
    return members


async def fanout_room_roster(database, room, exclude_user_id=None):
    members = room_member_payloads(database, room)
    payload = {"type": "room_roster", "room_id": room.id, "n": len(members), "members": members}
    for member in members:
        if member.get("id") == exclude_user_id:
            continue
        await notify_user(member.get("id"), payload)


def pack_room_history(database, messages, viewer_id):
    messages = drop_blocked_rows(database, viewer_id, messages, "author_id")
    mention_meta = decorate_history(database, "room", messages, viewer_id)
    reply_map = reply_map_for(database, Community_room_message, messages, "author_id")
    sender_ids = list({message.author_id for message in messages if message.author_id})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(sender_ids)).all() if sender_ids else []
    names = {account.id: account.username for account in accounts}
    faces = avatar_lookup(accounts)
    shows = {account.id: (getattr(account, "display_name", None) or "").strip() for account in accounts}
    packed = []
    for index, message in enumerate(messages):
        packed.append({
            "id": message.id,
            "sender_id": message.author_id,
            "username": names.get(message.author_id, ""),
            "display_name": shows.get(message.author_id, ""),
            "content": message.content or "",
            "attachment": attachment_public(message.attachment),
            "timestamp": str(message.created_at) if message.created_at else "",
            "edited": False,
            "reactions": [],
            "mentioned": mention_meta[index]["mentioned"],
            "mention_users": mention_meta[index]["mention_users"],
            "reply_to": reply_map.get(message.reply_to_id) if message.reply_to_id else None,
            "avatar": faces.get(message.author_id),
        })
    mask_message_payloads(database, packed)
    return packed


@router.get("/community_rooms/{room_id}/messages")
def list_community_room_messages(
    room_id: int,
    before_id: int = None,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    room = room_or_404(database, room_id)
    if not room_member(database, room.id, current_user.id):
        raise HTTPException(status_code=404, detail="Room not found.")
    base = database.query(Community_room_message).filter(Community_room_message.room_id == room.id)
    if before_id:
        history = base.filter(Community_room_message.id < before_id).order_by(Community_room_message.id.desc()).limit(COMMUNITY_ROOM_PAGE).all()
    else:
        history = base.order_by(Community_room_message.id.desc()).limit(COMMUNITY_ROOM_PAGE).all()
    history.reverse()
    return {
        "room_id": room.id,
        "name": room.name or "",
        "messages": pack_room_history(database, history, current_user.id),
        "members": room_member_payloads(database, room),
    }


@router.post("/community_rooms/{room_id}/join")
async def join_community_room(
    room_id: int,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    room = room_or_404(database, room_id)
    if room_member(database, room.id, current_user.id):
        return pack_community_rooms(database, [room], current_user.id)[0]
    if room_member_count(database, room.id) >= COMMUNITY_ROOM_CAP:
        raise HTTPException(status_code=400, detail="That room is full.")
    if joined_room_total(database, current_user.id) >= COMMUNITY_ROOM_JOIN_MAX:
        raise HTTPException(status_code=400, detail=ROOM_JOIN_FULL)
    database.add(Community_room_member(room_id=room.id, user_id=current_user.id))
    room.active_at = datetime.utcnow()
    database.commit()
    await fanout_room_roster(database, room, exclude_user_id=current_user.id)
    return pack_community_rooms(database, [room], current_user.id)[0]


@router.post("/community_rooms/{room_id}/leave")
async def leave_community_room(
    room_id: int,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    room = room_or_404(database, room_id)
    membership = room_member(database, room.id, current_user.id)
    if not membership:
        raise HTTPException(status_code=404, detail="Room not found.")
    database.delete(membership)
    room.active_at = datetime.utcnow()
    database.commit()
    await fanout_room_roster(database, room, exclude_user_id=current_user.id)
    return pack_community_rooms(database, [room], current_user.id)[0]


def save_community_room_message(database, current_user, room_id, content, attachment, reply_to_id):
    try:
        room_id = int(room_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=404, detail="Room not found.")
    room = room_or_404(database, room_id)
    if not room_member(database, room.id, current_user.id):
        raise HTTPException(status_code=404, detail="Room not found.")
    require_message_body(content, attachment)
    parent = None
    try:
        reply_to_id = int(reply_to_id) if reply_to_id else None
    except (TypeError, ValueError):
        reply_to_id = None
    if reply_to_id:
        candidate = database.query(Community_room_message).filter(
            Community_room_message.id == reply_to_id,
            Community_room_message.room_id == room.id,
        ).first()
        parent = accepted_reply_parent(candidate, "author_id")
    message = Community_room_message(
        room_id=room.id,
        author_id=current_user.id,
        content=content or "",
        attachment=store_attachment(attachment, current_user),
        reply_to_id=parent.id if parent else None,
    )
    database.add(message)
    database.flush()
    member_ids = [
        row.user_id for row in database.query(Community_room_member).filter(
            Community_room_member.room_id == room.id
        ).all()
    ]
    quiet = room_mention_opt_outs(database, member_ids)
    reply_author_id = parent.author_id if parent else None
    apply_room_mentions(
        database,
        message,
        [uid for uid in member_ids if uid not in quiet],
        reply_author_id=None if reply_author_id in quiet else reply_author_id,
    )
    room.active_at = datetime.utcnow()
    database.commit()
    database.refresh(message)
    return message


async def fanout_room_message(database, message, current_user):
    room = database.query(Community_room).filter(Community_room.id == message.room_id).first()
    members = database.query(Community_room_member).filter(Community_room_member.room_id == message.room_id).all()
    pinged = set(mentioned_user_ids(database, "room", message.id))
    users_map = mention_user_map(database, message.content)
    reply_to = live_reply_to(database, Community_room_message, message.reply_to_id, "author_id")
    shown = (getattr(current_user, "display_name", None) or "").strip()
    base = {
        "type": "room_message",
        "id": message.id,
        "room_id": message.room_id,
        "room_name": room.name if room else "",
        "sender_id": current_user.id,
        "username": current_user.username,
        "display_name": shown,
        "content": message.content or "",
        "attachment": attachment_public(message.attachment),
        "timestamp": str(message.created_at) if message.created_at else "",
        "mention_users": users_map,
        "reply_to": reply_to,
        "avatar": public_avatar(current_user),
    }
    for member in members:
        if member.user_id == current_user.id:
            continue
        payload = dict(base)
        payload["mentioned"] = member.user_id in pinged
        await notify_user(member.user_id, payload)


def room_mention_opt_outs(database, member_ids):
    ids = [item for item in member_ids if item]
    if not ids:
        return set()
    rows = database.query(Community_edge.user_id).filter(
        Community_edge.user_id.in_(ids),
        Community_edge.kind == ROOM_PREF_KIND,
        Community_edge.target_id == 0,
        Community_edge.label == "allow_mentions",
        Community_edge.mode == "off",
    ).all()
    return {user_id for (user_id,) in rows}


def room_mute_until(mode):
    try:
        return datetime.fromisoformat(str(mode or ""))
    except ValueError:
        return None


def load_room_prefs(database, user_id):
    found = {"words": [], "topics": [], "sort": "newest", "sound": "mentions", "hidden": [], "muted": {}}
    found.update(ROOM_PREF_FLAGS)
    if not user_id:
        return found
    rows = database.query(Community_edge).filter(
        Community_edge.user_id == user_id,
        Community_edge.kind.in_(("room_word", "room_topic", ROOM_PREF_KIND, ROOM_HIDDEN_KIND, ROOM_MUTE_KIND)),
    ).order_by(Community_edge.created_at.asc(), Community_edge.id.asc()).all()
    hidden_ids = []
    for edge in rows:
        if edge.kind == "room_word" and edge.label:
            found["words"].append(edge.label)
        elif edge.kind == "room_topic" and edge.label:
            found["topics"].append(edge.label)
        elif edge.kind == ROOM_HIDDEN_KIND and edge.target_id:
            hidden_ids.append(edge.target_id)
        elif edge.kind == ROOM_MUTE_KIND and edge.target_id:
            until = room_mute_until(edge.mode)
            if mute_is_active(until):
                found["muted"][str(edge.target_id)] = mute_public(until)["muted_until"]
        elif edge.kind == ROOM_PREF_KIND:
            if edge.label == "sort" and edge.mode in ROOM_SORTS:
                found["sort"] = edge.mode
            elif edge.label == "sound" and edge.mode in ROOM_SOUNDS:
                found["sound"] = edge.mode
            elif edge.label in ROOM_PREF_FLAGS:
                found[edge.label] = edge.mode == "on"
    if hidden_ids:
        rooms = database.query(Community_room).filter(Community_room.id.in_(hidden_ids)).all()
        names = {room.id: room.name or "Room" for room in rooms}
        found["hidden"] = [{"id": room_id, "name": names[room_id]} for room_id in hidden_ids if room_id in names]
    return found


def room_filter_kind(kind):
    edge_kind = ROOM_FILTER_KINDS.get(str(kind or "").strip().lower())
    if not edge_kind:
        raise HTTPException(status_code=400, detail="Unknown list.")
    return edge_kind


def room_edge(database, user_id, kind, target_id, label=""):
    return database.query(Community_edge).filter(
        Community_edge.user_id == user_id,
        Community_edge.kind == kind,
        Community_edge.target_id == target_id,
        Community_edge.label == label,
    ).first()


def save_room_pref(database, user_id, label, mode):
    edge = room_edge(database, user_id, ROOM_PREF_KIND, 0, label)
    if edge:
        edge.mode = mode
    else:
        database.add(Community_edge(user_id=user_id, kind=ROOM_PREF_KIND, target_id=0, label=label, mode=mode))


@router.get("/community_room_settings")
def get_community_room_settings(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    return load_room_prefs(database, current_user.id)


@router.patch("/community_room_settings")
def update_community_room_settings(
    body: Community_room_prefs,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    if body.sort is not None:
        sort = str(body.sort).strip().lower()
        if sort not in ROOM_SORTS:
            raise HTTPException(status_code=400, detail="Unknown sort.")
        save_room_pref(database, current_user.id, "sort", sort)
    if body.sound is not None:
        sound = str(body.sound).strip().lower()
        if sound not in ROOM_SOUNDS:
            raise HTTPException(status_code=400, detail="Unknown sound setting.")
        save_room_pref(database, current_user.id, "sound", sound)
    for label in ROOM_PREF_FLAGS:
        value = getattr(body, label, None)
        if value is not None:
            save_room_pref(database, current_user.id, label, "on" if value else "off")
    database.commit()
    return load_room_prefs(database, current_user.id)


@router.post("/community_room_settings/filters")
def add_community_room_filter(
    body: Community_filter_entry,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    edge_kind = room_filter_kind(body.kind)
    label = clean_filter_label(body.label)
    if not label:
        raise HTTPException(status_code=400, detail="Type something first.")
    if not room_edge(database, current_user.id, edge_kind, 0, label):
        count = database.query(func.count(Community_edge.id)).filter(
            Community_edge.user_id == current_user.id,
            Community_edge.kind == edge_kind,
        ).scalar() or 0
        if count >= COMMUNITY_FILTER_MAX:
            raise HTTPException(status_code=400, detail="This list is full.")
        database.add(Community_edge(user_id=current_user.id, kind=edge_kind, target_id=0, label=label))
        database.commit()
    return load_room_prefs(database, current_user.id)


@router.delete("/community_room_settings/filters")
def remove_community_room_filter(
    body: Community_filter_entry,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    edge_kind = room_filter_kind(body.kind)
    label = clean_filter_label(body.label)
    database.query(Community_edge).filter(
        Community_edge.user_id == current_user.id,
        Community_edge.kind == edge_kind,
        Community_edge.target_id == 0,
        Community_edge.label == label,
    ).delete(synchronize_session=False)
    database.commit()
    return load_room_prefs(database, current_user.id)


@router.post("/community_rooms/{room_id}/hide")
def hide_community_room(
    room_id: int,
    body: Community_room_hide,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    edge = room_edge(database, current_user.id, ROOM_HIDDEN_KIND, room_id)
    if body.hidden:
        room_or_404(database, room_id)
        if not edge:
            database.add(Community_edge(user_id=current_user.id, kind=ROOM_HIDDEN_KIND, target_id=room_id, label=""))
    elif edge:
        database.delete(edge)
    database.commit()
    return load_room_prefs(database, current_user.id)


@router.post("/community_rooms/{room_id}/mute")
def mute_community_room(
    room_id: int,
    body: Conversation_mute_in,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    room = room_or_404(database, room_id)
    if not room_member(database, room.id, current_user.id):
        raise HTTPException(status_code=404, detail="Room not found.")
    until = mute_until_for(body.duration)
    edge = room_edge(database, current_user.id, ROOM_MUTE_KIND, room.id)
    if until is None:
        if edge:
            database.delete(edge)
    elif edge:
        edge.mode = until.isoformat()
    else:
        database.add(Community_edge(user_id=current_user.id, kind=ROOM_MUTE_KIND, target_id=room.id, label="", mode=until.isoformat()))
    database.commit()
    return mute_public(until)
