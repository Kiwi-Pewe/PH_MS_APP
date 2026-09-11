from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Doc_page
from app.schemas import Doc_save
from app.database import get_db
from app.auth import get_current_user
from app.routers.realtime import server_broadcast
from datetime import datetime
from html import unescape
import re

router = APIRouter()

def visible_doc_text(html):
    text = re.sub(r"<[^>]+>", "", html or "")
    return unescape(text).replace("\xa0", " ")

def sanitize_doc_html(html):
    if not html:
        return ""
    cleaned = re.sub(r"<(script|style)[^>]*>[\s\S]*?</\1>", "", html, flags=re.I)
    cleaned = re.sub(r"\son\w+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", "", cleaned, flags=re.I)
    cleaned = re.sub(r"javascript:", "", cleaned, flags=re.I)
    return cleaned

def get_or_create_doc_page(channel_id, database):
    page = database.query(Doc_page).filter(Doc_page.channel_id == channel_id).first()
    if not page:
        page = Doc_page(channel_id=channel_id, content="")
        database.add(page)
        database.commit()
        database.refresh(page)
    return page

async def release_doc_locks(user_id, database):
    held = database.query(Doc_page).filter(Doc_page.editor_id == user_id).all()
    for page in held:
        page.editor_id = None
        channel = database.query(Server_channels).filter(Server_channels.id == page.channel_id).first()
        if not channel:
            continue
        category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
        server = database.query(Servers).filter(Servers.id == category.server_id).first()
        database.commit()
        await server_broadcast(
            server_id=server.id,
            payload={"type": "doc_unlocked", "channel_id": page.channel_id},
            database=database
        )

@router.get("/get_doc/{channel_id}")
def get_doc(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel or channel.channel_type != "doc":
        raise HTTPException(status_code=404, detail="channel not found")

    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()
    if not is_member:
        raise HTTPException(status_code=404, detail="membership not found")

    page = get_or_create_doc_page(channel.id, database)
    editor_username = None
    if page.editor_id:
        editor = database.query(UserInfo).filter(UserInfo.id == page.editor_id).first()
        editor_username = editor.username if editor else None

    return {
        "channel_id": channel.id,
        "content": page.content or "",
        "updated_at": str(page.updated_at) if page.updated_at else None,
        "updated_by": page.updated_by,
        "editor_id": page.editor_id,
        "editor_username": editor_username,
        "can_edit": current_user.id == server.owner_id
    }

@router.post("/lock_doc/{channel_id}")
async def lock_doc(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel or channel.channel_type != "doc":
        raise HTTPException(status_code=404, detail="channel not found")

    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()
    if not is_member:
        raise HTTPException(status_code=404, detail="membership not found")
    if current_user.id != server.owner_id:
        raise HTTPException(status_code=403, detail="Not authorized to edit")

    page = get_or_create_doc_page(channel.id, database)
    if page.editor_id and page.editor_id != current_user.id:
        raise HTTPException(status_code=409, detail="Page is being edited")

    page.editor_id = current_user.id
    database.commit()

    await server_broadcast(
        server_id=server.id,
        payload={"type": "doc_locked", "channel_id": channel.id, "editor_id": current_user.id, "editor_username": current_user.username},
        database=database,
        exclude_user_id=current_user.id
    )
    return {"channel_id": channel.id, "editor_id": current_user.id, "editor_username": current_user.username}

@router.post("/unlock_doc/{channel_id}")
async def unlock_doc(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel or channel.channel_type != "doc":
        raise HTTPException(status_code=404, detail="channel not found")

    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()
    if not is_member:
        raise HTTPException(status_code=404, detail="membership not found")

    page = database.query(Doc_page).filter(Doc_page.channel_id == channel.id).first()
    if not page or page.editor_id != current_user.id:
        return {"channel_id": channel.id}

    page.editor_id = None
    database.commit()

    await server_broadcast(
        server_id=server.id,
        payload={"type": "doc_unlocked", "channel_id": channel.id},
        database=database,
        exclude_user_id=current_user.id
    )
    return {"channel_id": channel.id}

@router.post("/save_doc")
async def save_doc(doc: Doc_save, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel = database.query(Server_channels).filter(Server_channels.id == doc.channel_id).first()
    if not channel or channel.channel_type != "doc":
        raise HTTPException(status_code=404, detail="channel not found")

    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()
    if not is_member:
        raise HTTPException(status_code=404, detail="membership not found")
    if current_user.id != server.owner_id:
        raise HTTPException(status_code=403, detail="Not authorized to edit")

    page = database.query(Doc_page).filter(Doc_page.channel_id == channel.id).first()
    if not page or page.editor_id != current_user.id:
        raise HTTPException(status_code=409, detail="You are not editing this page")

    cleaned = sanitize_doc_html(doc.content)
    if len(visible_doc_text(cleaned)) > 3500:
        raise HTTPException(status_code=400, detail="Document is over the character limit")

    page.content = cleaned
    page.updated_at = datetime.utcnow()
    page.updated_by = current_user.id
    database.commit()

    await server_broadcast(
        server_id=server.id,
        payload={
            "type": "doc_updated",
            "channel_id": channel.id,
            "content": page.content,
            "updated_at": str(page.updated_at),
            "updated_by": current_user.id
        },
        database=database,
        exclude_user_id=current_user.id
    )
    return {"channel_id": channel.id, "updated_at": str(page.updated_at)}
