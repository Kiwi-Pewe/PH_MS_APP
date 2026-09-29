from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from datetime import datetime
from app.models import (
    UserInfo, Message, Party_messages, Party_members, Channel_messages,
    Forum_messages, Forum_post, Announcement_post, Announcement_comment,
    Servers, Server_members, Server_categories, Server_channels, Conversations,
    Message_pin,
)
from app.schemas import Pin_message
from app.database import get_db
from app.auth import get_current_user
from app.r2 import attachment_public
from app.routers.realtime import server_broadcast, notify_user, notify_party
from app.routers.reactions import reactions_for_one
from app.routers.profile import public_avatar
from app.site_moderation import mask_message_payloads

router = APIRouter()

PIN_PAGE_SIZE = 25
PIN_MESSAGE_KINDS = ("dm", "party", "channel", "forum", "forum_post", "announcement", "comment")


def clear_pins(database, kind, message_id):
    database.query(Message_pin).filter(
        Message_pin.message_kind == kind,
        Message_pin.message_id == message_id,
    ).delete(synchronize_session=False)


def clear_pins_for_ids(database, kind, message_ids):
    if not message_ids:
        return
    database.query(Message_pin).filter(
        Message_pin.message_kind == kind,
        Message_pin.message_id.in_(list(message_ids)),
    ).delete(synchronize_session=False)


def find_dm_conversation(database, user_a, user_b):
    return database.query(Conversations).filter(
        or_(
            and_(Conversations.user_1 == user_a, Conversations.user_2 == user_b),
            and_(Conversations.user_1 == user_b, Conversations.user_2 == user_a),
        )
    ).first()


def ensure_dm_conversation(database, user_a, user_b):
    convo = find_dm_conversation(database, user_a, user_b)
    if convo:
        return convo
    convo = Conversations(
        user_1=user_a,
        user_2=user_b,
        last_message_at=datetime.utcnow(),
    )
    database.add(convo)
    database.flush()
    return convo


def channel_server_bundle(database, channel_id):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel:
        return None, None, None, None
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    if not category:
        return None, None, None, None
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    if not server:
        return None, None, None, None
    return channel, category, server, None


def require_server_member_row(database, server, user_id):
    row = database.query(Server_members).filter(
        Server_members.server_id == server.id,
        Server_members.user_id == user_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="No message found")
    return row


def require_pin_perm(database, server, user_id, channel_id):
    from app.routers.roles import require_channel_perm
    require_channel_perm(
        database, server, user_id, channel_id, "pin_messages",
        "You do not have permission to pin messages.",
    )


