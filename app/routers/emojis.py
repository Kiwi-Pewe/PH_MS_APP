# Server Settings → Emojis: custom server emoji upload / rename / delete.
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
import re

from app.models import UserInfo, Server_emojis
from app.schemas import Server_emoji_create, Server_emoji_rename, Server_emoji_delete
from app.database import get_db
from app.auth import get_current_user
from app.r2 import EMOJI_KEY_RE, delete_r2_object, public_url_for
from app.routers.roles import require_server_member, require_server_perm
from app.routers.account import public_display_name
from app.routers.profile import public_avatar

router = APIRouter()

SERVER_EMOJI_SLOT_CAP = 100
EMOJI_NAME_RE = re.compile(r"^[a-zA-Z0-9_]{2,32}$")
EMOJI_NAME_FROM_FILE_RE = re.compile(r"[^a-zA-Z0-9_]+")


def require_manage_emoji(database, server, user_id):
    return require_server_perm(
        database, server, user_id, "manage_emoji",
        "You do not have permission to manage emoji.",
    )


def clean_emoji_name(raw):
    name = (raw or "").strip()
    if name.startswith(":") and name.endswith(":") and len(name) > 2:
        name = name[1:-1]
    name = name.strip()
    if not EMOJI_NAME_RE.match(name):
        return None
    return name


def name_from_filename(filename):
    base = (filename or "").rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    if "." in base:
        base = base.rsplit(".", 1)[0]
    cleaned = EMOJI_NAME_FROM_FILE_RE.sub("_", base).strip("_")
    if len(cleaned) < 2:
        cleaned = "emoji"
    if len(cleaned) > 32:
        cleaned = cleaned[:32].rstrip("_")
    if not EMOJI_NAME_RE.match(cleaned):
        cleaned = "emoji"
    return cleaned


def unique_emoji_name(database, server_id, preferred):
    base = preferred if EMOJI_NAME_RE.match(preferred or "") else "emoji"
    if len(base) > 32:
        base = base[:32].rstrip("_") or "emoji"
    candidate = base
    n = 2
    while database.query(Server_emojis.id).filter(
        Server_emojis.server_id == server_id,
        Server_emojis.name == candidate,
    ).first():
        suffix = f"_{n}"
        trimmed = base[: max(1, 32 - len(suffix))].rstrip("_") or "emoji"
        candidate = f"{trimmed}{suffix}"
        n += 1
        if n > 9999:
            raise HTTPException(status_code=400, detail="Could not find a free emoji name.")
    return candidate


def serialize_emoji(database, row):
    uploader = database.query(UserInfo).filter(UserInfo.id == row.uploader_id).first()
    payload = {
        "id": row.id,
        "server_id": row.server_id,
        "name": row.name,
        "image_key": row.image_key,
        "image_url": public_url_for(row.image_key) if row.image_key else "",
        "created_at": row.created_at.isoformat() + "Z" if row.created_at else None,
        "uploader": None,
    }
    if uploader:
        payload["uploader"] = {
            "id": uploader.id,
            "username": uploader.username,
            "display_name": public_display_name(uploader),
            "avatar": public_avatar(uploader),
        }
    return payload


