from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, List_item, List_thread_message
from app.schemas import List_item_create, List_item_check, List_item_delete, List_item_edit, List_item_note, List_item_move, List_thread_create
from app.database import get_db
from app.auth import get_current_user
from app.routers.realtime import server_broadcast

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


def username_for(database, user_id):
    if not user_id:
        return ""
    account = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    return account.username if account and account.username else "Someone"


def serialize_item(database, item):
    return {
        "id": item.id,
        "channel_id": item.channel_id,
        "title": item.title,
        "sender_id": item.sender_id,
        "username": username_for(database, item.sender_id),
        "created_at": str(item.created_at),
        "note": item.note or "",
        "note_sender_id": item.note_sender_id,
        "note_username": username_for(database, item.note_sender_id) if item.note else "",
        "note_at": str(item.note_at) if item.note_at else "",
        "completed": bool(item.completed_at),
        "completed_by": item.completed_by,
        "completed_at": str(item.completed_at) if item.completed_at else "",
        "thread_count": database.query(List_thread_message).filter(List_thread_message.item_id == item.id).count(),
    }


def list_destinations(database, server, user_id, skip_channel_id):
    is_owner = server.owner_id == user_id
    found = []
    categories = database.query(Server_categories).filter(Server_categories.server_id == server.id).all()
    for category in categories:
        if category.is_private and not is_owner:
            continue
        channels = database.query(Server_channels).filter(
            Server_channels.category_id == category.id,
            Server_channels.channel_type == "lists",
        ).all()
        for channel in channels:
            if channel.id == skip_channel_id:
                continue
            if channel.is_private and not is_owner:
                continue
            found.append({"id": channel.id, "name": channel.name or "list"})
    found.sort(key=lambda row: (row["name"] or "").lower())
    return found


