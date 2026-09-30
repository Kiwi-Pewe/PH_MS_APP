from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from datetime import datetime, timedelta
import re
from app.models import (
    UserInfo, Message, Party_messages, Party_members, Channel_messages,
    Servers, Server_members, Server_categories, Server_channels,
    Message_pin, Message_mention,
)
from app.schemas import Search_messages
from app.database import get_db
from app.auth import get_current_user
from app.r2 import attachment_public
from app.routers.profile import public_avatar, avatar_lookup
from app.routers.pins import find_dm_conversation
from app.site_moderation import mask_message_payloads

router = APIRouter()

SEARCH_PAGE_SIZE = 25
URL_RE = re.compile(r"https?://", re.I)
LIVE_HAS = ("link", "image", "video", "file")
GREY_HAS = ("embed", "poll", "sticker", "sound", "snapshot")


def parse_day_start(raw):
    text = (raw or "").strip()
    if not text:
        return None
    try:
        if len(text) >= 10:
            return datetime.strptime(text[:10], "%Y-%m-%d")
    except ValueError:
        return None
    return None


def attachment_kind(raw):
    data = attachment_public(raw)
    if not data or not isinstance(data, dict):
        return None
    kind = (data.get("kind") or "").lower()
    mime = (data.get("mime") or "").lower()
    if kind in ("image", "video", "file", "audio", "sound"):
        return kind if kind != "audio" else "sound"
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("video/"):
        return "video"
    if mime.startswith("audio/"):
        return "sound"
    if data.get("key") or data.get("url"):
        return "file"
    return None


def row_matches_has(content, attachment, has_list):
    if not has_list:
        return True
    kind = attachment_kind(attachment)
    has_link = bool(URL_RE.search(content or ""))
    for item in has_list:
        token = (item or "").strip().lower()
        negate = token.startswith("-")
        key = token[1:] if negate else token
        if key in GREY_HAS:
            continue
        hit = False
        if key == "link":
            hit = has_link
        elif key == "image":
            hit = kind == "image"
        elif key == "video":
            hit = kind == "video"
        elif key == "file":
            hit = kind in ("file", "image", "video", "sound")
        if negate:
            if hit:
                return False
        else:
            if not hit:
                return False
    return True


def visible_text_channel_ids(database, server, user_id):
    from app.routers.roles import effective_perms_for_user_in_channel, channel_type_visible
    is_owner = server.owner_id == user_id
    categories = database.query(Server_categories).filter(Server_categories.server_id == server.id).all()
    out = []
    for category in categories:
        if category.is_private and not is_owner:
            continue
        channels = database.query(Server_channels).filter(Server_channels.category_id == category.id).all()
        for channel in channels:
            if channel.is_private and not is_owner:
                continue
            if channel.channel_type != "text":
                continue
            perms = effective_perms_for_user_in_channel(database, server, user_id, channel.id)
            if not channel_type_visible(perms, channel.channel_type):
                continue
            out.append(channel.id)
    return out


def apply_time_filters(query, time_col, before, after, during):
    during_day = parse_day_start(during)
    if during_day:
        return query.filter(time_col >= during_day, time_col < during_day + timedelta(days=1))
    before_day = parse_day_start(before)
    after_day = parse_day_start(after)
    if before_day:
        query = query.filter(time_col < before_day)
    if after_day:
        query = query.filter(time_col >= after_day)
    return query


def pinned_message_ids(database, scope_kind, scope_id, message_kind):
    rows = database.query(Message_pin.message_id).filter(
        Message_pin.scope_kind == scope_kind,
        Message_pin.scope_id == scope_id,
        Message_pin.message_kind == message_kind,
    ).all()
    return {row[0] for row in rows}


def mention_message_ids(database, kind, user_id, channel_ids=None, party_id=None):
    q = database.query(Message_mention.message_id).filter(
        Message_mention.kind == kind,
        Message_mention.user_id == user_id,
    )
    if channel_ids is not None:
        q = q.filter(Message_mention.channel_id.in_(list(channel_ids) or [-1]))
    if party_id is not None:
        q = q.filter(Message_mention.party_id == party_id)
    return {row[0] for row in q.all()}


def serialize_hit(kind, msg, username, avatar, channel_id=None, channel_name=None):
    content = getattr(msg, "content", None) or ""
    attachment = getattr(msg, "attachment", None)
    sender = getattr(msg, "sender_id", None)
    stamp = getattr(msg, "timestamp", None) or getattr(msg, "created_at", None)
    return {
        "id": msg.id,
        "message_kind": kind,
        "chat_kind": kind,
        "sender_id": sender,
        "username": username or "",
        "content": content,
        "attachment": attachment_public(attachment),
        "timestamp": str(stamp) if stamp else None,
        "edited": bool(getattr(msg, "edited", False)),
        "avatar": avatar,
        "channel_id": channel_id,
        "channel_name": channel_name or "",
    }


