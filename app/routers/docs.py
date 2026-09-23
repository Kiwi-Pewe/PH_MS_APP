from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Doc_page
from app.schemas import Doc_save
from app.database import get_db
from app.auth import get_current_user
from app.routers.realtime import server_broadcast
from app.routers.roles import effective_perms_for_user, require_server_perm
from app.routers.moderation import require_not_timed_out
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

def doc_author_id(page):
    if not page:
        return None
    return getattr(page, "author_id", None)

def can_edit_doc(database, server, user_id, author_id):
    perms = effective_perms_for_user(database, server, user_id)
    if perms.get("manage_docs"):
        return True
    return bool(perms.get("create_docs") and (author_id is None or author_id == user_id))

def can_remove_doc(database, server, user_id, author_id):
    if author_id is None:
        return False
    perms = effective_perms_for_user(database, server, user_id)
    if user_id == author_id:
        return bool(perms.get("create_docs"))
    return bool(perms.get("remove_docs"))

def load_doc_context(channel_id, database, current_user, require_view=True):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel or channel.channel_type != "doc":
        raise HTTPException(status_code=404, detail="channel not found")
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()
    if not member:
        raise HTTPException(status_code=404, detail="membership not found")
    if require_view:
        require_server_perm(database, server, current_user.id, "view_docs", "You do not have permission to view docs.")
    return channel, server, member

def doc_payload_flags(database, server, user_id, page):
    author_id = doc_author_id(page)
    return {
        "author_id": author_id,
        "can_edit": can_edit_doc(database, server, user_id, author_id),
        "can_remove": can_remove_doc(database, server, user_id, author_id),
    }

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
    channel, server, _member = load_doc_context(channel_id, database, current_user)
    page = get_or_create_doc_page(channel.id, database)
    editor_username = None
    if page.editor_id:
        editor = database.query(UserInfo).filter(UserInfo.id == page.editor_id).first()
        editor_username = editor.username if editor else None
    flags = doc_payload_flags(database, server, current_user.id, page)
    return {
        "channel_id": channel.id,
        "content": page.content or "",
        "updated_at": str(page.updated_at) if page.updated_at else None,
        "updated_by": page.updated_by,
        "editor_id": page.editor_id,
        "editor_username": editor_username,
        **flags
    }

@router.post("/lock_doc/{channel_id}")
async def lock_doc(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, server, member = load_doc_context(channel_id, database, current_user)
    require_not_timed_out(member)
    page = get_or_create_doc_page(channel.id, database)
    if not can_edit_doc(database, server, current_user.id, doc_author_id(page)):
        raise HTTPException(status_code=403, detail="You do not have permission to edit this doc.")
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
    channel, _server, _member = load_doc_context(channel_id, database, current_user, require_view=False)
    page = database.query(Doc_page).filter(Doc_page.channel_id == channel.id).first()
    if not page or page.editor_id != current_user.id:
        return {"channel_id": channel.id}

    page.editor_id = None
    database.commit()

    await server_broadcast(
        server_id=_server.id,
        payload={"type": "doc_unlocked", "channel_id": channel.id},
        database=database,
        exclude_user_id=current_user.id
    )
    return {"channel_id": channel.id}

@router.post("/save_doc")
async def save_doc(doc: Doc_save, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, server, member = load_doc_context(doc.channel_id, database, current_user)
    require_not_timed_out(member)
    page = database.query(Doc_page).filter(Doc_page.channel_id == channel.id).first()
    if not page or page.editor_id != current_user.id:
        raise HTTPException(status_code=409, detail="You are not editing this page")
    if not can_edit_doc(database, server, current_user.id, doc_author_id(page)):
        raise HTTPException(status_code=403, detail="You do not have permission to edit this doc.")

    cleaned = sanitize_doc_html(doc.content)
    if len(visible_doc_text(cleaned)) > 3500:
        raise HTTPException(status_code=400, detail="Document is over the character limit")

    page.content = cleaned
    page.updated_at = datetime.utcnow()
    page.updated_by = current_user.id
    if doc_author_id(page) is None:
        page.author_id = current_user.id
    database.commit()

    await server_broadcast(
        server_id=server.id,
        payload={
            "type": "doc_updated",
            "channel_id": channel.id,
            "content": page.content,
            "updated_at": str(page.updated_at),
            "updated_by": current_user.id,
            "author_id": page.author_id
        },
        database=database,
        exclude_user_id=current_user.id
    )
    return {"channel_id": channel.id, "updated_at": str(page.updated_at), "author_id": page.author_id}

@router.post("/remove_doc/{channel_id}")
async def remove_doc(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, server, member = load_doc_context(channel_id, database, current_user)
    require_not_timed_out(member)
    page = database.query(Doc_page).filter(Doc_page.channel_id == channel.id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Doc not found")
    if not can_remove_doc(database, server, current_user.id, doc_author_id(page)):
        raise HTTPException(status_code=403, detail="You do not have permission to remove this doc.")

    page.content = ""
    page.author_id = None
    page.updated_by = None
    page.updated_at = datetime.utcnow()
    page.editor_id = None
    database.commit()

    await server_broadcast(
        server_id=server.id,
        payload={
            "type": "doc_updated",
            "channel_id": channel.id,
            "content": "",
            "updated_at": str(page.updated_at),
            "updated_by": None,
            "author_id": None,
            "cleared": True
        },
        database=database,
        exclude_user_id=current_user.id
    )
    return {"channel_id": channel.id, "author_id": None, "can_edit": can_edit_doc(database, server, current_user.id, None), "can_remove": False}
