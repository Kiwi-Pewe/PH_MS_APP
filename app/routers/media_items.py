from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Media_item, Media_comment
from app.schemas import Media_item_create, Media_item_edit, Media_item_delete, Media_comment_create
from app.database import get_db
from app.auth import get_current_user
from app.routers.realtime import server_broadcast
from app.routers.roles import highest_role_for_user, effective_perms_for_user_in_channel, require_channel_perm, name_color_role_for_user, name_color_roles_by_user
from app.routers.mentions import apply_server_text_mentions, decorate_ids, mention_user_map, mention_role_map, mentioned_user_ids, clear_mentions
from app.routers.profile import avatar_lookup, public_avatar
from app.routers.reactions import clear_reactions, reactions_for_messages
from app.routers.pins import clear_pins
from app.routers.deletion import write_audit_log
from app.routers.feed import notify_activity_post_comment

router = APIRouter()
MEDIA_KINDS = {"image", "video", "link"}


def load_media_channel(database, channel_id, user_id):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel or channel.channel_type != "media":
        raise HTTPException(status_code=404, detail="Channel not found")
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first() if category else None
    if not server:
        raise HTTPException(status_code=404, detail="Channel not found")
    member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == user_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Channel not found")
    if (category.is_private or channel.is_private) and server.owner_id != user_id:
        raise HTTPException(status_code=404, detail="Channel not found")
    perms = effective_perms_for_user_in_channel(database, server, user_id, channel.id)
    if not perms.get("see_media"):
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel, server


def stamp(value):
    if not value:
        return ""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def clean_title(value):
    title = (value or "").strip()
    if not title:
        title = "Untitled media"
    if len(title) > 200:
        title = title[:200]
    return title


def clean_description(value):
    text = value or ""
    if len(text) > 4000:
        text = text[:4000]
    return text


def clean_url(value):
    url = (value or "").strip()
    if not url.lower().startswith("http://") and not url.lower().startswith("https://"):
        raise HTTPException(status_code=400, detail="A file or a link is required.")
    if len(url) > 2000:
        raise HTTPException(status_code=400, detail="That link is too long.")
    return url


def clean_kind(value):
    kind = (value or "").strip()
    if kind not in MEDIA_KINDS:
        return "image"
    return kind


def clean_span(value):
    try:
        number = int(value or 0)
    except (TypeError, ValueError):
        return 0
    if number < 0:
        return 0
    if number > 20000:
        return 20000
    return number


def username_for(database, user_id):
    account = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    if account and account.username:
        return account.username
    return "Someone"


def role_name_for(database, server_id, user_id, cache):
    if user_id in cache:
        return cache[user_id]
    role = highest_role_for_user(database, server_id, user_id)
    name = (role or {}).get("name") or ""
    cache[user_id] = name
    return name


def require_media_edit(database, server, user_id, item):
    if item.sender_id == user_id:
        return
    require_channel_perm(database, server, user_id, item.channel_id, "manage_media", "You do not have permission to edit that media.")


def require_media_delete(database, server, user_id, item):
    if item.sender_id == user_id:
        return
    require_channel_perm(database, server, user_id, item.channel_id, "remove_media", "You do not have permission to delete that media.")


def comment_counts(database, item_ids):
    if not item_ids:
        return {}
    rows = database.query(Media_comment.item_id, func.count(Media_comment.id)).filter(Media_comment.item_id.in_(item_ids)).group_by(Media_comment.item_id).all()
    return {item_id: int(total) for item_id, total in rows}


def serialize_item(database, item, server_id, roles, counts=None):
    total = None if counts is None else counts.get(item.id)
    if total is None:
        total = comment_counts(database, [item.id]).get(item.id, 0)
    return {
        "id": item.id,
        "channel_id": item.channel_id,
        "title": item.title or "Untitled media",
        "description": item.description or "",
        "kind": item.kind or "image",
        "url": item.url or "",
        "width": int(item.width or 0),
        "height": int(item.height or 0),
        "sender_id": item.sender_id,
        "sender_username": username_for(database, item.sender_id),
        "sender_role": role_name_for(database, server_id, item.sender_id, roles),
        "comment_count": int(total),
        "created_at": stamp(item.created_at),
        "updated_at": stamp(item.updated_at or item.created_at),
    }