def resolve_message(database, kind, message_id, current_user):
    if kind == "dm":
        msg = database.query(Message).filter(Message.id == message_id).first()
        if not msg or (current_user.id != msg.sender_id and current_user.id != msg.receiver_id):
            raise HTTPException(status_code=404, detail="No message found")
        if msg.sender_id is None:
            raise HTTPException(status_code=400, detail="Cannot pin this message")
        if msg.deletion_state in ("pending", "deleted"):
            raise HTTPException(status_code=400, detail="Cannot pin this message")
        other_id = msg.receiver_id if current_user.id == msg.sender_id else msg.sender_id
        convo = ensure_dm_conversation(database, current_user.id, other_id)
        return {
            "msg": msg,
            "scope_kind": "dm",
            "scope_id": convo.id,
            "server": None,
            "channel": None,
            "party_id": None,
        }

    if kind == "party":
        msg = database.query(Party_messages).filter(Party_messages.id == message_id).first()
        if not msg:
            raise HTTPException(status_code=404, detail="No message found")
        in_party = database.query(Party_members).filter(
            Party_members.party_id == msg.party_id,
            Party_members.user_id == current_user.id,
        ).first()
        if not in_party:
            raise HTTPException(status_code=404, detail="No message found")
        if msg.sender_id is None:
            raise HTTPException(status_code=400, detail="Cannot pin this message")
        if msg.deletion_state in ("pending", "deleted"):
            raise HTTPException(status_code=400, detail="Cannot pin this message")
        return {
            "msg": msg,
            "scope_kind": "party",
            "scope_id": msg.party_id,
            "server": None,
            "channel": None,
            "party_id": msg.party_id,
        }

    if kind == "channel":
        msg = database.query(Channel_messages).filter(Channel_messages.id == message_id).first()
        if not msg:
            raise HTTPException(status_code=404, detail="No message found")
        channel, category, server, _ = channel_server_bundle(database, msg.channel_id)
        if not channel:
            raise HTTPException(status_code=404, detail="No message found")
        require_server_member_row(database, server, current_user.id)
        from app.routers.roles import require_channel_perm
        require_channel_perm(database, server, current_user.id, channel.id, "read_messages", "You do not have permission to read messages.")
        require_pin_perm(database, server, current_user.id, channel.id)
        if msg.sender_id is None:
            raise HTTPException(status_code=400, detail="Cannot pin this message")
        return {
            "msg": msg,
            "scope_kind": "channel",
            "scope_id": channel.id,
            "server": server,
            "channel": channel,
            "party_id": None,
        }

    if kind == "forum":
        msg = database.query(Forum_messages).filter(Forum_messages.id == message_id).first()
        if not msg:
            raise HTTPException(status_code=404, detail="No message found")
        post = database.query(Forum_post).filter(Forum_post.id == msg.post_id).first()
        if not post:
            raise HTTPException(status_code=404, detail="No message found")
        channel, category, server, _ = channel_server_bundle(database, post.channel_id)
        if not channel:
            raise HTTPException(status_code=404, detail="No message found")
        require_server_member_row(database, server, current_user.id)
        from app.routers.roles import require_channel_perm
        require_channel_perm(database, server, current_user.id, channel.id, "read_forums", "You do not have permission to read forums.")
        require_pin_perm(database, server, current_user.id, channel.id)
        if msg.author_id is None:
            raise HTTPException(status_code=400, detail="Cannot pin this message")
        return {
            "msg": msg,
            "scope_kind": "channel",
            "scope_id": channel.id,
            "server": server,
            "channel": channel,
            "party_id": None,
            "post_id": post.id,
        }

    if kind == "forum_post":
        post = database.query(Forum_post).filter(Forum_post.id == message_id).first()
        if not post:
            raise HTTPException(status_code=404, detail="No message found")
        channel, category, server, _ = channel_server_bundle(database, post.channel_id)
        if not channel:
            raise HTTPException(status_code=404, detail="No message found")
        require_server_member_row(database, server, current_user.id)
        from app.routers.roles import require_channel_perm
        require_channel_perm(database, server, current_user.id, channel.id, "read_forums", "You do not have permission to read forums.")
        require_pin_perm(database, server, current_user.id, channel.id)
        if post.author_id is None:
            raise HTTPException(status_code=400, detail="Cannot pin this message")
        return {
            "msg": post,
            "scope_kind": "channel",
            "scope_id": channel.id,
            "server": server,
            "channel": channel,
            "party_id": None,
            "post_id": post.id,
        }

    if kind == "announcement":
        post = database.query(Announcement_post).filter(Announcement_post.id == message_id).first()
        if not post:
            raise HTTPException(status_code=404, detail="No message found")
        channel, category, server, _ = channel_server_bundle(database, post.channel_id)
        if not channel:
            raise HTTPException(status_code=404, detail="No message found")
        require_server_member_row(database, server, current_user.id)
        from app.routers.roles import require_channel_perm
        require_channel_perm(database, server, current_user.id, channel.id, "view_announcements", "You do not have permission to view announcements.")
        require_pin_perm(database, server, current_user.id, channel.id)
        if post.sender_id is None:
            raise HTTPException(status_code=400, detail="Cannot pin this message")
        return {
            "msg": post,
            "scope_kind": "channel",
            "scope_id": channel.id,
            "server": server,
            "channel": channel,
            "party_id": None,
        }

    if kind == "comment":
        comment = database.query(Announcement_comment).filter(Announcement_comment.id == message_id).first()
        if not comment:
            raise HTTPException(status_code=404, detail="No message found")
        post = database.query(Announcement_post).filter(Announcement_post.id == comment.post_id).first()
        if not post:
            raise HTTPException(status_code=404, detail="No message found")
        channel, category, server, _ = channel_server_bundle(database, post.channel_id)
        if not channel:
            raise HTTPException(status_code=404, detail="No message found")
        require_server_member_row(database, server, current_user.id)
        from app.routers.roles import require_channel_perm
        require_channel_perm(database, server, current_user.id, channel.id, "view_announcements", "You do not have permission to view announcements.")
        require_pin_perm(database, server, current_user.id, channel.id)
        if comment.sender_id is None:
            raise HTTPException(status_code=400, detail="Cannot pin this message")
        return {
            "msg": comment,
            "scope_kind": "channel",
            "scope_id": channel.id,
            "server": server,
            "channel": channel,
            "party_id": None,
            "post_id": post.id,
        }

    raise HTTPException(status_code=400, detail="Unknown message kind")