@router.get("/my_emoji_packs")
def my_emoji_packs(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    """Custom emoji packs for every server the user still belongs to."""
    from app.models import Servers, Server_members
    from app.routers.servers import server_icon_url

    memberships = database.query(Server_members).filter(
        Server_members.user_id == current_user.id,
    ).order_by(Server_members.position.asc()).all()
    packs = []
    for membership in memberships:
        server = database.query(Servers).filter(Servers.id == membership.server_id).first()
        if not server:
            continue
        rows = database.query(Server_emojis).filter(
            Server_emojis.server_id == server.id,
        ).order_by(Server_emojis.name.asc(), Server_emojis.id.asc()).all()
        if not rows:
            continue
        packs.append({
            "server_id": server.id,
            "server_name": server.name or "Server",
            "icon_url": server_icon_url(server),
            "emojis": [
                {
                    "id": row.id,
                    "name": row.name,
                    "image_url": public_url_for(row.image_key) if row.image_key else "",
                    "server_id": server.id,
                }
                for row in rows
            ],
        })
    return {"packs": packs}


@router.get("/server_emoji/{emoji_id}")
def get_server_emoji(emoji_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    """Resolve a custom emoji for message render (CDN URL is public)."""
    row = database.query(Server_emojis).filter(Server_emojis.id == emoji_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Emoji not found.")
    return {
        "id": row.id,
        "name": row.name,
        "image_url": public_url_for(row.image_key) if row.image_key else "",
        "server_id": row.server_id,
    }


@router.get("/server_settings_emojis/{server_id}")
def server_settings_emojis(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, server_id, current_user.id)
    require_manage_emoji(database, server, current_user.id)
    rows = database.query(Server_emojis).filter(
        Server_emojis.server_id == server_id,
    ).order_by(Server_emojis.created_at.desc(), Server_emojis.id.desc()).all()
    return {
        "server_id": server_id,
        "slot_cap": SERVER_EMOJI_SLOT_CAP,
        "count": len(rows),
        "emojis": [serialize_emoji(database, row) for row in rows],
    }


@router.post("/create_server_emoji")
def create_server_emoji(body: Server_emoji_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    require_manage_emoji(database, server, current_user.id)

    key = (body.image_key or "").strip()
    if not EMOJI_KEY_RE.match(key):
        raise HTTPException(status_code=400, detail="Invalid emoji image.")

    count = database.query(func.count(Server_emojis.id)).filter(
        Server_emojis.server_id == body.server_id,
    ).scalar() or 0
    if count >= SERVER_EMOJI_SLOT_CAP:
        raise HTTPException(status_code=400, detail=f"This server already has {SERVER_EMOJI_SLOT_CAP} emojis.")

    preferred = clean_emoji_name(body.name) or name_from_filename(body.filename)
    name = unique_emoji_name(database, body.server_id, preferred)

    existing_key = database.query(Server_emojis.id).filter(Server_emojis.image_key == key).first()
    if existing_key:
        raise HTTPException(status_code=400, detail="That image is already used as an emoji.")

    row = Server_emojis(
        server_id=body.server_id,
        name=name,
        image_key=key,
        uploader_id=current_user.id,
    )
    database.add(row)
    database.commit()
    database.refresh(row)
    return {"ok": True, "emoji": serialize_emoji(database, row), "slot_cap": SERVER_EMOJI_SLOT_CAP}


@router.post("/rename_server_emoji")
def rename_server_emoji(body: Server_emoji_rename, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    require_manage_emoji(database, server, current_user.id)

    name = clean_emoji_name(body.name)
    if not name:
        raise HTTPException(status_code=400, detail="Names must be 2–32 characters: letters, numbers, and underscores only.")

    row = database.query(Server_emojis).filter(
        Server_emojis.id == body.emoji_id,
        Server_emojis.server_id == body.server_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Emoji not found.")

    clash = database.query(Server_emojis.id).filter(
        Server_emojis.server_id == body.server_id,
        Server_emojis.name == name,
        Server_emojis.id != row.id,
    ).first()
    if clash:
        raise HTTPException(status_code=400, detail="That name is already used on this server.")

    row.name = name
    database.commit()
    database.refresh(row)
    return {"ok": True, "emoji": serialize_emoji(database, row)}


@router.post("/delete_server_emoji")
def delete_server_emoji(body: Server_emoji_delete, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    require_manage_emoji(database, server, current_user.id)

    row = database.query(Server_emojis).filter(
        Server_emojis.id == body.emoji_id,
        Server_emojis.server_id == body.server_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Emoji not found.")

    key = row.image_key
    database.delete(row)
    database.commit()
    delete_r2_object(key)
    return {"ok": True, "emoji_id": body.emoji_id}