@router.post("/search_messages")
def search_messages(body: Search_messages, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    page = max(1, int(body.page or 1))
    content = (body.content or "").strip()
    has_list = [str(item).strip().lower() for item in (body.has or []) if str(item).strip()]
    for item in has_list:
        key = item[1:] if item.startswith("-") else item
        if key in GREY_HAS:
            raise HTTPException(status_code=400, detail=f"Filter has:{key} is not available yet.")

    if body.scope_kind == "server":
        return search_server(database, current_user, body, page, content, has_list)
    if body.scope_kind == "dm":
        return search_dm(database, current_user, body, page, content, has_list)
    if body.scope_kind == "party":
        return search_party(database, current_user, body, page, content, has_list)
    raise HTTPException(status_code=400, detail="Unknown search scope")


def search_server(database, current_user, body, page, content, has_list):
    server_id = str(body.scope_id)
    server = database.query(Servers).filter(Servers.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    member = database.query(Server_members).filter(
        Server_members.server_id == server.id,
        Server_members.user_id == current_user.id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Server not found")

    channel_ids = visible_text_channel_ids(database, server, current_user.id)
    if body.channel_id is not None:
        if body.channel_id not in channel_ids:
            raise HTTPException(status_code=403, detail="You cannot search that channel.")
        channel_ids = [body.channel_id]
    if not channel_ids:
        return empty_search_page(page)

    query = database.query(Channel_messages).filter(Channel_messages.channel_id.in_(channel_ids))
    query = query.filter(Channel_messages.sender_id.isnot(None))
    if content:
        query = query.filter(Channel_messages.content.ilike(f"%{content}%"))
    if body.author_id is not None:
        query = query.filter(Channel_messages.sender_id == body.author_id)
    query = apply_time_filters(query, Channel_messages.timestamp, body.before, body.after, body.during)

    if body.mentions_user_id is not None:
        ids = mention_message_ids(database, "channel", body.mentions_user_id, channel_ids=channel_ids)
        if not ids:
            return empty_search_page(page)
        query = query.filter(Channel_messages.id.in_(ids))

    if body.pinned is not None:
        pin_ids = set()
        for cid in channel_ids:
            pin_ids |= pinned_message_ids(database, "channel", cid, "channel")
        if body.pinned:
            if not pin_ids:
                return empty_search_page(page)
            query = query.filter(Channel_messages.id.in_(pin_ids))
        elif pin_ids:
            query = query.filter(~Channel_messages.id.in_(pin_ids))

    rows = query.order_by(Channel_messages.timestamp.desc(), Channel_messages.id.desc()).limit(800).all()
    filtered = [row for row in rows if row_matches_has(row.content, row.attachment, has_list)]
    total = len(filtered)
    start = (page - 1) * SEARCH_PAGE_SIZE
    page_rows = filtered[start:start + SEARCH_PAGE_SIZE]

    channel_map = {
        ch.id: ch.name
        for ch in database.query(Server_channels).filter(Server_channels.id.in_(channel_ids)).all()
    }
    sender_ids = list({row.sender_id for row in page_rows if row.sender_id})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(sender_ids)).all() if sender_ids else []
    names = {a.id: a.username for a in accounts}
    faces = avatar_lookup(accounts)
    messages = [
        serialize_hit(
            "channel",
            row,
            names.get(row.sender_id, ""),
            faces.get(row.sender_id),
            channel_id=row.channel_id,
            channel_name=channel_map.get(row.channel_id, ""),
        )
        for row in page_rows
    ]
    mask_message_payloads(database, messages)
    pages = max(1, (total + SEARCH_PAGE_SIZE - 1) // SEARCH_PAGE_SIZE) if total else 1
    return {
        "scope_kind": "server",
        "scope_id": server_id,
        "page": page,
        "pages": pages,
        "total": total,
        "page_size": SEARCH_PAGE_SIZE,
        "messages": messages,
        "live_has": list(LIVE_HAS),
        "grey_has": list(GREY_HAS),
    }


def search_dm(database, current_user, body, page, content, has_list):
    peer_id = int(body.scope_id)
    if peer_id == current_user.id:
        raise HTTPException(status_code=400, detail="Invalid peer")
    peer = database.query(UserInfo).filter(UserInfo.id == peer_id).first()
    if not peer:
        raise HTTPException(status_code=404, detail="No user found")

    query = database.query(Message).filter(or_(
        and_(Message.sender_id == current_user.id, Message.receiver_id == peer_id),
        and_(Message.sender_id == peer_id, Message.receiver_id == current_user.id),
    ))
    query = query.filter(Message.sender_id.isnot(None))
    query = query.filter(or_(Message.deletion_state.is_(None), ~Message.deletion_state.in_(["pending", "deleted"])))
    if content:
        query = query.filter(Message.content.ilike(f"%{content}%"))
    if body.author_id is not None:
        query = query.filter(Message.sender_id == body.author_id)
    query = apply_time_filters(query, Message.timestamp, body.before, body.after, body.during)

    convo = find_dm_conversation(database, current_user.id, peer_id)
    if body.pinned is not None:
        if not convo:
            if body.pinned:
                return empty_search_page(page)
        else:
            pin_ids = pinned_message_ids(database, "dm", convo.id, "dm")
            if body.pinned:
                if not pin_ids:
                    return empty_search_page(page)
                query = query.filter(Message.id.in_(pin_ids))
            elif pin_ids:
                query = query.filter(~Message.id.in_(pin_ids))

    if body.mentions_user_id is not None:
        return empty_search_page(page)

    rows = query.order_by(Message.timestamp.desc(), Message.id.desc()).limit(800).all()
    filtered = [row for row in rows if row_matches_has(row.content, row.attachment, has_list)]
    total = len(filtered)
    start = (page - 1) * SEARCH_PAGE_SIZE
    page_rows = filtered[start:start + SEARCH_PAGE_SIZE]
    sender_ids = list({row.sender_id for row in page_rows if row.sender_id})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(sender_ids)).all() if sender_ids else []
    names = {a.id: a.username for a in accounts}
    faces = avatar_lookup(accounts)
    messages = [
        serialize_hit("dm", row, names.get(row.sender_id, ""), faces.get(row.sender_id))
        for row in page_rows
    ]
    mask_message_payloads(database, messages)
    pages = max(1, (total + SEARCH_PAGE_SIZE - 1) // SEARCH_PAGE_SIZE) if total else 1
    return {
        "scope_kind": "dm",
        "scope_id": peer_id,
        "page": page,
        "pages": pages,
        "total": total,
        "page_size": SEARCH_PAGE_SIZE,
        "messages": messages,
        "live_has": list(LIVE_HAS),
        "grey_has": list(GREY_HAS),
    }


def search_party(database, current_user, body, page, content, has_list):
    party_id = int(body.scope_id)
    in_party = database.query(Party_members).filter(
        Party_members.party_id == party_id,
        Party_members.user_id == current_user.id,
    ).first()
    if not in_party:
        raise HTTPException(status_code=404, detail="Party not found")

    query = database.query(Party_messages).filter(Party_messages.party_id == party_id)
    query = query.filter(Party_messages.sender_id.isnot(None))
    query = query.filter(or_(Party_messages.deletion_state.is_(None), ~Party_messages.deletion_state.in_(["pending", "deleted"])))
    if content:
        query = query.filter(Party_messages.content.ilike(f"%{content}%"))
    if body.author_id is not None:
        query = query.filter(Party_messages.sender_id == body.author_id)
    query = apply_time_filters(query, Party_messages.timestamp, body.before, body.after, body.during)

    if body.mentions_user_id is not None:
        ids = mention_message_ids(database, "party", body.mentions_user_id, party_id=party_id)
        if not ids:
            return empty_search_page(page)
        query = query.filter(Party_messages.id.in_(ids))

    if body.pinned is not None:
        pin_ids = pinned_message_ids(database, "party", party_id, "party")
        if body.pinned:
            if not pin_ids:
                return empty_search_page(page)
            query = query.filter(Party_messages.id.in_(pin_ids))
        elif pin_ids:
            query = query.filter(~Party_messages.id.in_(pin_ids))

    rows = query.order_by(Party_messages.timestamp.desc(), Party_messages.id.desc()).limit(800).all()
    filtered = [row for row in rows if row_matches_has(row.content, row.attachment, has_list)]
    total = len(filtered)
    start = (page - 1) * SEARCH_PAGE_SIZE
    page_rows = filtered[start:start + SEARCH_PAGE_SIZE]
    sender_ids = list({row.sender_id for row in page_rows if row.sender_id})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(sender_ids)).all() if sender_ids else []
    names = {a.id: a.username for a in accounts}
    faces = avatar_lookup(accounts)
    messages = [
        serialize_hit("party", row, names.get(row.sender_id, ""), faces.get(row.sender_id))
        for row in page_rows
    ]
    mask_message_payloads(database, messages)
    pages = max(1, (total + SEARCH_PAGE_SIZE - 1) // SEARCH_PAGE_SIZE) if total else 1
    return {
        "scope_kind": "party",
        "scope_id": party_id,
        "page": page,
        "pages": pages,
        "total": total,
        "page_size": SEARCH_PAGE_SIZE,
        "messages": messages,
        "live_has": list(LIVE_HAS),
        "grey_has": list(GREY_HAS),
    }


def empty_search_page(page):
    return {
        "page": page,
        "pages": 1,
        "total": 0,
        "page_size": SEARCH_PAGE_SIZE,
        "messages": [],
        "live_has": list(LIVE_HAS),
        "grey_has": list(GREY_HAS),
    }