def resolve_scope_access(database, scope_kind, scope_id, current_user):
    if scope_kind == "dm":
        convo = database.query(Conversations).filter(Conversations.id == scope_id).first()
        if not convo or (current_user.id != convo.user_1 and current_user.id != convo.user_2):
            raise HTTPException(status_code=404, detail="Not found")
        return {"scope_kind": "dm", "scope_id": convo.id, "server": None, "channel": None, "party_id": None}

    if scope_kind == "party":
        in_party = database.query(Party_members).filter(
            Party_members.party_id == scope_id,
            Party_members.user_id == current_user.id,
        ).first()
        if not in_party:
            raise HTTPException(status_code=404, detail="Not found")
        return {"scope_kind": "party", "scope_id": scope_id, "server": None, "channel": None, "party_id": scope_id}

    if scope_kind == "channel":
        channel, category, server, _ = channel_server_bundle(database, scope_id)
        if not channel:
            raise HTTPException(status_code=404, detail="Not found")
        require_server_member_row(database, server, current_user.id)
        return {"scope_kind": "channel", "scope_id": channel.id, "server": server, "channel": channel, "party_id": None}

    raise HTTPException(status_code=400, detail="Unknown scope")


def serialize_pin_row(database, pin, current_user):
    kind = pin.message_kind
    message_id = pin.message_id
    base = {
        "pin_id": pin.id,
        "pinned_at": str(pin.pinned_at) if pin.pinned_at else None,
        "pinned_by": pin.pinned_by,
        "message_kind": kind,
        "message_id": message_id,
        "scope_kind": pin.scope_kind,
        "scope_id": pin.scope_id,
    }

    if kind == "dm":
        msg = database.query(Message).filter(Message.id == message_id).first()
        if not msg or msg.deletion_state in ("pending", "deleted"):
            return None
        account = database.query(UserInfo).filter(UserInfo.id == msg.sender_id).first()
        base.update({
            "id": msg.id,
            "sender_id": msg.sender_id,
            "username": account.username if account else "",
            "content": msg.content or "",
            "attachment": attachment_public(msg.attachment),
            "timestamp": str(msg.timestamp),
            "edited": bool(msg.edited),
            "reactions": reactions_for_one(database, "dm", msg.id, current_user.id),
            "avatar": public_avatar(account) if account else None,
            "chat_kind": "dm",
        })
        return base

    if kind == "party":
        msg = database.query(Party_messages).filter(Party_messages.id == message_id).first()
        if not msg or msg.deletion_state in ("pending", "deleted"):
            return None
        account = database.query(UserInfo).filter(UserInfo.id == msg.sender_id).first()
        base.update({
            "id": msg.id,
            "sender_id": msg.sender_id,
            "username": account.username if account else "",
            "content": msg.content or "",
            "attachment": attachment_public(msg.attachment),
            "timestamp": str(msg.timestamp),
            "edited": bool(msg.edited),
            "reactions": reactions_for_one(database, "party", msg.id, current_user.id),
            "avatar": public_avatar(account) if account else None,
            "party_id": msg.party_id,
            "chat_kind": "party",
        })
        return base

    if kind == "channel":
        msg = database.query(Channel_messages).filter(Channel_messages.id == message_id).first()
        if not msg:
            return None
        account = database.query(UserInfo).filter(UserInfo.id == msg.sender_id).first() if msg.sender_id else None
        base.update({
            "id": msg.id,
            "sender_id": msg.sender_id,
            "username": account.username if account else "",
            "content": msg.content or "",
            "attachment": attachment_public(msg.attachment),
            "timestamp": str(msg.timestamp),
            "edited": bool(msg.edited),
            "reactions": reactions_for_one(database, "channel", msg.id, current_user.id),
            "avatar": public_avatar(account) if account else None,
            "channel_id": msg.channel_id,
            "chat_kind": "channel",
        })
        return base

    if kind == "forum":
        msg = database.query(Forum_messages).filter(Forum_messages.id == message_id).first()
        if not msg:
            return None
        account = database.query(UserInfo).filter(UserInfo.id == msg.author_id).first() if msg.author_id else None
        base.update({
            "id": msg.id,
            "sender_id": msg.author_id,
            "username": account.username if account else "",
            "content": msg.content or "",
            "attachment": attachment_public(msg.attachment),
            "timestamp": str(msg.created_at),
            "edited": bool(msg.edited),
            "reactions": reactions_for_one(database, "forum", msg.id, current_user.id),
            "avatar": public_avatar(account) if account else None,
            "post_id": msg.post_id,
            "chat_kind": "forum",
        })
        return base

    if kind == "forum_post":
        post = database.query(Forum_post).filter(Forum_post.id == message_id).first()
        if not post:
            return None
        account = database.query(UserInfo).filter(UserInfo.id == post.author_id).first() if post.author_id else None
        body = post.body or ""
        content = post.title or ""
        if body:
            content = f"{content}\n{body}" if content else body
        base.update({
            "id": post.id,
            "sender_id": post.author_id,
            "username": account.username if account else "",
            "content": content,
            "title": post.title or "",
            "body": post.body or "",
            "attachment": attachment_public(post.attachment),
            "timestamp": str(post.created_at),
            "edited": bool(post.edited),
            "reactions": reactions_for_one(database, "forum_post", post.id, current_user.id),
            "avatar": public_avatar(account) if account else None,
            "post_id": post.id,
            "channel_id": post.channel_id,
            "chat_kind": "forum_post",
        })
        return base

    if kind == "announcement":
        post = database.query(Announcement_post).filter(Announcement_post.id == message_id).first()
        if not post:
            return None
        account = database.query(UserInfo).filter(UserInfo.id == post.sender_id).first() if post.sender_id else None
        body = post.body or ""
        content = post.title or ""
        if body:
            content = f"{content}\n{body}" if content else body
        base.update({
            "id": post.id,
            "sender_id": post.sender_id,
            "username": account.username if account else "",
            "content": content,
            "title": post.title or "",
            "body": post.body or "",
            "attachment": attachment_public(post.attachment),
            "timestamp": str(post.created_at),
            "edited": bool(getattr(post, "edited", False)),
            "reactions": reactions_for_one(database, "announcement", post.id, current_user.id),
            "avatar": public_avatar(account) if account else None,
            "channel_id": post.channel_id,
            "chat_kind": "announcement",
        })
        return base

    if kind == "comment":
        comment = database.query(Announcement_comment).filter(Announcement_comment.id == message_id).first()
        if not comment:
            return None
        account = database.query(UserInfo).filter(UserInfo.id == comment.sender_id).first() if comment.sender_id else None
        base.update({
            "id": comment.id,
            "sender_id": comment.sender_id,
            "username": account.username if account else "",
            "content": comment.content or "",
            "attachment": None,
            "timestamp": str(comment.created_at),
            "edited": False,
            "reactions": reactions_for_one(database, "comment", comment.id, current_user.id),
            "avatar": public_avatar(account) if account else None,
            "post_id": comment.post_id,
            "chat_kind": "comment",
        })
        return base

    return None


