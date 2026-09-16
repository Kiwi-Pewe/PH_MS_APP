# Mentions and per-channel last-viewed. Tokens in stored content are
# <@id>, <@everyone>, <@here> so a later display-name change still
# renders the current name. Ping rows are one per targeted user so
# unread counts are a simple filter.
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import (
    UserInfo, Servers, Server_members, Server_categories, Server_channels,
    Channel_messages, Channel_last_viewed, Message_mention, Party_members
)
from app.database import get_db
from app.auth import get_current_user
from app.routers.realtime import active_connections
from datetime import datetime, timedelta
import re

router = APIRouter()

TOKEN_RE = re.compile(r"<@(everyone|here|\d+)>")

def member_records(database, user_ids):
    if not user_ids:
        return []
    return database.query(UserInfo).filter(UserInfo.id.in_(user_ids)).all()

def tokenize_mentions(content, members):
    if not content:
        return content, set()
    pinged = set()
    out = content

    if re.search(r"@everyone\b", out, flags=re.I):
        pinged.add("everyone")
        out = re.sub(r"@everyone\b", "<@everyone>", out, flags=re.I)
    if re.search(r"@here\b", out, flags=re.I):
        pinged.add("here")
        out = re.sub(r"@here\b", "<@here>", out, flags=re.I)

    for account in sorted(members, key=lambda a: len(a.username), reverse=True):
        pattern = r"@" + re.escape(account.username) + r"\b"
        if re.search(pattern, out, flags=re.I):
            pinged.add(account.id)
            out = re.sub(pattern, f"<@{account.id}>", out, flags=re.I)
    return out, pinged

def expand_pinged(pinged, member_ids, online_ids):
    targets = set()
    if "everyone" in pinged:
        targets.update(member_ids)
    if "here" in pinged:
        targets.update(oid for oid in online_ids if oid in member_ids)
    for item in pinged:
        if item != "everyone" and item != "here":
            targets.add(item)
    return targets

def token_user_ids(content):
    ids = []
    for match in TOKEN_RE.finditer(content or ""):
        if match.group(1).isdigit():
            ids.append(int(match.group(1)))
    return ids

def mention_user_map(database, content):
    ids = list(set(token_user_ids(content)))
    if not ids:
        return {}
    accounts = member_records(database, ids)
    return {str(account.id): account.username for account in accounts}

def mention_user_maps(database, contents):
    all_ids = set()
    per_row = []
    for content in contents:
        ids = token_user_ids(content)
        per_row.append(ids)
        all_ids.update(ids)
    lookup = {str(account.id): account.username for account in member_records(database, list(all_ids))}
    maps = []
    for ids in per_row:
        maps.append({str(user_id): lookup[str(user_id)] for user_id in ids if str(user_id) in lookup})
    return maps

def mentioned_user_ids(database, kind, message_id):
    rows = database.query(Message_mention).filter(
        Message_mention.kind == kind,
        Message_mention.message_id == message_id
    ).all()
    return [row.user_id for row in rows]

def decorate_ids(database, kind, ids, texts, user_id):
    pinged = mentioned_map(database, kind, ids, user_id)
    maps = mention_user_maps(database, texts)
    out = []
    for index, item_id in enumerate(ids):
        out.append({
            "mentioned": pinged.get(item_id, False),
            "mention_users": maps[index]
        })
    return out

def decorate_history(database, kind, messages, user_id):
    return decorate_ids(database, kind, [message.id for message in messages], [message.content for message in messages], user_id)

def message_mentioned(database, kind, message_id, user_id):
    row = database.query(Message_mention).filter(
        Message_mention.kind == kind,
        Message_mention.message_id == message_id,
        Message_mention.user_id == user_id
    ).first()
    return bool(row)

def mentioned_map(database, kind, message_ids, user_id):
    if not message_ids:
        return {}
    rows = database.query(Message_mention).filter(
        Message_mention.kind == kind,
        Message_mention.message_id.in_(message_ids),
        Message_mention.user_id == user_id
    ).all()
    return {row.message_id: True for row in rows}

def clear_mentions(database, kind, message_id):
    database.query(Message_mention).filter(Message_mention.kind == kind, Message_mention.message_id == message_id).delete()

def clear_channel_mentions(database, channel_id):
    database.query(Message_mention).filter(Message_mention.channel_id == channel_id).delete()