@router.get("/get_list/{channel_id}")
def get_list(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, server = load_list_channel(database, channel_id, current_user.id)
    items = database.query(List_item).filter(List_item.channel_id == channel.id).order_by(List_item.position.asc(), List_item.id.asc()).all()
    return {
        "channel_id": channel.id,
        "items": [serialize_item(database, item) for item in items],
        "destinations": list_destinations(database, server, current_user.id, channel.id),
    }


@router.post("/list_item")
async def create_list_item(body: List_item_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, server = load_list_channel(database, body.channel_id, current_user.id)
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required.")
    if len(title) > 200:
        title = title[:200]
    note = (body.note or "").strip()
    if len(note) > 1000:
        note = note[:1000]
    highest = database.query(List_item.position).filter(List_item.channel_id == channel.id).order_by(List_item.position.desc()).first()
    item = List_item(
        channel_id=channel.id,
        title=title,
        sender_id=current_user.id,
        position=100 if not highest or highest[0] is None else int(highest[0]) + 100,
    )
    if note:
        item.note = note
        item.note_sender_id = current_user.id
        item.note_at = datetime.now(timezone.utc)
    database.add(item)
    database.commit()
    database.refresh(item)
    payload = serialize_item(database, item)
    await server_broadcast(server_id=server.id, payload={"type": "list_item_created", "server_id": server.id, "item": payload}, database=database, exclude_user_id=current_user.id)
    return payload


@router.post("/list_item_check")
async def set_list_item_check(body: List_item_check, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    item = database.query(List_item).filter(List_item.id == body.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    _channel, server = load_list_channel(database, item.channel_id, current_user.id)
    if body.on:
        item.completed_by = current_user.id
        item.completed_at = datetime.now(timezone.utc)
    else:
        item.completed_by = None
        item.completed_at = None
    database.commit()
    database.refresh(item)
    payload = serialize_item(database, item)
    await server_broadcast(server_id=server.id, payload={"type": "list_item_updated", "server_id": server.id, "item": payload}, database=database, exclude_user_id=current_user.id)
    return payload


@router.post("/edit_list_item")
async def edit_list_item(body: List_item_edit, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    item = database.query(List_item).filter(List_item.id == body.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    _channel, server = load_list_channel(database, item.channel_id, current_user.id)
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required.")
    if len(title) > 200:
        title = title[:200]
    item.title = title
    database.commit()
    database.refresh(item)
    payload = serialize_item(database, item)
    await server_broadcast(server_id=server.id, payload={"type": "list_item_updated", "server_id": server.id, "item": payload}, database=database, exclude_user_id=current_user.id)
    return payload


@router.post("/list_item_note")
async def save_list_item_note(body: List_item_note, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    item = database.query(List_item).filter(List_item.id == body.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    _channel, server = load_list_channel(database, item.channel_id, current_user.id)
    note = (body.note or "").strip()
    if len(note) > 1000:
        note = note[:1000]
    if note:
        item.note = note
        item.note_sender_id = current_user.id
        item.note_at = datetime.now(timezone.utc)
    else:
        item.note = None
        item.note_sender_id = None
        item.note_at = None
    database.commit()
    database.refresh(item)
    payload = serialize_item(database, item)
    await server_broadcast(server_id=server.id, payload={"type": "list_item_updated", "server_id": server.id, "item": payload}, database=database, exclude_user_id=current_user.id)
    return payload


@router.post("/move_list_item")
async def move_list_item(body: List_item_move, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    item = database.query(List_item).filter(List_item.id == body.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    _source, server = load_list_channel(database, item.channel_id, current_user.id)
    dest, dest_server = load_list_channel(database, body.channel_id, current_user.id)
    if dest_server.id != server.id:
        raise HTTPException(status_code=400, detail="That list is on another server.")
    if dest.id == item.channel_id:
        return serialize_item(database, item)
    from_channel_id = item.channel_id
    highest = database.query(List_item.position).filter(List_item.channel_id == dest.id).order_by(List_item.position.desc()).first()
    item.channel_id = dest.id
    item.position = 100 if not highest or highest[0] is None else int(highest[0]) + 100
    database.commit()
    database.refresh(item)
    payload = serialize_item(database, item)
    await server_broadcast(server_id=server.id, payload={
        "type": "list_item_moved",
        "server_id": server.id,
        "from_channel_id": from_channel_id,
        "item": payload,
    }, database=database, exclude_user_id=current_user.id)
    return payload


@router.post("/delete_list_item")
async def delete_list_item(body: List_item_delete, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    item = database.query(List_item).filter(List_item.id == body.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    channel, server = load_list_channel(database, item.channel_id, current_user.id)
    item_id = item.id
    channel_id = channel.id
    database.query(List_thread_message).filter(List_thread_message.item_id == item.id).delete(synchronize_session=False)
    database.delete(item)
    database.commit()
    await server_broadcast(server_id=server.id, payload={"type": "list_item_deleted", "server_id": server.id, "channel_id": channel_id, "item_id": item_id}, database=database, exclude_user_id=current_user.id)
    return {"ok": True}


@router.get("/list_thread/{item_id}")
def get_list_thread(item_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    item = database.query(List_item).filter(List_item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    load_list_channel(database, item.channel_id, current_user.id)
    rows = database.query(List_thread_message).filter(List_thread_message.item_id == item.id).order_by(List_thread_message.created_at.asc(), List_thread_message.id.asc()).all()
    return {"item_id": item.id, "messages": [{
        "id": row.id,
        "sender_id": row.sender_id,
        "username": username_for(database, row.sender_id),
        "content": row.content,
        "created_at": str(row.created_at),
    } for row in rows]}


@router.post("/list_thread")
async def create_list_thread_message(body: List_thread_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    item = database.query(List_item).filter(List_item.id == body.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    _channel, server = load_list_channel(database, item.channel_id, current_user.id)
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message is empty.")
    if len(content) > 2000:
        content = content[:2000]
    row = List_thread_message(item_id=item.id, sender_id=current_user.id, content=content)
    database.add(row)
    database.commit()
    database.refresh(row)
    message = {
        "id": row.id,
        "sender_id": row.sender_id,
        "username": current_user.username,
        "content": row.content,
        "created_at": str(row.created_at),
    }
    count = database.query(List_thread_message).filter(List_thread_message.item_id == item.id).count()
    await server_broadcast(server_id=server.id, payload={
        "type": "list_thread_message",
        "server_id": server.id,
        "channel_id": item.channel_id,
        "item_id": item.id,
        "thread_count": count,
        "message": message,
    }, database=database, exclude_user_id=current_user.id)
    return {"message": message, "thread_count": count}