@router.get("/get_media_items/{channel_id}")
def get_media_items(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, server = load_media_channel(database, channel_id, current_user.id)
    rows = database.query(Media_item).filter(Media_item.channel_id == channel.id).all()

    def when(row):
        value = row.created_at
        if not value:
            return datetime.min.replace(tzinfo=timezone.utc)
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value

    rows.sort(key=when, reverse=True)
    roles = {}
    counts = comment_counts(database, [row.id for row in rows])
    return {"channel_id": channel.id, "items": [serialize_item(database, row, server.id, roles, counts) for row in rows]}


@router.post("/create_media_item")
async def create_media_item(body: Media_item_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, server = load_media_channel(database, body.channel_id, current_user.id)
    require_channel_perm(database, server, current_user.id, channel.id, "create_media", "You do not have permission to add media.")
    now = datetime.now(timezone.utc)
    item = Media_item(
        channel_id=channel.id,
        title=clean_title(body.title),
        description=clean_description(body.description),
        kind=clean_kind(body.kind),
        url=clean_url(body.url),
        width=clean_span(body.width),
        height=clean_span(body.height),
        sender_id=current_user.id,
        updated_at=now,
    )
    database.add(item)
    database.commit()
    database.refresh(item)
    payload = serialize_item(database, item, server.id, {})
    await server_broadcast(server_id=server.id, payload={"type": "media_item_created", "server_id": server.id, "item": payload}, database=database, exclude_user_id=current_user.id)
    return payload


@router.post("/edit_media_item")
async def edit_media_item(body: Media_item_edit, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    item = database.query(Media_item).filter(Media_item.id == body.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Media not found")
    _channel, server = load_media_channel(database, item.channel_id, current_user.id)
    require_media_edit(database, server, current_user.id, item)
    item.title = clean_title(body.title)
    item.description = clean_description(body.description)
    item.updated_at = datetime.now(timezone.utc)
    database.commit()
    database.refresh(item)
    payload = serialize_item(database, item, server.id, {})
    await server_broadcast(server_id=server.id, payload={"type": "media_item_updated", "server_id": server.id, "item": payload}, database=database, exclude_user_id=current_user.id)
    return payload


@router.post("/delete_media_item")
async def delete_media_item(body: Media_item_delete, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    item = database.query(Media_item).filter(Media_item.id == body.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Media not found")
    channel_id = item.channel_id
    _channel, server = load_media_channel(database, channel_id, current_user.id)
    require_media_delete(database, server, current_user.id, item)
    item_id = item.id
    comments = database.query(Media_comment).filter(Media_comment.item_id == item.id).all()
    for comment in comments:
        clear_reactions(database, "media_comment", comment.id)
        clear_pins(database, "media_comment", comment.id)
        clear_mentions(database, "media_comment", comment.id)
        database.delete(comment)
    database.delete(item)
    database.commit()
    await server_broadcast(server_id=server.id, payload={"type": "media_item_deleted", "server_id": server.id, "channel_id": channel_id, "item_id": item_id}, database=database, exclude_user_id=current_user.id)
    return {"item_id": item_id, "channel_id": channel_id}


def clean_comment(value):
    text = (value or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Write a comment first.")
    if len(text) > 2000:
        text = text[:2000]
    return text


def comment_total(database, item_id):
    return int(database.query(func.count(Media_comment.id)).filter(Media_comment.item_id == item_id).scalar() or 0)


@router.post("/post_media_comment")
async def post_media_comment(body: Media_comment_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    item = database.query(Media_item).filter(Media_item.id == body.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Media not found")
    channel, server = load_media_channel(database, item.channel_id, current_user.id)
    member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()
    from app.routers.moderation import require_not_timed_out
    require_not_timed_out(member)
    comment = Media_comment(item_id=item.id, sender_id=current_user.id, content=clean_comment(body.content))
    database.add(comment)
    database.flush()
    comment.content = apply_server_text_mentions(database, comment.content, "media_comment", comment.id, server, channel.id, sender_id=current_user.id)
    database.commit()
    database.refresh(comment)
    users_map = mention_user_map(database, comment.content)
    roles_map = mention_role_map(database, comment.content)
    pinged_ids = mentioned_user_ids(database, "media_comment", comment.id)
    total = comment_total(database, item.id)
    payload_comment = {
        "id": comment.id,
        "item_id": item.id,
        "post_id": item.id,
        "sender_id": current_user.id,
        "username": current_user.username,
        "avatar": public_avatar(current_user),
        "content": comment.content,
        "created_at": str(comment.created_at),
        "comment_count": total,
        "reactions": [],
        "mention_users": users_map,
        "mention_roles": roles_map,
        "mentioned_ids": pinged_ids,
        "name_role": name_color_role_for_user(database, server.id, current_user.id),
        "chatKind": "media_comment",
    }
    await server_broadcast(server_id=server.id, payload={"type": "media_comment", "server_id": server.id, "channel_id": channel.id, "item_id": item.id, "comment": payload_comment}, database=database, exclude_user_id=current_user.id)
    if item.sender_id:
        await notify_activity_post_comment(database, receiver_id=item.sender_id, actor_id=current_user.id, post_kind="media", post_id=item.id, server_id=server.id, channel_id=channel.id)
    return payload_comment


@router.get("/get_media_comments/{item_id}")
def get_media_comments(item_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user), after_id: int = None, limit: int = 3):
    item = database.query(Media_item).filter(Media_item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Media not found")
    channel, server = load_media_channel(database, item.channel_id, current_user.id)
    size = max(1, min(int(limit or 3), 50))
    query = database.query(Media_comment).filter(Media_comment.item_id == item.id)
    if after_id:
        query = query.filter(Media_comment.id > after_id)
    rows = query.order_by(Media_comment.id.asc()).limit(size).all()
    if not rows:
        return {"item_id": item.id, "channel_id": channel.id, "comments": []}
    sender_ids = list({row.sender_id for row in rows})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(sender_ids)).all() if sender_ids else []
    names = {account.id: account.username for account in accounts}
    faces = avatar_lookup(accounts)
    reaction_map = reactions_for_messages(database, "media_comment", [row.id for row in rows], current_user.id)
    mention_meta = decorate_ids(database, "media_comment", [row.id for row in rows], [row.content for row in rows], current_user.id)
    name_map = name_color_roles_by_user(database, server.id, sender_ids)
    comments = []
    for index, row in enumerate(rows):
        comments.append({
            "id": row.id,
            "item_id": item.id,
            "post_id": item.id,
            "sender_id": row.sender_id,
            "content": row.content,
            "username": names.get(row.sender_id) or "Someone",
            "avatar": faces.get(row.sender_id),
            "name_role": name_map.get(row.sender_id),
            "created_at": str(row.created_at),
            "reactions": reaction_map.get(row.id, []),
            "mentioned": mention_meta[index]["mentioned"],
            "mention_users": mention_meta[index]["mention_users"],
            "mention_roles": mention_meta[index]["mention_roles"],
            "chatKind": "media_comment",
        })
    return {"item_id": item.id, "channel_id": channel.id, "comments": comments}


@router.post("/delete_media_comment/{comment_id}")
async def delete_media_comment(comment_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    comment = database.query(Media_comment).filter(Media_comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    item = database.query(Media_item).filter(Media_item.id == comment.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Media not found")
    channel, server = load_media_channel(database, item.channel_id, current_user.id)
    if current_user.id != comment.sender_id and current_user.id != server.owner_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete comment")
    author = database.query(UserInfo).filter(UserInfo.id == comment.sender_id).first()
    write_audit_log(database, server.id, current_user.id, "delete_comment", "media_comment", comment.id, {
        "content": comment.content,
        "author_id": comment.sender_id,
        "author_username": author.username if author else None,
        "item_id": item.id,
    })
    clear_reactions(database, "media_comment", comment.id)
    clear_pins(database, "media_comment", comment.id)
    clear_mentions(database, "media_comment", comment.id)
    database.delete(comment)
    database.commit()
    total = comment_total(database, item.id)
    await server_broadcast(server_id=server.id, payload={"type": "media_comment_deleted", "server_id": server.id, "channel_id": channel.id, "item_id": item.id, "comment_id": comment_id, "comment_count": total}, database=database, exclude_user_id=current_user.id)
    return {"comment_id": comment_id, "item_id": item.id, "comment_count": total}
