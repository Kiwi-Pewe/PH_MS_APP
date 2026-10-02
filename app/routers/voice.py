import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels
from app.schemas import Voice_join
from app.database import get_db
from app.auth import get_current_user
from app.routers.realtime import server_broadcast
from app.routers.profile import public_identity

router = APIRouter()

voice_rooms = {}


def banner_swatch(user):
    try:
        raw = json.loads(getattr(user, "profile_layout", None) or "{}")
    except (TypeError, ValueError):
        raw = {}
    pages = raw.get("pages") if isinstance(raw, dict) else None
    if not isinstance(pages, list):
        return ""
    for page in pages:
        tiles = page.get("tiles") if isinstance(page, dict) else None
        if not isinstance(tiles, list):
            continue
        for tile in tiles:
            if not isinstance(tile, dict) or tile.get("type") != "banner":
                continue
            props = tile.get("props") if isinstance(tile.get("props"), dict) else {}
            color = props.get("color") or ""
            if isinstance(color, str) and color:
                return color
    return ""


def voice_person(user):
    ident = public_identity(user)
    banner = ident.get("banner") or {}
    return {
        "user_id": user.id,
        "username": user.username or "",
        "avatar": ident.get("avatar") or {},
        "banner_url": banner.get("url") or "",
        "banner_mime": banner.get("mime") or "",
        "banner_color": banner_swatch(user),
        "speaking": False,
    }


def roster_payload(server_id):
    rooms = voice_rooms.get(server_id) or {}
    channels = {}
    for channel_id, people in rooms.items():
        if people:
            channels[str(channel_id)] = list(people)
    return {"server_id": server_id, "channels": channels}


def drop_voice_user(user_id):
    left = []
    for server_id, rooms in list(voice_rooms.items()):
        for channel_id, people in list(rooms.items()):
            kept = [person for person in people if person["user_id"] != user_id]
            if len(kept) != len(people):
                rooms[channel_id] = kept
                left.append(server_id)
    return left


def load_voice_channel(database, channel_id, user_id):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel or channel.channel_type != "voice":
        raise HTTPException(status_code=404, detail="Channel not found")
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first() if category else None
    if not server:
        raise HTTPException(status_code=404, detail="Channel not found")
    member = database.query(Server_members).filter(
        Server_members.server_id == server.id,
        Server_members.user_id == user_id,
    ).first()
    if not member and server.owner_id != user_id:
        raise HTTPException(status_code=404, detail="Channel not found")
    is_owner = server.owner_id == user_id
    if (category.is_private or channel.is_private) and not is_owner:
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel, server


async def push_roster(database, server_id):
    payload = roster_payload(server_id)
    payload["type"] = "voice_roster"
    await server_broadcast(server_id=server_id, payload=payload, database=database)


@router.get("/voice_roster/{server_id}")
def get_voice_roster(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = database.query(Servers).filter(Servers.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    member = database.query(Server_members).filter(
        Server_members.server_id == server.id,
        Server_members.user_id == current_user.id,
    ).first()
    if not member and server.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Server not found")
    return roster_payload(server.id)


@router.post("/voice_join")
async def join_voice(body: Voice_join, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, server = load_voice_channel(database, body.channel_id, current_user.id)
    left = drop_voice_user(current_user.id)
    rooms = voice_rooms.setdefault(server.id, {})
    people = rooms.setdefault(channel.id, [])
    people.append(voice_person(current_user))
    touched = set(left)
    touched.add(server.id)
    for server_id in touched:
        await push_roster(database, server_id)
    return roster_payload(server.id)


@router.post("/voice_leave")
async def leave_voice(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    left = drop_voice_user(current_user.id)
    for server_id in set(left):
        await push_roster(database, server_id)
    return {"ok": True}
