# Per-member personal notification prefs for a server (context-menu Mute /
# Notification Settings). Not the staff Overview default.
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models import UserInfo, Servers, Server_notify_prefs
from app.schemas import Server_notify_prefs_update
from app.database import get_db
from app.auth import get_current_user
from app.routers.roles import require_server_member
from app.routers.servers import server_default_notifications

router = APIRouter()

NOTIFY_LEVELS = ("all", "mentions", "nothing")
NOTIFY_LEVEL_LABELS = {
    "all": "All Messages",
    "mentions": "Only @mentions",
    "nothing": "Nothing",
}


def clean_notify_level(value):
    kind = (value or "").strip().lower()
    if kind in NOTIFY_LEVELS:
        return kind
    return None


def serialize_notify_prefs(row, server):
    default_level = server_default_notifications(server)
    if row:
        level = clean_notify_level(row.notify_level) or default_level
        muted = bool(row.muted)
        suppress = bool(row.suppress_everyone)
    else:
        level = default_level
        muted = False
        suppress = False
    return {
        "server_id": server.id,
        "muted": muted,
        "notify_level": level,
        "notify_level_label": NOTIFY_LEVEL_LABELS.get(level, level),
        "suppress_everyone": suppress,
        "server_default_level": default_level,
    }


def get_or_create_prefs(database, server_id, user_id, server):
    row = database.query(Server_notify_prefs).filter(
        Server_notify_prefs.server_id == server_id,
        Server_notify_prefs.user_id == user_id,
    ).first()
    if row:
        return row
    row = Server_notify_prefs(
        server_id=server_id,
        user_id=user_id,
        muted=False,
        notify_level=server_default_notifications(server),
        suppress_everyone=False,
    )
    database.add(row)
    database.commit()
    database.refresh(row)
    return row


@router.get("/server_notify_prefs/{server_id}")
def server_notify_prefs(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, server_id, current_user.id)
    row = database.query(Server_notify_prefs).filter(
        Server_notify_prefs.server_id == server_id,
        Server_notify_prefs.user_id == current_user.id,
    ).first()
    return serialize_notify_prefs(row, server)


@router.post("/update_server_notify_prefs")
def update_server_notify_prefs(body: Server_notify_prefs_update, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    row = get_or_create_prefs(database, body.server_id, current_user.id, server)

    if body.muted is not None:
        row.muted = bool(body.muted)
    if body.notify_level is not None:
        level = clean_notify_level(body.notify_level)
        if not level:
            raise HTTPException(status_code=400, detail="Pick All Messages, Only @mentions, or Nothing.")
        row.notify_level = level
    if body.suppress_everyone is not None:
        row.suppress_everyone = bool(body.suppress_everyone)

    database.commit()
    database.refresh(row)
    return {"ok": True, **serialize_notify_prefs(row, server)}
