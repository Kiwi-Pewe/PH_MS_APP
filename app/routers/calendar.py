from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import (
    UserInfo, Servers, Server_members, Server_categories, Server_channels,
    Server_roles, Server_role_members, Calendar_event, Calendar_event_rsvp,
)
from app.schemas import Calendar_event_create, Calendar_event_edit, Calendar_event_delete, Calendar_event_rsvp_set, Calendar_event_cancel
from app.database import get_db
from app.auth import get_current_user
from app.routers.realtime import server_broadcast
from app.routers.roles import effective_perms_for_user_in_channel, require_channel_perm

router = APIRouter()

CALENDAR_COLORS = {14910017, 3900150, 11027223, 2278750, 16344086, 15680580, 440276, 15472921}
REPEAT_KINDS = {"once", "everyDay", "everyWeek", "everyMonth"}
RSVP_CHOICES = {"going", "maybe", "declined"}


def load_calendar_channel(database, channel_id, user_id):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel or channel.channel_type != "events":
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
    perms = effective_perms_for_user_in_channel(database, server, user_id, channel.id)
    if not perms.get("view_events"):
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel, server


def stamp(value):
    if not value:
        return ""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_starts(value):
    text = (value or "").strip().replace("Z", "+00:00")
    if not text:
        raise HTTPException(status_code=400, detail="Start time is required.")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        raise HTTPException(status_code=400, detail="Start time is required.")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).replace(second=0, microsecond=0)


def clean_color(value):
    try:
        color = int(value)
    except (TypeError, ValueError):
        color = 14910017
    if color not in CALENDAR_COLORS:
        color = 14910017
    return color


