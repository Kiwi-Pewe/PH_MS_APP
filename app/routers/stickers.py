from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
import re

from app.models import UserInfo, Server_stickers
from app.schemas import Server_sticker_create, Server_sticker_rename, Server_sticker_delete
from app.database import get_db
from app.auth import get_current_user
from app.r2 import STICKER_KEY_RE, delete_r2_object, public_url_for
from app.routers.roles import require_server_member, require_server_perm
from app.routers.account import public_display_name
from app.routers.profile import public_avatar
from app.routers.deletion import write_audit_log

router = APIRouter()

SERVER_STICKER_SLOT_CAP = 50
STICKER_NAME_RE = re.compile(r"^[a-zA-Z0-9_]{2,32}$")
STICKER_NAME_FROM_FILE_RE = re.compile(r"[^a-zA-Z0-9_]+")


def require_manage_stickers(database, server, user_id):
    return require_server_perm(
        database, server, user_id, "manage_emoji",
        "You do not have permission to manage stickers.",
    )


def clean_sticker_name(raw):
    name = (raw or "").strip()
    if name.startswith(":") and name.endswith(":") and len(name) > 2:
        name = name[1:-1]
    name = name.strip()
    if not STICKER_NAME_RE.match(name):
        return None
    return name


def name_from_filename(filename):
    base = (filename or "").rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    if "." in base:
        base = base.rsplit(".", 1)[0]
    cleaned = STICKER_NAME_FROM_FILE_RE.sub("_", base).strip("_")
    if len(cleaned) < 2:
        cleaned = "sticker"
    if len(cleaned) > 32:
        cleaned = cleaned[:32].rstrip("_")
    if not STICKER_NAME_RE.match(cleaned):
        cleaned = "sticker"
    return cleaned


def unique_sticker_name(database, server_id, preferred):
    base = preferred if STICKER_NAME_RE.match(preferred or "") else "sticker"
    if len(base) > 32:
        base = base[:32].rstrip("_") or "sticker"
    candidate = base
    n = 2
    while database.query(Server_stickers.id).filter(
        Server_stickers.server_id == server_id,
        Server_stickers.name == candidate,
    ).first():
        suffix = f"_{n}"
        trimmed = base[: max(1, 32 - len(suffix))].rstrip("_") or "sticker"
        candidate = f"{trimmed}{suffix}"
        n += 1
        if n > 9999:
            raise HTTPException(status_code=400, detail="Could not find a free sticker name.")
    return candidate


def serialize_sticker(database, row):
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


@router.get("/my_sticker_packs")
def my_sticker_packs(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
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
        rows = database.query(Server_stickers).filter(
            Server_stickers.server_id == server.id,
        ).order_by(Server_stickers.name.asc(), Server_stickers.id.asc()).all()
        if not rows:
            continue
        packs.append({
            "server_id": server.id,
            "server_name": server.name or "Server",
            "icon_url": server_icon_url(server),
            "stickers": [
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


@router.get("/server_sticker/{sticker_id}")
def get_server_sticker(sticker_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    row = database.query(Server_stickers).filter(Server_stickers.id == sticker_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Sticker not found.")
    return {
        "id": row.id,
        "name": row.name,
        "image_url": public_url_for(row.image_key) if row.image_key else "",
        "server_id": row.server_id,
    }


@router.get("/server_settings_stickers/{server_id}")
def server_settings_stickers(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, server_id, current_user.id)
    require_manage_stickers(database, server, current_user.id)
    rows = database.query(Server_stickers).filter(
        Server_stickers.server_id == server_id,
    ).order_by(Server_stickers.created_at.desc(), Server_stickers.id.desc()).all()
    return {
        "server_id": server_id,
        "slot_cap": SERVER_STICKER_SLOT_CAP,
        "count": len(rows),
        "stickers": [serialize_sticker(database, row) for row in rows],
    }


@router.post("/create_server_sticker")
def create_server_sticker(body: Server_sticker_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    require_manage_stickers(database, server, current_user.id)

    key = (body.image_key or "").strip()
    if not STICKER_KEY_RE.match(key):
        raise HTTPException(status_code=400, detail="Invalid sticker image.")

    count = database.query(func.count(Server_stickers.id)).filter(
        Server_stickers.server_id == body.server_id,
    ).scalar() or 0
    if count >= SERVER_STICKER_SLOT_CAP:
        raise HTTPException(status_code=400, detail=f"This server already has {SERVER_STICKER_SLOT_CAP} stickers.")

    preferred = clean_sticker_name(body.name) or name_from_filename(body.filename)
    name = unique_sticker_name(database, body.server_id, preferred)

    existing_key = database.query(Server_stickers.id).filter(Server_stickers.image_key == key).first()
    if existing_key:
        raise HTTPException(status_code=400, detail="That image is already used as a sticker.")

    row = Server_stickers(
        server_id=body.server_id,
        name=name,
        image_key=key,
        uploader_id=current_user.id,
    )
    database.add(row)
    database.flush()
    write_audit_log(database, server.id, current_user.id, "create_sticker", "sticker", row.id, {"name": row.name})
    database.commit()
    database.refresh(row)
    return {"ok": True, "sticker": serialize_sticker(database, row), "slot_cap": SERVER_STICKER_SLOT_CAP}


@router.post("/rename_server_sticker")
def rename_server_sticker(body: Server_sticker_rename, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    require_manage_stickers(database, server, current_user.id)

    name = clean_sticker_name(body.name)
    if not name:
        raise HTTPException(status_code=400, detail="Names must be 2–32 characters: letters, numbers, and underscores only.")

    row = database.query(Server_stickers).filter(
        Server_stickers.id == body.sticker_id,
        Server_stickers.server_id == body.server_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Sticker not found.")

    clash = database.query(Server_stickers.id).filter(
        Server_stickers.server_id == body.server_id,
        Server_stickers.name == name,
        Server_stickers.id != row.id,
    ).first()
    if clash:
        raise HTTPException(status_code=400, detail="That name is already used on this server.")

    previous = row.name
    row.name = name
    if previous != name:
        write_audit_log(database, server.id, current_user.id, "rename_sticker", "sticker", row.id, {
            "name": name, "from": previous, "to": name,
        })
    database.commit()
    database.refresh(row)
    return {"ok": True, "sticker": serialize_sticker(database, row)}


@router.post("/delete_server_sticker")
def delete_server_sticker(body: Server_sticker_delete, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    require_manage_stickers(database, server, current_user.id)

    row = database.query(Server_stickers).filter(
        Server_stickers.id == body.sticker_id,
        Server_stickers.server_id == body.server_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Sticker not found.")

    key = row.image_key
    write_audit_log(database, server.id, current_user.id, "delete_sticker", "sticker", row.id, {"name": row.name})
    database.delete(row)
    database.commit()
    delete_r2_object(key)
    return {"ok": True, "sticker_id": body.sticker_id}
