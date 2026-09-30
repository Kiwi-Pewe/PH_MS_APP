from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, List_item, List_check
from app.schemas import List_item_create, List_item_check, List_item_delete
from app.database import get_db
from app.auth import get_current_user
from app.routers.realtime import server_broadcast
from app.routers.roles import require_channel_perm

router = APIRouter()


def load_list_channel(database, channel_id, user_id):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel or channel.channel_type != "lists":
        raise HTTPException(status_code=404, detail="Channel not found")
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first() if category else None
    if not server:
        raise HTTPException(status_code=404, detail="Channel not found")
    member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == user_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Channel not found")
    is_owner = server.owner_id == user_id
    if (category.is_private or channel.is_private) and not is_owner:
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel, server


def serialize_item(database, item, user_id):
    author = database.query(UserInfo).filter(UserInfo.id == item.sender_id).first()
    checked = database.query(List_check).filter(List_check.item_id == item.id, List_check.user_id == user_id).first()
    return {
        "id": item.id,
        "channel_id": item.channel_id,
        "title": item.title,
        "body": item.body or "",
        "sender_id": item.sender_id,
        "username": author.username if author and author.username else "Someone",
        "created_at": str(item.created_at),
        "checked": bool(checked),
    }


@router.get("/get_list/{channel_id}")
def get_list(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, _server = load_list_channel(database, channel_id, current_user.id)
    items = database.query(List_item).filter(List_item.channel_id == channel.id).order_by(List_item.position.asc(), List_item.id.asc()).all()
    return {"channel_id": channel.id, "items": [serialize_item(database, item, current_user.id) for item in items]}


@router.post("/list_item")
async def create_list_item(body: List_item_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, server = load_list_channel(database, body.channel_id, current_user.id)
    require_channel_perm(database, server, current_user.id, channel.id, "manage_channels", "You do not have permission to add list items.")
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required.")
    if len(title) > 200:
        title = title[:200]
    text = (body.body or "").strip()
    if len(text) > 2000:
        text = text[:2000]
    highest = database.query(List_item.position).filter(List_item.channel_id == channel.id).order_by(List_item.position.desc()).first()
    item = List_item(
        channel_id=channel.id,
        title=title,
        body=text or None,
        sender_id=current_user.id,
        position=100 if not highest or highest[0] is None else int(highest[0]) + 100,
    )
    database.add(item)
    database.commit()
    database.refresh(item)
    payload = serialize_item(database, item, current_user.id)
    await server_broadcast(server_id=server.id, payload={"type": "list_item_created", "server_id": server.id, "item": payload}, database=database, exclude_user_id=current_user.id)
    return payload


@router.post("/list_item_check")
def set_list_item_check(body: List_item_check, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    item = database.query(List_item).filter(List_item.id == body.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    load_list_channel(database, item.channel_id, current_user.id)
    existing = database.query(List_check).filter(List_check.item_id == item.id, List_check.user_id == current_user.id).first()
    if body.on and not existing:
        database.add(List_check(item_id=item.id, user_id=current_user.id))
        try:
            database.commit()
        except IntegrityError:
            database.rollback()
    elif not body.on and existing:
        database.delete(existing)
        database.commit()
    return {"item_id": item.id, "checked": bool(body.on)}


@router.post("/delete_list_item")
async def delete_list_item(body: List_item_delete, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    item = database.query(List_item).filter(List_item.id == body.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    channel, server = load_list_channel(database, item.channel_id, current_user.id)
    require_channel_perm(database, server, current_user.id, channel.id, "manage_channels", "You do not have permission to delete list items.")
    item_id = item.id
    channel_id = item.channel_id
    database.query(List_check).filter(List_check.item_id == item.id).delete(synchronize_session=False)
    database.delete(item)
    database.commit()
    await server_broadcast(server_id=server.id, payload={"type": "list_item_deleted", "server_id": server.id, "channel_id": channel_id, "item_id": item_id}, database=database, exclude_user_id=current_user.id)
    return {"ok": True}
