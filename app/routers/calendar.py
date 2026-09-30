from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Calendar_event
from app.schemas import Calendar_event_create, Calendar_event_edit, Calendar_event_delete
from app.database import get_db
from app.auth import get_current_user
from app.routers.realtime import server_broadcast

router = APIRouter()

CALENDAR_COLORS = {14910017, 3900150, 11027223, 2278750, 16344086, 15680580, 440276, 15472921}


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
    return parsed.astimezone(timezone.utc)


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


def serialize_event(event):
    return {
        "id": event.id,
        "channel_id": event.channel_id,
        "name": event.name or "",
        "starts_at": stamp(event.starts_at),
        "color": event.color or 14910017,
        "sender_id": event.sender_id,
    }


@router.get("/get_calendar/{channel_id}")
def get_calendar(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, _server = load_calendar_channel(database, channel_id, current_user.id)
    rows = database.query(Calendar_event).filter(Calendar_event.channel_id == channel.id).order_by(Calendar_event.starts_at.asc(), Calendar_event.id.asc()).all()
    return {"channel_id": channel.id, "events": [serialize_event(row) for row in rows]}


@router.post("/calendar_event")
async def create_calendar_event(body: Calendar_event_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, server = load_calendar_channel(database, body.channel_id, current_user.id)
    event = Calendar_event(
        channel_id=channel.id,
        name=clean_name(body.name),
        starts_at=parse_starts(body.starts_at),
        color=clean_color(body.color),
        sender_id=current_user.id,
    )
    database.add(event)
    database.commit()
    database.refresh(event)
    payload = serialize_event(event)
    await server_broadcast(server_id=server.id, payload={"type": "calendar_event_created", "server_id": server.id, "event": payload}, database=database, exclude_user_id=current_user.id)
    return payload


@router.post("/edit_calendar_event")
async def edit_calendar_event(body: Calendar_event_edit, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    event = database.query(Calendar_event).filter(Calendar_event.id == body.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    _channel, server = load_calendar_channel(database, event.channel_id, current_user.id)
    event.name = clean_name(body.name)
    event.starts_at = parse_starts(body.starts_at)
    event.color = clean_color(body.color)
    database.commit()
    database.refresh(event)
    payload = serialize_event(event)
    await server_broadcast(server_id=server.id, payload={"type": "calendar_event_updated", "server_id": server.id, "event": payload}, database=database, exclude_user_id=current_user.id)
    return payload


@router.post("/delete_calendar_event")
async def delete_calendar_event(body: Calendar_event_delete, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    event = database.query(Calendar_event).filter(Calendar_event.id == body.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    channel_id = event.channel_id
    _channel, server = load_calendar_channel(database, channel_id, current_user.id)
    database.delete(event)
    database.commit()
    await server_broadcast(server_id=server.id, payload={"type": "calendar_event_deleted", "server_id": server.id, "channel_id": channel_id, "event_id": body.event_id}, database=database, exclude_user_id=current_user.id)
    return {"ok": True, "event_id": body.event_id}
