# Mentions and per-channel last-viewed. Tokens in stored content are
# <@id>, <@&roleId>, <@everyone>, <@here> so a later display-name
# change still renders the current name. Ping rows are one per targeted
# user so unread counts are a simple filter.
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, or_
from app.models import (
    UserInfo, Servers, Server_members, Server_categories, Server_channels,
    Server_roles, Server_role_members, Channel_messages, Channel_last_viewed,
    Message_mention, Party_members, Announcement_post, Announcement_comment,
    Forum_post, Forum_messages, List_item, List_thread_message, Media_item,
    Media_comment, Doc_entry, Calendar_event, Calendar_event_comment, Server_notifications,
)
from app.database import get_db
from app.auth import get_current_user
from app.routers.realtime import active_connections
from app.routers.profile import avatar_lookup, public_avatar
from datetime import datetime, timedelta
import re

router = APIRouter()

TOKEN_RE = re.compile(r"<@(everyone|here|&\d+|\d+)>")
ROLE_PING_PREFIX = "role:"

def member_records(database, user_ids):
    if not user_ids:
        return []
    return database.query(UserInfo).filter(UserInfo.id.in_(user_ids)).all()

def mentionable_role_rows(database, server_id):
    if not server_id:
        return []
    return database.query(Server_roles).filter(
        Server_roles.server_id == server_id,
        Server_roles.mentionable == True,
    ).all()

def role_member_lookup(database, role_ids):
    out = {}
    if not role_ids:
        return out
    rows = database.query(Server_role_members).filter(Server_role_members.role_id.in_(list(role_ids))).all()
    for row in rows:
        out.setdefault(row.role_id, []).append(row.user_id)
    return out

def pinged_role_ids(pinged):
    ids = []
    for item in pinged:
        if isinstance(item, str) and item.startswith(ROLE_PING_PREFIX):
            ids.append(int(item.split(":", 1)[1]))
    return ids

def server_allows_everyone(database, server, user_id, channel_id=None):
    if not server or not user_id:
        return False
    from app.routers.roles import effective_perms_for_user, effective_perms_for_user_in_channel
    if channel_id is not None:
        return bool(effective_perms_for_user_in_channel(database, server, user_id, channel_id).get("mention_everyone"))
    return bool(effective_perms_for_user(database, server, user_id).get("mention_everyone"))

def tokenize_channel_mentions(database, server, user_id, content):
    if not content or not server or not user_id:
        return content or ""
    is_owner = server.owner_id == user_id
    named = []
    categories = database.query(Server_categories).filter(Server_categories.server_id == server.id).all()
    for category in categories:
        if category.is_private and not is_owner:
            continue
        channels = database.query(Server_channels).filter(Server_channels.category_id == category.id).all()
        for channel in channels:
            if channel.is_private and not is_owner:
                continue
            name = (channel.name or "").strip()
            if name:
                named.append((len(name), channel.id, name))
    named.sort(key=lambda row: row[0], reverse=True)
    out = content
    for _length, channel_id, name in named:
        pattern = r"#" + re.escape(name) + r"\b"
        if re.search(pattern, out, flags=re.I):
            out = re.sub(pattern, f"<#{channel_id}>", out, flags=re.I)
    return out


def tokenize_mentions(content, members, roles=None, allow_everyone=True):
    if not content:
        return content, set()
    pinged = set()
    out = content

    if allow_everyone:
        if re.search(r"@everyone\b", out, flags=re.I):
            pinged.add("everyone")
            out = re.sub(r"@everyone\b", "<@everyone>", out, flags=re.I)
        if re.search(r"@here\b", out, flags=re.I):
            pinged.add("here")
            out = re.sub(r"@here\b", "<@here>", out, flags=re.I)
    else:
        out = re.sub(r"<@everyone>", "@everyone", out, flags=re.I)
        out = re.sub(r"<@here>", "@here", out, flags=re.I)

    named = []
    for account in members or []:
        if account.username:
            named.append((len(account.username), 1, "user", account.id, account.username))
    for role in roles or []:
        name = (role.name or "").strip()
        if name:
            named.append((len(name), 0, "role", role.id, name))
    named.sort(key=lambda row: (row[0], row[1]), reverse=True)

    for _length, _tie, kind, item_id, name in named:
        pattern = r"@" + re.escape(name) + r"\b"
        if re.search(pattern, out, flags=re.I):
            if kind == "role":
                pinged.add(ROLE_PING_PREFIX + str(item_id))
                out = re.sub(pattern, f"<@&{item_id}>", out, flags=re.I)
            else:
                pinged.add(item_id)
                out = re.sub(pattern, f"<@{item_id}>", out, flags=re.I)
    return out, pinged