def write_mentions(database, kind, message_id, user_ids, server_id=None, channel_id=None, party_id=None):
    clear_mentions(database, kind, message_id)
    for user_id in user_ids:
        database.add(Message_mention(
            kind = kind,
            message_id = message_id,
            server_id = server_id,
            channel_id = channel_id,
            party_id = party_id,
            user_id = user_id
        ))

def add_reply_ping(targets, author_id, sender_id):
    if author_id and author_id != sender_id:
        targets.add(author_id)
    return targets

def accepted_reply_parent(parent, author_attr="sender_id"):
    if not parent:
        return None
    if getattr(parent, author_attr, None) is None:
        return None
    if getattr(parent, "deletion_state", None) == "deleted":
        return None
    return parent

def reply_to_payload(database, parent, author_attr="sender_id"):
    if not parent:
        return None
    author_id = getattr(parent, author_attr)
    account = database.query(UserInfo).filter(UserInfo.id == author_id).first() if author_id else None
    deleted = getattr(parent, "deletion_state", None) == "deleted"
    return {
        "id": parent.id,
        "sender_id": author_id,
        "username": account.username if account else "user",
        "content": "" if deleted else (parent.content or ""),
        "deleted": bool(deleted),
    }

def reply_map_for(database, model, messages, author_attr="sender_id"):
    reply_ids = [message.reply_to_id for message in messages if getattr(message, "reply_to_id", None)]
    if not reply_ids:
        return {}
    parents = database.query(model).filter(model.id.in_(reply_ids)).all()
    parent_map = {parent.id: parent for parent in parents}
    author_ids = [getattr(parent, author_attr) for parent in parents if getattr(parent, author_attr)]
    names = {account.id: account.username for account in member_records(database, author_ids)}
    out = {}
    for reply_id in set(reply_ids):
        parent = parent_map.get(reply_id)
        if not parent:
            out[reply_id] = {"id": reply_id, "sender_id": None, "username": "", "content": "", "deleted": True}
            continue
        deleted = getattr(parent, "deletion_state", None) == "deleted"
        author_id = getattr(parent, author_attr)
        out[reply_id] = {
            "id": parent.id,
            "sender_id": author_id,
            "username": names.get(author_id, "user") if author_id else "user",
            "content": "" if deleted else (parent.content or ""),
            "deleted": bool(deleted),
        }
    return out

def live_reply_to(database, model, reply_to_id, author_attr="sender_id"):
    if not reply_to_id:
        return None
    parent = database.query(model).filter(model.id == reply_to_id).first()
    if not parent:
        return {"id": reply_to_id, "sender_id": None, "username": "", "content": "", "deleted": True}
    return reply_to_payload(database, parent, author_attr)

def seed_channel_unread(database, channel_id, member_ids, sender_id, seen_at):
    rows = database.query(Channel_last_viewed).filter(Channel_last_viewed.channel_id == channel_id).all()
    existing = {row.user_id for row in rows}
    cutoff = (seen_at or datetime.utcnow()) - timedelta(seconds=1)
    for user_id in member_ids:
        if user_id == sender_id or user_id in existing:
            continue
        database.add(Channel_last_viewed(channel_id= channel_id, user_id= user_id, last_viewed_at= cutoff))

def apply_channel_mentions(database, message, server, member_ids, reply_author_id=None):
    members = member_records(database, member_ids)
    content, pinged = tokenize_mentions(message.content, members)
    online_ids = [uid for uid in member_ids if uid in active_connections]
    targets = expand_pinged(pinged, member_ids, online_ids)
    add_reply_ping(targets, reply_author_id, message.sender_id)
    message.content = content
    write_mentions(database, "channel", message.id, targets, server_id= server.id, channel_id= message.channel_id)
    return content, list(targets)

def apply_party_mentions(database, message, member_ids, reply_author_id=None):
    members = member_records(database, member_ids)
    content, pinged = tokenize_mentions(message.content, members)
    online_ids = [uid for uid in member_ids if uid in active_connections]
    targets = expand_pinged(pinged, member_ids, online_ids)
    add_reply_ping(targets, reply_author_id, message.sender_id)
    message.content = content
    write_mentions(database, "party", message.id, targets, party_id= message.party_id)
    return content, list(targets)