def clean_name(value):
    name = (value or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required.")
    if len(name) > 200:
        name = name[:200]
    return name


def clean_repeat(value):
    kind = (value or "once").strip()
    if kind not in REPEAT_KINDS:
        return "once"
    return kind


def clean_limit(value):
    if value is None or value == "":
        return None
    try:
        limit = int(value)
    except (TypeError, ValueError):
        return None
    if limit < 1:
        return None
    if limit > 100:
        limit = 100
    return limit


def clean_role_ids(database, server_id, values):
    wanted = []
    for value in values or []:
        try:
            wanted.append(int(value))
        except (TypeError, ValueError):
            continue
    if not wanted:
        return ""
    rows = database.query(Server_roles.id).filter(Server_roles.server_id == server_id, Server_roles.id.in_(wanted)).all()
    kept = sorted({row.id for row in rows})
    return ",".join(str(role_id) for role_id in kept)


def role_id_list(event):
    text = (event.role_ids or "").strip()
    if not text:
        return []
    found = []
    for part in text.split(","):
        try:
            found.append(int(part))
        except ValueError:
            continue
    return found


def username_for(database, user_id, cache):
    if user_id in cache:
        return cache[user_id]
    account = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    name = account.username if account and account.username else "Someone"
    cache[user_id] = name
    return name


def event_rsvps(database, event_id):
    return database.query(Calendar_event_rsvp).filter(Calendar_event_rsvp.event_id == event_id).all()


def can_see_event(event, user_id, rows):
    if not event.is_private:
        return True
    if event.sender_id == user_id:
        return True
    return any(row.user_id == user_id for row in rows)


def require_event_edit(database, server, user_id, event):
    if event.sender_id == user_id:
        return
    require_channel_perm(database, server, user_id, event.channel_id, "manage_events", "You do not have permission to edit that event.")


def require_event_delete(database, server, user_id, event):
    if event.sender_id == user_id:
        return
    require_channel_perm(database, server, user_id, event.channel_id, "remove_events", "You do not have permission to delete that event.")


def user_can_rsvp(database, server, event, user_id):
    if server.owner_id == user_id or event.sender_id == user_id:
        return True
    allowed = role_id_list(event)
    if not allowed:
        return True
    rows = database.query(Server_role_members.role_id).join(
        Server_roles, Server_roles.id == Server_role_members.role_id
    ).filter(Server_roles.server_id == server.id, Server_role_members.user_id == user_id).all()
    have = {row.role_id for row in rows}
    return any(role_id in have for role_id in allowed)


def serialize_event(database, event, rows, names):
    return {
        "id": event.id,
        "channel_id": event.channel_id,
        "name": event.name or "",
        "starts_at": stamp(event.starts_at),
        "color": event.color or 14910017,
        "sender_id": event.sender_id,
        "sender_username": username_for(database, event.sender_id, names),
        "description": event.description or "",
        "repeat_kind": event.repeat_kind or "once",
        "is_private": bool(event.is_private),
        "rsvp_enabled": True if event.rsvp_enabled is None else bool(event.rsvp_enabled),
        "rsvp_limit": event.rsvp_limit,
        "role_ids": role_id_list(event),
        "cancelled_at": stamp(event.cancelled_at),
        "rsvps": [
            {
                "user_id": row.user_id,
                "username": username_for(database, row.user_id, names),
                "occurrence_at": stamp(row.occurrence_at),
                "status": row.status or "",
            }
            for row in rows
        ],
    }


def apply_fields(database, server, event, body):
    event.name = clean_name(body.name)
    event.starts_at = parse_starts(body.starts_at)
    event.color = clean_color(body.color)
    description = (body.description or "").strip()
    if len(description) > 8000:
        description = description[:8000]
    event.description = description or None
    event.repeat_kind = clean_repeat(body.repeat_kind)
    event.is_private = bool(body.is_private)
    event.rsvp_enabled = bool(body.rsvp_enabled)
    event.rsvp_limit = clean_limit(body.rsvp_limit)
    event.role_ids = clean_role_ids(database, server.id, body.role_ids) or None


def member_ids(database, server_id):
    return {row.user_id for row in database.query(Server_members.user_id).filter(Server_members.server_id == server_id).all()}


def sync_invites(database, server, event, invite_ids):
    allowed = member_ids(database, server.id)
    wanted = []
    for value in invite_ids or []:
        try:
            user_id = int(value)
        except (TypeError, ValueError):
            continue
        if user_id in allowed and user_id != event.sender_id:
            wanted.append(user_id)
    wanted = list(dict.fromkeys(wanted))
    rows = event_rsvps(database, event.id)
    invited = [row for row in rows if row.status == "invited"]
    keep = set(wanted)
    for row in invited:
        if row.user_id not in keep:
            database.delete(row)
    have = {row.user_id for row in rows}
    for user_id in wanted:
        if user_id in have:
            continue
        database.add(Calendar_event_rsvp(
            event_id=event.id,
            user_id=user_id,
            occurrence_at=event.starts_at,
            status="invited",
        ))


def promote_waitlist(database, event, occurrence, rows):
    limit = event.rsvp_limit
    if not limit:
        return
    going = [row for row in rows if row.status == "going" and stamp(row.occurrence_at) == stamp(occurrence)]
    if len(going) >= limit:
        return
    waiting = [row for row in rows if row.status == "waitlisted" and stamp(row.occurrence_at) == stamp(occurrence)]
    waiting.sort(key=lambda row: row.created_at or datetime.now(timezone.utc))
    slots = limit - len(going)
    for row in waiting[:slots]:
        row.status = "going"


def broadcast_event(database, server, event):
    rows = event_rsvps(database, event.id)
    payload = serialize_event(database, event, rows, {})
    return payload


@router.get("/get_calendar/{channel_id}")
def get_calendar(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, server = load_calendar_channel(database, channel_id, current_user.id)
    rows = database.query(Calendar_event).filter(Calendar_event.channel_id == channel.id).order_by(Calendar_event.starts_at.asc(), Calendar_event.id.asc()).all()
    names = {}
    visible = []
    for event in rows:
        rsvps = event_rsvps(database, event.id)
        if can_see_event(event, current_user.id, rsvps):
            visible.append(serialize_event(database, event, rsvps, names))
    roles = database.query(Server_roles).filter(Server_roles.server_id == server.id).order_by(Server_roles.position.asc(), Server_roles.id.asc()).all()
    people = database.query(Server_members.user_id).filter(Server_members.server_id == server.id).all()
    members = []
    for person in people:
        members.append({"id": person.user_id, "username": username_for(database, person.user_id, names)})
    members.sort(key=lambda row: (row["username"] or "").lower())
    return {
        "channel_id": channel.id,
        "events": visible,
        "roles": [{"id": role.id, "name": role.name or "Role"} for role in roles],
        "members": members,
    }


@router.post("/calendar_event")
async def create_calendar_event(body: Calendar_event_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, server = load_calendar_channel(database, body.channel_id, current_user.id)
    require_channel_perm(database, server, current_user.id, channel.id, "create_events", "You do not have permission to create events.")
    event = Calendar_event(channel_id=channel.id, sender_id=current_user.id)
    apply_fields(database, server, event, body)
    database.add(event)
    database.commit()
    database.refresh(event)
    sync_invites(database, server, event, body.invite_ids)
    database.commit()
    database.refresh(event)
    payload = broadcast_event(database, server, event)
    await server_broadcast(server_id=server.id, payload={"type": "calendar_event_created", "server_id": server.id, "event": payload}, database=database, exclude_user_id=current_user.id)
    return payload


@router.post("/edit_calendar_event")
async def edit_calendar_event(body: Calendar_event_edit, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    event = database.query(Calendar_event).filter(Calendar_event.id == body.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    _channel, server = load_calendar_channel(database, event.channel_id, current_user.id)
    if not can_see_event(event, current_user.id, event_rsvps(database, event.id)):
        raise HTTPException(status_code=404, detail="Event not found")
    require_event_edit(database, server, current_user.id, event)
    apply_fields(database, server, event, body)
    database.commit()
    sync_invites(database, server, event, body.invite_ids)
    database.commit()
    database.refresh(event)
    payload = broadcast_event(database, server, event)
    await server_broadcast(server_id=server.id, payload={"type": "calendar_event_updated", "server_id": server.id, "event": payload}, database=database, exclude_user_id=current_user.id)
    return payload


@router.post("/calendar_event_rsvp")
async def set_calendar_rsvp(body: Calendar_event_rsvp_set, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    event = database.query(Calendar_event).filter(Calendar_event.id == body.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    _channel, server = load_calendar_channel(database, event.channel_id, current_user.id)
    rows = event_rsvps(database, event.id)
    if not can_see_event(event, current_user.id, rows):
        raise HTTPException(status_code=404, detail="Event not found")
    if event.cancelled_at:
        raise HTTPException(status_code=400, detail="That event is cancelled.")
    if event.rsvp_enabled is False:
        raise HTTPException(status_code=400, detail="RSVPs are turned off for that event.")
    status = (body.status or "").strip()
    if status not in RSVP_CHOICES:
        raise HTTPException(status_code=400, detail="Pick Going, Maybe, or Declined.")
    if not user_can_rsvp(database, server, event, current_user.id):
        raise HTTPException(status_code=403, detail="Your role cannot RSVP to that event.")
    occurrence = parse_starts(body.occurrence_at)
    mine = next((row for row in rows if row.user_id == current_user.id and stamp(row.occurrence_at) == stamp(occurrence)), None)
    if status == "going" and event.rsvp_limit:
        going = [row for row in rows if row.status == "going" and stamp(row.occurrence_at) == stamp(occurrence) and row.user_id != current_user.id]
        if len(going) >= event.rsvp_limit:
            status = "waitlisted"
    if mine:
        mine.status = status
    else:
        mine = Calendar_event_rsvp(event_id=event.id, user_id=current_user.id, occurrence_at=occurrence, status=status)
        database.add(mine)
        rows.append(mine)
    if status != "going":
        promote_waitlist(database, event, occurrence, rows)
    database.commit()
    database.refresh(event)
    payload = broadcast_event(database, server, event)
    await server_broadcast(server_id=server.id, payload={"type": "calendar_event_updated", "server_id": server.id, "event": payload}, database=database, exclude_user_id=current_user.id)
    return payload


@router.post("/cancel_calendar_event")
async def cancel_calendar_event(body: Calendar_event_cancel, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    event = database.query(Calendar_event).filter(Calendar_event.id == body.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    _channel, server = load_calendar_channel(database, event.channel_id, current_user.id)
    if not can_see_event(event, current_user.id, event_rsvps(database, event.id)):
        raise HTTPException(status_code=404, detail="Event not found")
    require_event_edit(database, server, current_user.id, event)
    event.cancelled_at = None if event.cancelled_at else datetime.now(timezone.utc)
    database.commit()
    database.refresh(event)
    payload = broadcast_event(database, server, event)
    await server_broadcast(server_id=server.id, payload={"type": "calendar_event_updated", "server_id": server.id, "event": payload}, database=database, exclude_user_id=current_user.id)
    return payload


@router.post("/delete_calendar_event")
async def delete_calendar_event(body: Calendar_event_delete, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    event = database.query(Calendar_event).filter(Calendar_event.id == body.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    channel_id = event.channel_id
    _channel, server = load_calendar_channel(database, channel_id, current_user.id)
    if not can_see_event(event, current_user.id, event_rsvps(database, event.id)):
        raise HTTPException(status_code=404, detail="Event not found")
    require_event_delete(database, server, current_user.id, event)
    database.query(Calendar_event_rsvp).filter(Calendar_event_rsvp.event_id == event.id).delete(synchronize_session=False)
    database.delete(event)
    database.commit()
    await server_broadcast(server_id=server.id, payload={"type": "calendar_event_deleted", "server_id": server.id, "channel_id": channel_id, "event_id": body.event_id}, database=database, exclude_user_id=current_user.id)
    return {"ok": True, "event_id": body.event_id}