def expand_pinged(pinged, member_ids, online_ids, role_users=None):
    targets = {}
    member_set = set(member_ids)
    role_users = role_users or {}
    if "everyone" in pinged:
        for user_id in member_ids:
            targets[user_id] = "everyone"
    if "here" in pinged:
        for user_id in online_ids:
            if user_id in member_set:
                targets[user_id] = "everyone"
    for item in pinged:
        if item == "everyone" or item == "here":
            continue
        if isinstance(item, str) and item.startswith(ROLE_PING_PREFIX):
            role_id = int(item.split(":", 1)[1])
            for user_id in role_users.get(role_id, []):
                if user_id in member_set and targets.get(user_id) != "user":
                    targets[user_id] = "role"
            continue
        targets[item] = "user"
    return targets

def token_user_ids(content):
    ids = []
    for match in TOKEN_RE.finditer(content or ""):
        token = match.group(1)
        if token.isdigit():
            ids.append(int(token))
    return ids

def token_role_ids(content):
    ids = []
    for match in TOKEN_RE.finditer(content or ""):
        token = match.group(1)
        if token.startswith("&") and token[1:].isdigit():
            ids.append(int(token[1:]))
    return ids

def mention_user_map(database, content):
    ids = list(set(token_user_ids(content)))
    if not ids:
        return {}
    accounts = member_records(database, ids)
    return {str(account.id): account.username for account in accounts}

def mention_role_map(database, content):
    ids = list(set(token_role_ids(content)))
    if not ids:
        return {}
    rows = database.query(Server_roles).filter(Server_roles.id.in_(ids)).all()
    return {
        str(row.id): {
            "name": row.name or "role",
            "color": row.color or "#99aab5",
        }
        for row in rows
    }

def mention_maps_dict(database, content):
    return {
        "mention_users": mention_user_map(database, content),
        "mention_roles": mention_role_map(database, content),
    }

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

def mention_role_maps(database, contents):
    all_ids = set()
    per_row = []
    for content in contents:
        ids = token_role_ids(content)
        per_row.append(ids)
        all_ids.update(ids)
    lookup = {}
    if all_ids:
        rows = database.query(Server_roles).filter(Server_roles.id.in_(list(all_ids))).all()
        lookup = {
            row.id: {"name": row.name or "role", "color": row.color or "#99aab5"}
            for row in rows
        }
    maps = []
    for ids in per_row:
        maps.append({str(role_id): lookup[role_id] for role_id in ids if role_id in lookup})
    return maps

def mentioned_user_ids(database, kind, message_id):
    rows = database.query(Message_mention).filter(
        Message_mention.kind == kind,
        Message_mention.message_id == message_id
    ).all()
    return [row.user_id for row in rows]

def mentioned_sources(database, kind, message_id):
    rows = database.query(Message_mention).filter(
        Message_mention.kind == kind,
        Message_mention.message_id == message_id
    ).all()
    return {row.user_id: (row.source or "user") for row in rows}

