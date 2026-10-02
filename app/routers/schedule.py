from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Schedule_block
from app.schemas import Schedule_block_create, Schedule_block_delete, Schedule_block_update
from app.database import get_db
from app.auth import get_current_user
from app.routers.realtime import server_broadcast
from app.routers.roles import name_color_roles_by_user, highest_roles_by_user
from app.routers.profile import avatar_lookup

router = APIRouter()


def load_schedule_channel(database, channel_id, user_id):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel or channel.channel_type != "scheduling":
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
    return channel, server


def stamp(value):
    if not value:
        return ""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_when(value, label):
    text = (value or "").strip().replace("Z", "+00:00")
    if not text:
        raise HTTPException(status_code=400, detail=label + " is required.")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        raise HTTPException(status_code=400, detail=label + " is required.")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).replace(second=0, microsecond=0)


def serialize_block(block, account, avatars, colors, ranks):
    return {
        "id": block.id,
        "channel_id": block.channel_id,
        "user_id": block.user_id,
        "username": (account.username if account else "") or "Someone",
        "avatar": avatars.get(block.user_id),
        "starts_at": stamp(block.starts_at),
        "ends_at": stamp(block.ends_at),
        "name_role": colors.get(block.user_id),
        "highest_role": ranks.get(block.user_id),
        "x_ratio": 0.5 if block.x_ratio is None else float(block.x_ratio),
    }


def decorate(database, server, blocks):
    if not blocks:
        return []
    user_ids = list({row.user_id for row in blocks})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(user_ids)).all() if user_ids else []
    by_id = {account.id: account for account in accounts}
    avatars = avatar_lookup(accounts)
    colors = name_color_roles_by_user(database, server.id, user_ids)
    ranks = highest_roles_by_user(database, server.id, user_ids)
    return [serialize_block(row, by_id.get(row.user_id), avatars, colors, ranks) for row in blocks]


@router.get("/get_schedule_blocks/{channel_id}")
def get_schedule_blocks(channel_id: int, start: str = "", end: str = "", database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, server = load_schedule_channel(database, channel_id, current_user.id)
    window_start = parse_when(start, "Start")
    window_end = parse_when(end, "End")
    if window_end <= window_start:
        raise HTTPException(status_code=400, detail="End is required.")
    if window_end - window_start > timedelta(days=14):
        raise HTTPException(status_code=400, detail="That range is too long.")
    rows = (
        database.query(Schedule_block)
        .filter(
            Schedule_block.channel_id == channel.id,
            Schedule_block.starts_at < window_end,
            Schedule_block.ends_at > window_start,
        )
        .order_by(Schedule_block.starts_at.asc(), Schedule_block.id.asc())
        .all()
    )
    return {"blocks": decorate(database, server, rows)}


@router.post("/create_schedule_block")
async def create_schedule_block(body: Schedule_block_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, server = load_schedule_channel(database, body.channel_id, current_user.id)
    starts = parse_when(body.starts_at, "Start")
    ends = parse_when(body.ends_at, "End")
    if ends <= starts:
        raise HTTPException(status_code=400, detail="End is required.")
    if ends - starts > timedelta(hours=24):
        raise HTTPException(status_code=400, detail="Availability can cover one day.")
    try:
        ratio = float(body.x_ratio)
    except (TypeError, ValueError):
        ratio = 0.5
    ratio = min(0.96, max(0.04, ratio))
    block = Schedule_block(channel_id=channel.id, user_id=current_user.id, starts_at=starts, ends_at=ends, x_ratio=ratio)
    database.add(block)
    database.commit()
    database.refresh(block)
    payload = decorate(database, server, [block])[0]
    await server_broadcast(server_id=server.id, payload={"type": "schedule_block_created", "block": payload}, database=database, exclude_user_id=current_user.id)
    return {"block": payload}


@router.post("/update_schedule_block")
async def update_schedule_block(body: Schedule_block_update, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    block = database.query(Schedule_block).filter(Schedule_block.id == body.block_id).first()
    if not block or block.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Availability not found")
    _channel, server = load_schedule_channel(database, block.channel_id, current_user.id)
    ends = parse_when(body.ends_at, "End")
    starts = block.starts_at
    if starts.tzinfo is None:
        starts = starts.replace(tzinfo=timezone.utc)
    if ends <= starts:
        raise HTTPException(status_code=400, detail="End is required.")
    if ends - starts > timedelta(hours=24):
        raise HTTPException(status_code=400, detail="Availability can cover one day.")
    block.ends_at = ends
    database.commit()
    database.refresh(block)
    payload = decorate(database, server, [block])[0]
    await server_broadcast(server_id=server.id, payload={"type": "schedule_block_updated", "block": payload}, database=database, exclude_user_id=current_user.id)
    return {"block": payload}


@router.post("/delete_schedule_block")
async def delete_schedule_block(body: Schedule_block_delete, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    block = database.query(Schedule_block).filter(Schedule_block.id == body.block_id).first()
    if not block or block.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Availability not found")
    channel, server = load_schedule_channel(database, block.channel_id, current_user.id)
    block_id = block.id
    channel_id = channel.id
    database.delete(block)
    database.commit()
    await server_broadcast(
        server_id=server.id,
        payload={"type": "schedule_block_deleted", "channel_id": channel_id, "block_id": block_id},
        database=database,
        exclude_user_id=current_user.id,
    )
    return {"ok": True}
