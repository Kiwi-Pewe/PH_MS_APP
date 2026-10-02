import json
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import (
    UserInfo, Servers, Server_members, Server_categories, Server_channels,
    Server_roles, Server_role_members, Calendar_event, Calendar_event_rsvp,
    Calendar_event_comment, Schedule_block,
)
from app.schemas import (
    Calendar_event_create, Calendar_event_edit, Calendar_event_delete, Calendar_event_rsvp_set,
    Calendar_event_cancel, Calendar_event_comment_create, Calendar_event_member,
)
from app.database import get_db
from app.auth import get_current_user
from app.routers.realtime import server_broadcast
from app.routers.roles import effective_perms_for_user_in_channel, require_channel_perm

router = APIRouter()

CALENDAR_COLORS = {14910017, 3900150, 11027223, 2278750, 16344086, 15680580, 440276, 15472921}
REPEAT_KINDS = {"once", "everyDay", "everyWeek", "everyMonth"}
RSVP_CHOICES = {"going", "maybe", "declined"}
GROUP_STATUSES = {"invited", "going", "maybe", "waitlisted"}


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


def parse_starts(value, missing="Start time is required."):
    text = (value or "").strip().replace("Z", "+00:00")
    if not text:
        raise HTTPException(status_code=400, detail=missing)
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        raise HTTPException(status_code=400, detail=missing)
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


def aware(value):
    if not value:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def event_end(event):
    if event.ends_at:
        return aware(event.ends_at)
    start = aware(event.starts_at)
    if not start:
        return None
    return start + timedelta(hours=1)


def group_open(event):
    end = event_end(event)
    if not end or end <= datetime.now(timezone.utc):
        return False
    if event.cancelled_at:
        return False
    return True


def in_group(rows, user_id):
    return any(row.user_id == user_id and (row.status or "") in GROUP_STATUSES for row in rows)