def decorate_ids(database, kind, ids, texts, user_id):
    pinged = mentioned_map(database, kind, ids, user_id)
    maps = mention_user_maps(database, texts)
    role_maps = mention_role_maps(database, texts)
    out = []
    for index, item_id in enumerate(ids):
        out.append({
            "mentioned": pinged.get(item_id, False),
            "mention_users": maps[index],
            "mention_roles": role_maps[index],
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

def write_mentions(database, kind, message_id, targets, server_id=None, channel_id=None, party_id=None):
    clear_mentions(database, kind, message_id)
    sources = targets if isinstance(targets, dict) else {user_id: "user" for user_id in targets}
    for user_id, source in sources.items():
        database.add(Message_mention(
            kind = kind,
            message_id = message_id,
            server_id = server_id,
            channel_id = channel_id,
            party_id = party_id,
            user_id = user_id,
            source = source
        ))

def add_reply_ping(targets, author_id, sender_id):
    if author_id and author_id != sender_id:
        targets[author_id] = "user"
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
        "avatar": public_avatar(account) if account else None,
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
    authors = member_records(database, author_ids)
    names = {account.id: account.username for account in authors}
    faces = avatar_lookup(authors)
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
            "avatar": faces.get(author_id),
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

def note_channel_unread(database, server_id, channel_id, sender_id):
    member_ids = [row.user_id for row in database.query(Server_members).filter(Server_members.server_id == server_id).all()]
    seed_channel_unread(database, channel_id, member_ids, sender_id, datetime.utcnow())


def other_authored_after(database, model, channel_col, time_col, author_col, channel_id, user_id, since):
    query = database.query(model.id).filter(
        channel_col == channel_id,
        author_col.isnot(None),
        author_col != user_id,
    )
    if since is not None:
        query = query.filter(time_col > since)
    return query.first() is not None


def channel_has_unseen(database, channel, user_id, since):
    kind = (channel.channel_type or "text").lower()
    channel_id = channel.id
    if kind == "announcements":
        if other_authored_after(database, Announcement_post, Announcement_post.channel_id, Announcement_post.created_at, Announcement_post.sender_id, channel_id, user_id, since):
            return True
        query = database.query(Announcement_comment.id).join(Announcement_post, Announcement_comment.post_id == Announcement_post.id).filter(
            Announcement_post.channel_id == channel_id,
            Announcement_comment.sender_id.isnot(None),
            Announcement_comment.sender_id != user_id,
        )
        if since is not None:
            query = query.filter(Announcement_comment.created_at > since)
        return query.first() is not None
    if kind == "forums":
        if other_authored_after(database, Forum_post, Forum_post.channel_id, Forum_post.created_at, Forum_post.author_id, channel_id, user_id, since):
            return True
        query = database.query(Forum_messages.id).join(Forum_post, Forum_messages.post_id == Forum_post.id).filter(
            Forum_post.channel_id == channel_id,
            Forum_messages.author_id.isnot(None),
            Forum_messages.author_id != user_id,
        )
        if since is not None:
            query = query.filter(Forum_messages.created_at > since)
        return query.first() is not None
    if kind == "lists":
        if other_authored_after(database, List_item, List_item.channel_id, List_item.created_at, List_item.sender_id, channel_id, user_id, since):
            return True
        query = database.query(List_thread_message.id).join(List_item, List_thread_message.item_id == List_item.id).filter(
            List_item.channel_id == channel_id,
            List_thread_message.sender_id.isnot(None),
            List_thread_message.sender_id != user_id,
        )
        if since is not None:
            query = query.filter(List_thread_message.created_at > since)
        return query.first() is not None
    if kind == "media":
        if other_authored_after(database, Media_item, Media_item.channel_id, Media_item.created_at, Media_item.sender_id, channel_id, user_id, since):
            return True
        query = database.query(Media_comment.id).join(Media_item, Media_comment.item_id == Media_item.id).filter(
            Media_item.channel_id == channel_id,
            Media_comment.sender_id.isnot(None),
            Media_comment.sender_id != user_id,
        )
        if since is not None:
            query = query.filter(Media_comment.created_at > since)
        return query.first() is not None
    if kind == "docs":
        return other_authored_after(database, Doc_entry, Doc_entry.channel_id, Doc_entry.created_at, Doc_entry.sender_id, channel_id, user_id, since)
    if kind == "events":
        if other_authored_after(database, Calendar_event, Calendar_event.channel_id, Calendar_event.created_at, Calendar_event.sender_id, channel_id, user_id, since):
            return True
        query = database.query(Calendar_event_comment.id).join(Calendar_event, Calendar_event_comment.event_id == Calendar_event.id).filter(
            Calendar_event.channel_id == channel_id,
            Calendar_event_comment.user_id.isnot(None),
            Calendar_event_comment.user_id != user_id,
        )
        if since is not None:
            query = query.filter(Calendar_event_comment.created_at > since)
        return query.first() is not None
    return other_authored_after(database, Channel_messages, Channel_messages.channel_id, Channel_messages.timestamp, Channel_messages.sender_id, channel_id, user_id, since)


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
    roles = mentionable_role_rows(database, server.id)
    message.content = tokenize_channel_mentions(database, server, message.sender_id, message.content)
    content, pinged = tokenize_mentions(message.content, members, roles, server_allows_everyone(database, server, message.sender_id, message.channel_id))
    online_ids = [uid for uid in member_ids if uid in active_connections]
    targets = expand_pinged(pinged, member_ids, online_ids, role_member_lookup(database, pinged_role_ids(pinged)))
    add_reply_ping(targets, reply_author_id, message.sender_id)
    message.content = content
    write_mentions(database, "channel", message.id, targets, server_id= server.id, channel_id= message.channel_id)
    return content, list(targets)

def apply_party_mentions(database, message, member_ids, reply_author_id=None):
    members = member_records(database, member_ids)
    # Parties have no roles. Only @user / @everyone / @here.
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
    roles = mentionable_role_rows(database, server.id)
    text = tokenize_channel_mentions(database, server, sender_id, text or "")
    content, pinged = tokenize_mentions(text, members, roles, server_allows_everyone(database, server, sender_id, channel_id))
    online_ids = [uid for uid in member_ids if uid in active_connections]
    targets = expand_pinged(pinged, member_ids, online_ids, role_member_lookup(database, pinged_role_ids(pinged)))
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

NOTIFY_RANK = {"nothing": 0, "mentions": 1, "all": 2}


def clean_personal_level(value):
    kind = (value or "").strip().lower()
    if kind in NOTIFY_RANK:
        return kind
    return None


def inherited_server_level(member, server):
    stored = clean_personal_level(getattr(member, "notify_level", None) if member else None)
    if stored:
        return stored
    return "all"


def notify_gate(database, server, channel_id, user_id):
    member = None
    if server:
        member = database.query(Server_members).filter(
            Server_members.server_id == server.id,
            Server_members.user_id == user_id,
        ).first()
    row = database.query(Server_notifications).filter(
        Server_notifications.channel_id == channel_id,
        Server_notifications.user_id == user_id,
    ).first()
    server_level = inherited_server_level(member, server)
    channel_level = clean_personal_level(row.notify_level) if row else None
    level = server_level
    if channel_level is not None and NOTIFY_RANK[channel_level] < NOTIFY_RANK[server_level]:
        level = channel_level
    muted = bool(member and member.muted) or bool(row and row.muted)
    if muted and level == "all":
        level = "mentions"
    blocked = set()
    if bool(member and member.suppress_pings) or bool(row and row.suppress_pings):
        blocked.add("everyone")
    if bool(member and getattr(member, "suppress_roles", False)) or bool(row and getattr(row, "suppress_roles", False)):
        blocked.add("role")
    return level, blocked


def mention_allowed(database, server, channel_id, user_id, source):
    level, blocked = notify_gate(database, server, channel_id, user_id)
    if level == "nothing":
        return False
    return (source or "user") not in blocked


def shape_channel_notice(unread, mention_count, level):
    mentions = 0 if level == "nothing" else int(mention_count or 0)
    if level == "all":
        show = bool(unread)
    elif level == "mentions":
        show = mentions > 0
    else:
        show = False
        mentions = 0
    return {"unread": show, "mention_count": mentions}


def notify_gate_from(member, row):
    server_level = inherited_server_level(member, None)
    channel_level = clean_personal_level(row.notify_level) if row else None
    level = server_level
    if channel_level is not None and NOTIFY_RANK[channel_level] < NOTIFY_RANK[server_level]:
        level = channel_level
    muted = bool(member and member.muted) or bool(row and row.muted)
    if muted and level == "all":
        level = "mentions"
    blocked = set()
    if bool(member and member.suppress_pings) or bool(row and row.suppress_pings):
        blocked.add("everyone")
    if bool(member and getattr(member, "suppress_roles", False)) or bool(row and getattr(row, "suppress_roles", False)):
        blocked.add("role")
    return level, blocked


def _latest_by_channel(database, channel_col, time_col, author_col, channel_ids, user_id):
    if not channel_ids:
        return {}
    rows = database.query(channel_col, func.max(time_col)).filter(
        channel_col.in_(list(channel_ids)),
        author_col.isnot(None),
        author_col != user_id,
    ).group_by(channel_col).all()
    return {cid: latest for cid, latest in rows}


def _unseen_from_latest(latest_map, viewed):
    out = set()
    for cid, latest in latest_map.items():
        since = viewed.get(cid)
        if since is not None and latest and latest > since:
            out.add(cid)
    return out


def _unseen_comment_channels(database, comment_model, comment_time, comment_author, post_model, post_channel, post_id_col, channel_ids, user_id, viewed):
    if not channel_ids:
        return set()
    rows = database.query(post_channel, func.max(comment_time)).join(
        post_model, post_id_col == post_model.id
    ).filter(
        post_channel.in_(list(channel_ids)),
        comment_author.isnot(None),
        comment_author != user_id,
    ).group_by(post_channel).all()
    return _unseen_from_latest({cid: latest for cid, latest in rows}, viewed)


def unseen_channel_ids(database, channels, user_id, viewed):
    by_kind = {}
    for channel in channels:
        if channel.id not in viewed:
            continue
        kind = (channel.channel_type or "text").lower()
        if kind not in ("announcements", "forums", "lists", "media", "docs", "events"):
            kind = "text"
        by_kind.setdefault(kind, []).append(channel.id)
    unseen = set()
    unseen |= _unseen_from_latest(
        _latest_by_channel(database, Channel_messages.channel_id, Channel_messages.timestamp, Channel_messages.sender_id, by_kind.get("text") or [], user_id),
        viewed,
    )
    unseen |= _unseen_from_latest(
        _latest_by_channel(database, Announcement_post.channel_id, Announcement_post.created_at, Announcement_post.sender_id, by_kind.get("announcements") or [], user_id),
        viewed,
    )
    unseen |= _unseen_comment_channels(
        database, Announcement_comment, Announcement_comment.created_at, Announcement_comment.sender_id,
        Announcement_post, Announcement_post.channel_id, Announcement_comment.post_id,
        by_kind.get("announcements") or [], user_id, viewed,
    )
    unseen |= _unseen_from_latest(
        _latest_by_channel(database, Forum_post.channel_id, Forum_post.created_at, Forum_post.author_id, by_kind.get("forums") or [], user_id),
        viewed,
    )
    unseen |= _unseen_comment_channels(
        database, Forum_messages, Forum_messages.created_at, Forum_messages.author_id,
        Forum_post, Forum_post.channel_id, Forum_messages.post_id,
        by_kind.get("forums") or [], user_id, viewed,
    )
    unseen |= _unseen_from_latest(
        _latest_by_channel(database, List_item.channel_id, List_item.created_at, List_item.sender_id, by_kind.get("lists") or [], user_id),
        viewed,
    )
    unseen |= _unseen_comment_channels(
        database, List_thread_message, List_thread_message.created_at, List_thread_message.sender_id,
        List_item, List_item.channel_id, List_thread_message.item_id,
        by_kind.get("lists") or [], user_id, viewed,
    )
    unseen |= _unseen_from_latest(
        _latest_by_channel(database, Media_item.channel_id, Media_item.created_at, Media_item.sender_id, by_kind.get("media") or [], user_id),
        viewed,
    )
    unseen |= _unseen_comment_channels(
        database, Media_comment, Media_comment.created_at, Media_comment.sender_id,
        Media_item, Media_item.channel_id, Media_comment.item_id,
        by_kind.get("media") or [], user_id, viewed,
    )
    unseen |= _unseen_from_latest(
        _latest_by_channel(database, Doc_entry.channel_id, Doc_entry.created_at, Doc_entry.sender_id, by_kind.get("docs") or [], user_id),
        viewed,
    )
    unseen |= _unseen_from_latest(
        _latest_by_channel(database, Calendar_event.channel_id, Calendar_event.created_at, Calendar_event.sender_id, by_kind.get("events") or [], user_id),
        viewed,
    )
    unseen |= _unseen_comment_channels(
        database, Calendar_event_comment, Calendar_event_comment.created_at, Calendar_event_comment.user_id,
        Calendar_event, Calendar_event.channel_id, Calendar_event_comment.event_id,
        by_kind.get("events") or [], user_id, viewed,
    )
    return unseen


def channel_notices_for(database, user_id, channels, member=None, member_of=None, server_of=None):
    empty = {"unread": False, "mention_count": 0}
    if not channels:
        return {}
    ids = [channel.id for channel in channels]
    viewed_rows = database.query(Channel_last_viewed).filter(
        Channel_last_viewed.user_id == user_id,
        Channel_last_viewed.channel_id.in_(ids),
    ).all()
    viewed = {row.channel_id: row.last_viewed_at for row in viewed_rows}
    notify_rows = database.query(Server_notifications).filter(
        Server_notifications.user_id == user_id,
        Server_notifications.channel_id.in_(ids),
    ).all()
    notify_map = {row.channel_id: row for row in notify_rows}
    unseen = unseen_channel_ids(database, channels, user_id, viewed)
    mention_rows = []
    if viewed:
        mention_rows = database.query(
            Message_mention.channel_id,
            Message_mention.source,
            func.count(Message_mention.id),
        ).join(
            Channel_last_viewed,
            and_(
                Channel_last_viewed.channel_id == Message_mention.channel_id,
                Channel_last_viewed.user_id == Message_mention.user_id,
            ),
        ).filter(
            Message_mention.user_id == user_id,
            Message_mention.channel_id.in_(list(viewed.keys())),
            Message_mention.created_at > Channel_last_viewed.last_viewed_at,
        ).group_by(Message_mention.channel_id, Message_mention.source).all()
    mention_parts = {}
    for channel_id, source, count in mention_rows:
        mention_parts.setdefault(channel_id, []).append((source, int(count or 0)))
    out = {}
    for channel in channels:
        if channel.id not in viewed:
            out[channel.id] = dict(empty)
            continue
        row_member = member
        if row_member is None and member_of is not None:
            server = server_of.get(channel.id) if server_of else None
            row_member = member_of.get(server.id) if server else None
        level, blocked = notify_gate_from(row_member, notify_map.get(channel.id))
        mention_count = 0
        for source, count in mention_parts.get(channel.id, []):
            if blocked and source in blocked:
                continue
            mention_count += count
        out[channel.id] = shape_channel_notice(channel.id in unseen, mention_count, level)
    return out


def channel_notice(database, channel_id, user_id):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel:
        return {"unread": False, "mention_count": 0}
    server = None
    member = None
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    if category:
        server = database.query(Servers).filter(Servers.id == category.server_id).first()
        if server:
            member = database.query(Server_members).filter(
                Server_members.server_id == server.id,
                Server_members.user_id == user_id,
            ).first()
    return channel_notices_for(database, user_id, [channel], member=member).get(channel.id) or {"unread": False, "mention_count": 0}

def visible_channel_ids(database, server_id, user_id):
    server = database.query(Servers).filter(Servers.id == server_id).first()
    if not server:
        return []
    from app.routers.roles import visible_channels_for_user_servers
    shown = visible_channels_for_user_servers(database, user_id, [server]).get(server.id) or []
    return [channel.id for channel in shown]

def server_notice(database, server_id, user_id):
    server = database.query(Servers).filter(Servers.id == server_id).first()
    if not server:
        return {"unread": False, "mention_count": 0, "channels": {}}
    from app.routers.roles import visible_channels_for_user_servers
    member = database.query(Server_members).filter(
        Server_members.server_id == server_id,
        Server_members.user_id == user_id,
    ).first()
    shown = visible_channels_for_user_servers(database, user_id, [server]).get(server.id) or []
    notices = channel_notices_for(database, user_id, shown, member=member)
    any_unread = False
    mention_total = 0
    for notice in notices.values():
        if notice["unread"]:
            any_unread = True
        mention_total += notice["mention_count"]
    return {"unread": any_unread, "mention_count": mention_total, "channels": notices}

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
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    from app.routers.roles import channel_type_visible, effective_perms_for_user_in_channel
    if server and not channel_type_visible(effective_perms_for_user_in_channel(database, server, current_user.id, channel.id), channel.channel_type):
        raise HTTPException(status_code=403, detail="You do not have permission to view this channel.")
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
