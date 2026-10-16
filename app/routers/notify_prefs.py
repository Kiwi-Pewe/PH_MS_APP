from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models import UserInfo, Server_members, Server_notifications, Server_notify_prefs, Server_channels, Server_categories
from app.schemas import Server_notify_prefs_update, Channel_notify_prefs_update
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


def membership_row(database, server_id, user_id):
    return database.query(Server_members).filter(
        Server_members.server_id == server_id,
        Server_members.user_id == user_id,
    ).first()


def adopt_legacy_prefs(database, member):
    if not member or clean_notify_level(member.notify_level):
        return
    legacy = database.query(Server_notify_prefs).filter(
        Server_notify_prefs.server_id == member.server_id,
        Server_notify_prefs.user_id == member.user_id,
    ).first()
    if not legacy:
        return
    member.muted = bool(legacy.muted)
    member.suppress_pings = bool(legacy.suppress_everyone)
    level = clean_notify_level(legacy.notify_level)
    if level:
        member.notify_level = level
    database.commit()
    database.refresh(member)


def serialize_server_prefs(member, server):
    stored = clean_notify_level(member.notify_level) if member else None
    level = stored or "all"
    return {
        "server_id": server.id,
        "muted": bool(member.muted) if member else False,
        "suppress_pings": bool(member.suppress_pings) if member else False,
        "suppress_roles": bool(getattr(member, "suppress_roles", False)) if member else False,
        "mute_events": bool(getattr(member, "mute_events", False)) if member else False,
        "notify_level": level,
        "notify_level_label": NOTIFY_LEVEL_LABELS.get(level, level),
        "server_default_level": server_default_notifications(server),
    }


def serialize_channel_prefs(row):
    level = clean_notify_level(row.notify_level)
    return {
        "server_id": row.server_id,
        "channel_id": row.channel_id,
        "muted": bool(row.muted),
        "suppress_pings": bool(row.suppress_pings),
        "suppress_roles": bool(getattr(row, "suppress_roles", False)),
        "mute_events": bool(getattr(row, "mute_events", False)),
        "notify_level": level or "",
        "notify_level_label": NOTIFY_LEVEL_LABELS.get(level, "") if level else "",
    }


def channel_on_server(database, channel_id, user):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Channel not found")
    server = require_server_member(database, category.server_id, user.id)
    return channel, server


@router.get("/server_notify_prefs/{server_id}")
def server_notify_prefs(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, server_id, current_user.id)
    member = membership_row(database, server.id, current_user.id)
    adopt_legacy_prefs(database, member)
    return serialize_server_prefs(member, server)


@router.post("/update_server_notify_prefs")
def update_server_notify_prefs(body: Server_notify_prefs_update, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    member = membership_row(database, server.id, current_user.id)
    if not member:
        raise HTTPException(status_code=404, detail="Server membership not found")
    adopt_legacy_prefs(database, member)
    if body.muted is not None:
        member.muted = bool(body.muted)
    if body.notify_level is not None:
        level = clean_notify_level(body.notify_level)
        if not level:
            raise HTTPException(status_code=400, detail="Pick All Messages, Only @mentions, or Nothing.")
        member.notify_level = level
    if body.suppress_pings is not None:
        member.suppress_pings = bool(body.suppress_pings)
    elif body.suppress_everyone is not None:
        member.suppress_pings = bool(body.suppress_everyone)
    if body.suppress_roles is not None:
        member.suppress_roles = bool(body.suppress_roles)
    if body.mute_events is not None:
        member.mute_events = bool(body.mute_events)
    database.commit()
    database.refresh(member)
    return {"ok": True, **serialize_server_prefs(member, server)}


@router.get("/channel_notify_prefs/{server_id}")
def channel_notify_prefs(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, server_id, current_user.id)
    rows = database.query(Server_notifications).filter(
        Server_notifications.server_id == server.id,
        Server_notifications.user_id == current_user.id,
    ).all()
    return {"server_id": server.id, "channels": [serialize_channel_prefs(row) for row in rows]}


@router.post("/update_channel_notify_prefs")
def update_channel_notify_prefs(body: Channel_notify_prefs_update, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, server = channel_on_server(database, body.channel_id, current_user)
    row = database.query(Server_notifications).filter(
        Server_notifications.channel_id == channel.id,
        Server_notifications.user_id == current_user.id,
    ).first()
    if not row:
        row = Server_notifications(
            server_id=server.id,
            channel_id=channel.id,
            user_id=current_user.id,
            muted=False,
            suppress_pings=False,
            suppress_roles=False,
            mute_events=False,
            notify_level=None,
        )
        database.add(row)
    if body.muted is not None:
        row.muted = bool(body.muted)
    if body.notify_level is not None:
        level = clean_notify_level(body.notify_level)
        if not level:
            raise HTTPException(status_code=400, detail="Pick All Messages, Only @mentions, or Nothing.")
        row.notify_level = level
    if body.suppress_pings is not None:
        row.suppress_pings = bool(body.suppress_pings)
    if body.suppress_roles is not None:
        row.suppress_roles = bool(body.suppress_roles)
    if body.mute_events is not None:
        row.mute_events = bool(body.mute_events)
    database.commit()
    database.refresh(row)
    return {"ok": True, **serialize_channel_prefs(row)}
