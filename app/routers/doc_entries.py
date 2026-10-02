from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Doc_entry
from app.schemas import Doc_entry_create, Doc_entry_edit, Doc_entry_delete
from app.database import get_db
from app.auth import get_current_user
from app.routers.realtime import server_broadcast
from app.routers.roles import highest_role_for_user, effective_perms_for_user_in_channel, require_channel_perm
from app.routers.mentions import note_channel_unread

router = APIRouter()


def load_docs_channel(database, channel_id, user_id):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel or channel.channel_type != "docs":
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
    if not perms.get("view_docs"):
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
        title = "Untitled document"
    if len(title) > 200:
        title = title[:200]
    return title


def clean_body(value):
    body = value or ""
    if len(body) > 20000:
        body = body[:20000]
    return body


def username_for(database, user_id):
    account = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    if account and account.username:
        return account.username
    return "Someone"


def require_doc_edit(database, server, user_id, entry):
    if entry.sender_id == user_id:
        return
    require_channel_perm(database, server, user_id, entry.channel_id, "manage_docs", "You do not have permission to edit that document.")


def require_doc_delete(database, server, user_id, entry):
    if entry.sender_id == user_id:
        return
    require_channel_perm(database, server, user_id, entry.channel_id, "remove_docs", "You do not have permission to delete that document.")


def role_name_for(database, server_id, user_id, cache):
    if user_id in cache:
        return cache[user_id]
    role = highest_role_for_user(database, server_id, user_id)
    name = (role or {}).get("name") or ""
    cache[user_id] = name
    return name


def serialize_entry(database, entry, server_id, roles):
    return {
        "id": entry.id,
        "channel_id": entry.channel_id,
        "title": entry.title or "Untitled document",
        "body": entry.body or "",
        "sender_id": entry.sender_id,
        "sender_username": username_for(database, entry.sender_id),
        "sender_role": role_name_for(database, server_id, entry.sender_id, roles),
        "created_at": stamp(entry.created_at),
        "updated_at": stamp(entry.updated_at or entry.created_at),
    }


@router.get("/get_doc_entries/{channel_id}")
def get_doc_entries(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, server = load_docs_channel(database, channel_id, current_user.id)
    rows = database.query(Doc_entry).filter(Doc_entry.channel_id == channel.id).all()

    def when(row):
        value = row.updated_at or row.created_at
        if not value:
            return datetime.min.replace(tzinfo=timezone.utc)
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value

    rows.sort(key=when, reverse=True)
    roles = {}
    return {"channel_id": channel.id, "docs": [serialize_entry(database, row, server.id, roles) for row in rows]}


@router.post("/create_doc_entry")
async def create_doc_entry(body: Doc_entry_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, server = load_docs_channel(database, body.channel_id, current_user.id)
    require_channel_perm(database, server, current_user.id, channel.id, "create_docs", "You do not have permission to create documents.")
    now = datetime.now(timezone.utc)
    entry = Doc_entry(
        channel_id=channel.id,
        title=clean_title(body.title),
        body=clean_body(body.body),
        sender_id=current_user.id,
        updated_at=now,
    )
    database.add(entry)
    note_channel_unread(database, server.id, channel.id, current_user.id)
    database.commit()
    database.refresh(entry)
    payload = serialize_entry(database, entry, server.id, {})
    await server_broadcast(server_id=server.id, payload={"type": "doc_entry_created", "server_id": server.id, "doc": payload}, database=database, exclude_user_id=current_user.id)
    return payload


@router.post("/edit_doc_entry")
async def edit_doc_entry(body: Doc_entry_edit, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    entry = database.query(Doc_entry).filter(Doc_entry.id == body.doc_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Document not found")
    _channel, server = load_docs_channel(database, entry.channel_id, current_user.id)
    require_doc_edit(database, server, current_user.id, entry)
    entry.title = clean_title(body.title)
    entry.body = clean_body(body.body)
    entry.updated_at = datetime.now(timezone.utc)
    database.commit()
    database.refresh(entry)
    payload = serialize_entry(database, entry, server.id, {})
    await server_broadcast(server_id=server.id, payload={"type": "doc_entry_updated", "server_id": server.id, "doc": payload}, database=database, exclude_user_id=current_user.id)
    return payload


@router.post("/delete_doc_entry")
async def delete_doc_entry(body: Doc_entry_delete, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    entry = database.query(Doc_entry).filter(Doc_entry.id == body.doc_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Document not found")
    channel_id = entry.channel_id
    _channel, server = load_docs_channel(database, channel_id, current_user.id)
    require_doc_delete(database, server, current_user.id, entry)
    doc_id = entry.id
    database.delete(entry)
    database.commit()
    await server_broadcast(server_id=server.id, payload={"type": "doc_entry_deleted", "server_id": server.id, "channel_id": channel_id, "doc_id": doc_id}, database=database, exclude_user_id=current_user.id)
    return {"doc_id": doc_id, "channel_id": channel_id}