async def broadcast_pin_change(resolved, payload, database, exclude_user_id):
    if resolved.get("server"):
        await server_broadcast(
            server_id=resolved["server"].id,
            payload=payload,
            database=database,
            exclude_user_id=exclude_user_id,
        )
        return
    if resolved.get("party_id"):
        await notify_party(resolved["party_id"], payload, database, exclude_user_id=exclude_user_id)
        return
    if resolved.get("scope_kind") == "dm":
        convo = database.query(Conversations).filter(Conversations.id == resolved["scope_id"]).first()
        if not convo:
            return
        other_id = convo.user_2 if exclude_user_id == convo.user_1 else convo.user_1
        if other_id != exclude_user_id:
            await notify_user(other_id, payload)


@router.post("/pin_message")
async def pin_message(body: Pin_message, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    if body.kind not in PIN_MESSAGE_KINDS:
        raise HTTPException(status_code=400, detail="Unknown message kind")
    resolved = resolve_message(database, body.kind, body.message_id, current_user)
    existing = database.query(Message_pin).filter(
        Message_pin.scope_kind == resolved["scope_kind"],
        Message_pin.scope_id == resolved["scope_id"],
        Message_pin.message_kind == body.kind,
        Message_pin.message_id == body.message_id,
    ).first()
    if existing:
        return {"pinned": True, "pin_id": existing.id, "scope_kind": existing.scope_kind, "scope_id": existing.scope_id}
    row = Message_pin(
        scope_kind=resolved["scope_kind"],
        scope_id=resolved["scope_id"],
        message_kind=body.kind,
        message_id=body.message_id,
        pinned_by=current_user.id,
        pinned_at=datetime.utcnow(),
    )
    database.add(row)
    database.commit()
    database.refresh(row)
    payload = {
        "type": "message_pinned",
        "scope_kind": row.scope_kind,
        "scope_id": row.scope_id,
        "message_kind": row.message_kind,
        "message_id": row.message_id,
        "pin_id": row.id,
        "pinned_by": row.pinned_by,
        "channel_id": resolved["channel"].id if resolved.get("channel") else None,
        "party_id": resolved.get("party_id"),
    }
    await broadcast_pin_change(resolved, payload, database, current_user.id)
    return {
        "pinned": True,
        "pin_id": row.id,
        "scope_kind": row.scope_kind,
        "scope_id": row.scope_id,
    }


@router.post("/unpin_message")
async def unpin_message(body: Pin_message, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    if body.kind not in PIN_MESSAGE_KINDS:
        raise HTTPException(status_code=400, detail="Unknown message kind")
    resolved = resolve_message(database, body.kind, body.message_id, current_user)
    row = database.query(Message_pin).filter(
        Message_pin.scope_kind == resolved["scope_kind"],
        Message_pin.scope_id == resolved["scope_id"],
        Message_pin.message_kind == body.kind,
        Message_pin.message_id == body.message_id,
    ).first()
    if not row:
        return {"pinned": False, "scope_kind": resolved["scope_kind"], "scope_id": resolved["scope_id"]}
    pin_id = row.id
    database.delete(row)
    database.commit()
    payload = {
        "type": "message_unpinned",
        "scope_kind": resolved["scope_kind"],
        "scope_id": resolved["scope_id"],
        "message_kind": body.kind,
        "message_id": body.message_id,
        "pin_id": pin_id,
        "channel_id": resolved["channel"].id if resolved.get("channel") else None,
        "party_id": resolved.get("party_id"),
    }
    await broadcast_pin_change(resolved, payload, database, current_user.id)
    return {"pinned": False, "scope_kind": resolved["scope_kind"], "scope_id": resolved["scope_id"]}


@router.get("/pins/{scope_kind}/{scope_id}")
def list_pins(scope_kind: str, scope_id: int, page: int = 1, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    scope = resolve_scope_access(database, scope_kind, scope_id, current_user)
    if scope.get("server") and scope.get("channel"):
        channel = scope["channel"]
        from app.routers.roles import require_channel_perm
        if channel.channel_type == "announcements":
            require_channel_perm(database, scope["server"], current_user.id, channel.id, "view_announcements", "You do not have permission to view announcements.")
        elif channel.channel_type == "forums":
            require_channel_perm(database, scope["server"], current_user.id, channel.id, "read_forums", "You do not have permission to read forums.")
        elif channel.channel_type == "text":
            require_channel_perm(database, scope["server"], current_user.id, channel.id, "read_messages", "You do not have permission to read messages.")
    page = max(1, int(page or 1))
    total = database.query(func.count(Message_pin.id)).filter(
        Message_pin.scope_kind == scope["scope_kind"],
        Message_pin.scope_id == scope["scope_id"],
    ).scalar() or 0
    offset = (page - 1) * PIN_PAGE_SIZE
    rows = database.query(Message_pin).filter(
        Message_pin.scope_kind == scope["scope_kind"],
        Message_pin.scope_id == scope["scope_id"],
    ).order_by(Message_pin.pinned_at.desc(), Message_pin.id.desc()).offset(offset).limit(PIN_PAGE_SIZE).all()
    messages = []
    stale = []
    for pin in rows:
        payload = serialize_pin_row(database, pin, current_user)
        if payload is None:
            stale.append(pin)
            continue
        messages.append(payload)
    for pin in stale:
        database.delete(pin)
    if stale:
        database.commit()
        total = max(0, total - len(stale))
    mask_message_payloads(database, messages)
    pages = max(1, (total + PIN_PAGE_SIZE - 1) // PIN_PAGE_SIZE) if total else 1
    can_pin = True
    if scope.get("server") and scope.get("channel"):
        from app.routers.roles import effective_perms_for_user_in_channel
        can_pin = bool(effective_perms_for_user_in_channel(
            database, scope["server"], current_user.id, scope["channel"].id
        ).get("pin_messages"))
    return {
        "scope_kind": scope["scope_kind"],
        "scope_id": scope["scope_id"],
        "page": page,
        "pages": pages,
        "total": total,
        "page_size": PIN_PAGE_SIZE,
        "messages": messages,
        "can_pin": can_pin,
    }


@router.get("/dm_pin_scope/{peer_id}")
def dm_pin_scope(peer_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    if peer_id == current_user.id:
        raise HTTPException(status_code=400, detail="Invalid peer")
    peer = database.query(UserInfo).filter(UserInfo.id == peer_id).first()
    if not peer:
        raise HTTPException(status_code=404, detail="No user found")
    convo = ensure_dm_conversation(database, current_user.id, peer_id)
    database.commit()
    return {"scope_kind": "dm", "scope_id": convo.id}


@router.get("/pin_ids/{scope_kind}/{scope_id}")
def list_pin_ids(scope_kind: str, scope_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    scope = resolve_scope_access(database, scope_kind, scope_id, current_user)
    rows = database.query(Message_pin.message_kind, Message_pin.message_id).filter(
        Message_pin.scope_kind == scope["scope_kind"],
        Message_pin.scope_id == scope["scope_id"],
    ).all()
    return {
        "scope_kind": scope["scope_kind"],
        "scope_id": scope["scope_id"],
        "pins": [{"kind": kind, "message_id": mid} for kind, mid in rows],
    }