def serialize_event(database, event, rows, names):
    end = event_end(event)
    return {
        "id": event.id,
        "channel_id": event.channel_id,
        "name": event.name or "",
        "starts_at": stamp(event.starts_at),
        "ends_at": stamp(end),
        "created_at": stamp(event.created_at),
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
                "invited_by_id": row.invited_by_id,
                "invited_by_username": username_for(database, row.invited_by_id, names) if row.invited_by_id else "",
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
    end_text = (getattr(body, "ends_at", "") or "").strip()
    if end_text:
        event.ends_at = parse_starts(end_text, "End time is required.")
    else:
        event.ends_at = event.starts_at + timedelta(hours=1)
    if event.ends_at <= event.starts_at:
        raise HTTPException(status_code=400, detail="The event has to end after it starts.")


def member_ids(database, server_id):
    return {row.user_id for row in database.query(Server_members.user_id).filter(Server_members.server_id == server_id).all()}


def scheduling_channel_ids(database, server_id):
    cats = database.query(Server_categories.id).filter(Server_categories.server_id == server_id).all()
    cat_ids = [row.id for row in cats]
    if not cat_ids:
        return []
    rows = database.query(Server_channels.id).filter(
        Server_channels.category_id.in_(cat_ids),
        Server_channels.channel_type == "scheduling",
    ).all()
    return [row.id for row in rows]


def overlap_user_ids(database, server, start, end):
    channel_ids = scheduling_channel_ids(database, server.id)
    if not channel_ids or not start or not end:
        return []
    start = aware(start)
    end = aware(end)
    blocks = database.query(Schedule_block).filter(Schedule_block.channel_id.in_(channel_ids)).all()
    found = []
    for block in blocks:
        b0 = aware(block.starts_at)
        b1 = aware(block.ends_at)
        if not b0 or not b1:
            continue
        if b0 < end and b1 > start and block.user_id not in found:
            found.append(block.user_id)
    return found


def sync_invites(database, server, event, invite_ids, invited_by_id=None):
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
    added = []
    for user_id in wanted:
        if user_id in have:
            continue
        database.add(Calendar_event_rsvp(
            event_id=event.id,
            user_id=user_id,
            occurrence_at=event.starts_at,
            status="invited",
            invited_by_id=invited_by_id,
        ))
        added.append(user_id)
    return added


def ensure_host(database, event):
    rows = event_rsvps(database, event.id)
    mine = next((row for row in rows if row.user_id == event.sender_id), None)
    if mine:
        if mine.status == "invited":
            mine.status = "going"
        return
    database.add(Calendar_event_rsvp(
        event_id=event.id,
        user_id=event.sender_id,
        occurrence_at=event.starts_at,
        status="going",
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


def drop_closed_group(database, event):
    if event.cancelled_at or group_open(event):
        return
    rows = event_rsvps(database, event.id)
    changed = False
    for row in rows:
        if (row.status or "") in GROUP_STATUSES:
            row.status = "closed"
            changed = True
    if changed:
        database.commit()


def seed_if_unseeded(database, server, event):
    rows = event_rsvps(database, event.id)
    if rows or not group_open(event):
        return rows, []
    invited = overlap_user_ids(database, server, event.starts_at, event.ends_at)
    added = sync_invites(database, server, event, invited, event.sender_id)
    ensure_host(database, event)
    database.commit()
    return event_rsvps(database, event.id), added


async def notify_event_invites(database, server, event, user_ids, actor_id):
    from app.routers.feed import notify_feed_alert
    context = json.dumps({
        "event_id": event.id,
        "channel_id": event.channel_id,
        "name": event.name or "Event",
    })
    for user_id in user_ids or []:
        if not user_id or user_id == actor_id:
            continue
        await notify_feed_alert(
            database,
            receiver_id=user_id,
            alert_type="event_invite",
            sender_id=actor_id,
            alert_family="activity",
            server_id=server.id,
            context=context,
        )


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
        drop_closed_group(database, event)
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
    invited = list(body.invite_ids or [])
    invited.extend(overlap_user_ids(database, server, event.starts_at, event.ends_at))
    added = sync_invites(database, server, event, invited, event.sender_id)
    ensure_host(database, event)
    database.commit()
    database.refresh(event)
    payload = broadcast_event(database, server, event)
    await notify_event_invites(database, server, event, added, current_user.id)
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
    added = sync_invites(database, server, event, body.invite_ids, event.sender_id)
    database.commit()
    database.refresh(event)
    payload = broadcast_event(database, server, event)
    await notify_event_invites(database, server, event, added, current_user.id)
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
    if not group_open(event):
        raise HTTPException(status_code=400, detail="That event has ended.")
    if event.rsvp_enabled is False:
        raise HTTPException(status_code=400, detail="RSVPs are turned off for that event.")
    status = (body.status or "").strip()
    if status not in RSVP_CHOICES:
        raise HTTPException(status_code=400, detail="Pick Going, Maybe, or Declined.")
    target_id = int(body.user_id or 0) or current_user.id
    if target_id != current_user.id:
        require_channel_perm(database, server, current_user.id, event.channel_id, "edit_rsvps", "You do not have permission to edit RSVPs.")
        if target_id not in member_ids(database, server.id):
            raise HTTPException(status_code=404, detail="Member not found")
    elif not user_can_rsvp(database, server, event, current_user.id):
        raise HTTPException(status_code=403, detail="Your role cannot RSVP to that event.")
    occurrence = parse_starts(body.occurrence_at)
    mine = next((row for row in rows if row.user_id == target_id and stamp(row.occurrence_at) == stamp(occurrence)), None)
    if not mine:
        mine = next((row for row in rows if row.user_id == target_id), None)
    if status == "declined":
        if mine:
            mine.status = "declined"
        else:
            database.add(Calendar_event_rsvp(
                event_id=event.id,
                user_id=target_id,
                occurrence_at=occurrence,
                status="declined",
            ))
        database.commit()
        database.refresh(event)
        payload = broadcast_event(database, server, event)
        await server_broadcast(server_id=server.id, payload={"type": "calendar_event_updated", "server_id": server.id, "event": payload}, database=database, exclude_user_id=current_user.id)
        return payload
    if status == "going" and event.rsvp_limit:
        going = [row for row in rows if row.status == "going" and stamp(row.occurrence_at) == stamp(occurrence) and row.user_id != target_id]
        if len(going) >= event.rsvp_limit:
            status = "waitlisted"
    if mine:
        mine.status = status
    else:
        mine = Calendar_event_rsvp(event_id=event.id, user_id=target_id, occurrence_at=occurrence, status=status)
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
    database.query(Calendar_event_comment).filter(Calendar_event_comment.event_id == event.id).delete(synchronize_session=False)
    from app.routers.reactions import clear_reactions
    clear_reactions(database, "calendar_event", event.id)
    database.delete(event)
    database.commit()
    await server_broadcast(server_id=server.id, payload={"type": "calendar_event_deleted", "server_id": server.id, "channel_id": channel_id, "event_id": body.event_id}, database=database, exclude_user_id=current_user.id)
    return {"ok": True, "event_id": body.event_id}


def calendar_channels_for(database, server, user_id):
    cats = database.query(Server_categories).filter(Server_categories.server_id == server.id).all()
    is_owner = server.owner_id == user_id
    found = []
    for cat in cats:
        if cat.is_private and not is_owner:
            continue
        channels = database.query(Server_channels).filter(
            Server_channels.category_id == cat.id,
            Server_channels.channel_type == "events",
        ).all()
        for channel in channels:
            if channel.is_private and not is_owner:
                continue
            perms = effective_perms_for_user_in_channel(database, server, user_id, channel.id)
            if perms.get("view_events"):
                found.append(channel)
    return found


def load_visible_event(database, event_id, user_id):
    event = database.query(Calendar_event).filter(Calendar_event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    _channel, server = load_calendar_channel(database, event.channel_id, user_id)
    rows = event_rsvps(database, event.id)
    if not can_see_event(event, user_id, rows):
        raise HTTPException(status_code=404, detail="Event not found")
    return event, server, rows


def event_comments(database, event_id):
    return database.query(Calendar_event_comment).filter(
        Calendar_event_comment.event_id == event_id
    ).order_by(Calendar_event_comment.created_at.asc(), Calendar_event_comment.id.asc()).all()


def comment_payload(database, comment, names):
    return {
        "id": comment.id,
        "event_id": comment.event_id,
        "user_id": comment.user_id,
        "username": username_for(database, comment.user_id, names),
        "content": comment.content or "",
        "created_at": stamp(comment.created_at),
    }


@router.get("/get_event_rows/{server_id}")
async def get_event_rows(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = database.query(Servers).filter(Servers.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    member = database.query(Server_members).filter(
        Server_members.server_id == server.id,
        Server_members.user_id == current_user.id,
    ).first()
    if not member and server.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Server not found")
    names = {}
    visible = []
    fresh = []
    for channel in calendar_channels_for(database, server, current_user.id):
        events = database.query(Calendar_event).filter(Calendar_event.channel_id == channel.id).all()
        for event in events:
            drop_closed_group(database, event)
            if not group_open(event):
                continue
            rows, added = seed_if_unseeded(database, server, event)
            if added:
                fresh.append((event, added))
            if not in_group(rows, current_user.id):
                continue
            if not can_see_event(event, current_user.id, rows):
                continue
            visible.append(serialize_event(database, event, rows, names))
    for event, added in fresh:
        await notify_event_invites(database, server, event, added, event.sender_id)
    visible.sort(key=lambda row: row["starts_at"] or "")
    return {"events": visible}


@router.get("/get_event_page/{event_id}")
def get_event_page(event_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    event, _server, _rows = load_visible_event(database, event_id, current_user.id)
    drop_closed_group(database, event)
    rows = event_rsvps(database, event.id)
    names = {}
    payload = serialize_event(database, event, rows, names)
    payload["comments"] = [comment_payload(database, comment, names) for comment in event_comments(database, event.id)]
    from app.routers.reactions import reactions_for_one
    payload["reactions"] = reactions_for_one(database, "calendar_event", event.id, current_user.id)
    return payload


@router.post("/calendar_event_comment")
async def create_calendar_event_comment(body: Calendar_event_comment_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    event, server, rows = load_visible_event(database, body.event_id, current_user.id)
    if not group_open(event):
        raise HTTPException(status_code=400, detail="That event has ended.")
    if not in_group(rows, current_user.id):
        raise HTTPException(status_code=403, detail="Join the event before commenting.")
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Write a comment first.")
    if len(content) > 4000:
        content = content[:4000]
    comment = Calendar_event_comment(event_id=event.id, user_id=current_user.id, content=content)
    database.add(comment)
    database.commit()
    database.refresh(comment)
    names = {}
    payload = comment_payload(database, comment, names)
    await server_broadcast(server_id=server.id, payload={"type": "calendar_event_comment", "server_id": server.id, "event_id": event.id, "comment": payload}, database=database, exclude_user_id=current_user.id)
    return payload


@router.post("/calendar_event_invite")
async def invite_event_member(body: Calendar_event_member, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    event, server, rows = load_visible_event(database, body.event_id, current_user.id)
    if not group_open(event):
        raise HTTPException(status_code=400, detail="That event has ended.")
    if event.sender_id != current_user.id and not in_group(rows, current_user.id):
        raise HTTPException(status_code=403, detail="You are not in this event.")
    if body.user_id not in member_ids(database, server.id):
        raise HTTPException(status_code=404, detail="Member not found")
    existing = next((row for row in rows if row.user_id == body.user_id), None)
    if existing and (existing.status or "") in GROUP_STATUSES:
        return broadcast_event(database, server, event)
    if existing:
        existing.status = "invited"
        existing.invited_by_id = current_user.id
        existing.occurrence_at = event.starts_at
    else:
        database.add(Calendar_event_rsvp(
            event_id=event.id,
            user_id=body.user_id,
            occurrence_at=event.starts_at,
            status="invited",
            invited_by_id=current_user.id,
        ))
    database.commit()
    database.refresh(event)
    payload = broadcast_event(database, server, event)
    await notify_event_invites(database, server, event, [body.user_id], current_user.id)
    await server_broadcast(server_id=server.id, payload={"type": "calendar_event_updated", "server_id": server.id, "event": payload}, database=database, exclude_user_id=current_user.id)
    return payload


@router.post("/calendar_event_remove")
async def remove_event_member(body: Calendar_event_member, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    event, server, rows = load_visible_event(database, body.event_id, current_user.id)
    if body.user_id != current_user.id and event.sender_id != current_user.id:
        require_event_edit(database, server, current_user.id, event)
    target = next((row for row in rows if row.user_id == body.user_id), None)
    if target:
        database.delete(target)
        database.commit()
    database.refresh(event)
    payload = broadcast_event(database, server, event)
    await server_broadcast(server_id=server.id, payload={"type": "calendar_event_updated", "server_id": server.id, "event": payload}, database=database, exclude_user_id=current_user.id)
    return payload
