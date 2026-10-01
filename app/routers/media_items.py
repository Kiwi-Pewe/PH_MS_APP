from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Media_item
from app.schemas import Media_item_create, Media_item_edit, Media_item_delete
from app.database import get_db
from app.auth import get_current_user
from app.routers.realtime import server_broadcast
from app.routers.roles import highest_role_for_user, effective_perms_for_user_in_channel, require_channel_perm

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


def serialize_item(database, item, server_id, roles):
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
    return {"channel_id": channel.id, "items": [serialize_item(database, row, server.id, roles) for row in rows]}


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
    database.delete(item)
    database.commit()
    await server_broadcast(server_id=server.id, payload={"type": "media_item_deleted", "server_id": server.id, "channel_id": channel_id, "item_id": item_id}, database=database, exclude_user_id=current_user.id)
    return {"item_id": item_id, "channel_id": channel_id}