def apply_server_text_mentions(database, text, kind, message_id, server, channel_id, seed=False, sender_id=None, reply_author_id=None):
    member_ids = [row.user_id for row in database.query(Server_members).filter(Server_members.server_id == server.id).all()]
    members = member_records(database, member_ids)
    content, pinged = tokenize_mentions(text or "", members)
    online_ids = [uid for uid in member_ids if uid in active_connections]
    targets = expand_pinged(pinged, member_ids, online_ids)
    add_reply_ping(targets, reply_author_id, sender_id)
    write_mentions(database, kind, message_id, targets, server_id= server.id, channel_id= channel_id)
    if seed:
        seed_channel_unread(database, channel_id, member_ids, sender_id, datetime.utcnow())
    return content

def stamp_channel_view(database, channel_id, user_id):
    row = database.query(Channel_last_viewed).filter(
        Channel_last_viewed.channel_id == channel_id,
        Channel_last_viewed.user_id == user_id
    ).first()
    now = datetime.utcnow()
    if row:
        row.last_viewed_at = now
    else:
        database.add(Channel_last_viewed(channel_id= channel_id, user_id= user_id, last_viewed_at= now))

def channel_notice(database, channel_id, user_id):
    viewed = database.query(Channel_last_viewed).filter(
        Channel_last_viewed.channel_id == channel_id,
        Channel_last_viewed.user_id == user_id
    ).first()
    if not viewed:
        return {"unread": False, "mention_count": 0}
    since = viewed.last_viewed_at

    unread = database.query(Channel_messages).filter(
        Channel_messages.channel_id == channel_id,
        Channel_messages.sender_id != user_id,
        Channel_messages.sender_id.isnot(None),
        Channel_messages.timestamp > since
    ).first() is not None

    mention_count = database.query(func.count(Message_mention.id)).filter(
        Message_mention.channel_id == channel_id,
        Message_mention.user_id == user_id,
        Message_mention.created_at > since
    ).scalar() or 0

    return {"unread": bool(unread), "mention_count": int(mention_count)}

def visible_channel_ids(database, server_id, user_id):
    server = database.query(Servers).filter(Servers.id == server_id).first()
    is_owner = server and server.owner_id == user_id
    categories = database.query(Server_categories).filter(Server_categories.server_id == server_id).all()
    ids = []
    for category in categories:
        if category.is_private == True and not is_owner:
            continue
        channels = database.query(Server_channels).filter(Server_channels.category_id == category.id).all()
        for channel in channels:
            if channel.is_private == True and not is_owner:
                continue
            ids.append(channel.id)
    return ids

def server_notice(database, server_id, user_id):
    channels = {}
    any_unread = False
    mention_total = 0
    for channel_id in visible_channel_ids(database, server_id, user_id):
        notice = channel_notice(database, channel_id, user_id)
        channels[channel_id] = notice
        if notice["unread"]:
            any_unread = True
        mention_total += notice["mention_count"]
    return {"unread": any_unread, "mention_count": mention_total, "channels": channels}

def party_mention_count(database, party_id, user_id, since):
    return database.query(func.count(Message_mention.id)).filter(
        Message_mention.kind == "party",
        Message_mention.party_id == party_id,
        Message_mention.user_id == user_id,
        Message_mention.created_at > since
    ).scalar() or 0

@router.post("/view_channel/{channel_id}")
def view_channel(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    is_member = database.query(Server_members).filter(Server_members.server_id == category.server_id, Server_members.user_id == current_user.id).first()
    if not is_member:
        raise HTTPException(status_code=404, detail="Server membership not found")
    stamp_channel_view(database, channel_id, current_user.id)
    database.commit()
    return {"channel_id": channel_id}

@router.post("/mark_server_read/{server_id}")
def mark_server_read(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    is_member = database.query(Server_members).filter(Server_members.server_id == server_id, Server_members.user_id == current_user.id).first()
    if not is_member:
        raise HTTPException(status_code=404, detail="Server membership not found")
    for channel_id in visible_channel_ids(database, server_id, current_user.id):
        stamp_channel_view(database, channel_id, current_user.id)
    database.commit()
    return {"server_id": server_id}

@router.post("/mark_party_read/{party_id}")
def mark_party_read(party_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    membership = database.query(Party_members).filter(Party_members.party_id == party_id, Party_members.user_id == current_user.id).first()
    if not membership:
        raise HTTPException(status_code=404, detail="User not in party")
    membership.last_activity = datetime.utcnow()
    database.commit()
    return {"party_id": party_id}
