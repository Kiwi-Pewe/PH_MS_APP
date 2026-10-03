import asyncio
import json
import os
import urllib.request
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels
from app.schemas import Voice_join
from app.database import get_db
from app.auth import get_current_user
from app.routers.realtime import notify_user, server_broadcast
from app.routers.profile import public_identity

router = APIRouter()

voice_rooms = {}
voice_watchers = {}
VOICE_ROOM_CAP = 10


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
        "sharing": False,
    }


def roster_payload(server_id):
    rooms = voice_rooms.get(server_id) or {}
    channels = {}
    for channel_id, people in rooms.items():
        if people:
            channels[str(channel_id)] = list(people)
    return {"server_id": server_id, "channels": channels}


def voice_seat(user_id):
    for server_id, rooms in voice_rooms.items():
        for channel_id, people in rooms.items():
            if any(person["user_id"] == user_id for person in people):
                return server_id, channel_id, people
    return None, None, []


def forget_stream_viewer(user_id):
    notices = []
    voice_watchers.pop(user_id, None)
    for host_id, viewers in list(voice_watchers.items()):
        if user_id not in viewers:
            continue
        voice_watchers[host_id] = [viewer for viewer in viewers if viewer != user_id]
        notices.append((host_id, list(voice_watchers[host_id])))
    return notices


async def notify_watchers(notices):
    for host_id, viewers in notices:
        await notify_user(host_id, {"type": "voice_watchers", "viewers": viewers})


def drop_voice_user(user_id):
    notices = forget_stream_viewer(user_id)
    left = []
    for server_id, rooms in list(voice_rooms.items()):
        for channel_id, people in list(rooms.items()):
            kept = [person for person in people if person["user_id"] != user_id]
            if len(kept) != len(people):
                rooms[channel_id] = kept
                left.append(server_id)
    return left, notices


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


def turn_ice_servers():
    key_id = os.environ.get("CLOUDFLARE_TURN_KEY_ID") or ""
    token = os.environ.get("CLOUDFLARE_TURN_KEY_TOKEN") or ""
    if not key_id or not token:
        return []
    request = urllib.request.Request(
        "https://rtc.live.cloudflare.com/v1/turn/keys/" + key_id + "/credentials/generate-ice-servers",
        data=json.dumps({"ttl": 86400}).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json", "User-Agent": "OneiraVoice/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            data = json.loads(response.read().decode())
    except Exception:
        return []
    raw = data.get("iceServers") if isinstance(data, dict) else None
    if isinstance(raw, dict):
        raw = [raw]
    if not isinstance(raw, list):
        return []
    servers = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        urls = item.get("urls") or []
        if isinstance(urls, str):
            urls = [urls]
        kept = [url for url in urls if isinstance(url, str) and not url.endswith(":53") and ":53?" not in url]
        if not kept:
            continue
        row = {"urls": kept}
        if item.get("username"):
            row["username"] = item["username"]
        if item.get("credential"):
            row["credential"] = item["credential"]
        servers.append(row)
    return servers


async def relay_voice_signal(sender_id, target_id, payload):
    try:
        target_id = int(target_id)
    except (TypeError, ValueError):
        return
    server_id, channel_id, _people = voice_seat(sender_id)
    other_server, other_channel, _others = voice_seat(target_id)
    if channel_id is None or channel_id != other_channel or server_id != other_server:
        return
    if not isinstance(payload, dict):
        return
    await notify_user(target_id, {
        "type": "voice_signal",
        "from_user_id": sender_id,
        "channel_id": channel_id,
        "payload": payload,
    })


async def set_voice_share(user_id, sharing):
    server_id, channel_id, people = voice_seat(user_id)
    if channel_id is None:
        return None
    sharing = bool(sharing)
    if sharing and any(person.get("sharing") and person["user_id"] != user_id for person in people):
        await notify_user(user_id, {"type": "voice_stream", "ok": False, "detail": "Someone is already sharing."})
        return None
    for person in people:
        if person["user_id"] == user_id:
            person["sharing"] = sharing
            if sharing:
                voice_watchers[user_id] = []
            else:
                voice_watchers.pop(user_id, None)
    return server_id


async def set_voice_watch(user_id, watching):
    server_id, channel_id, people = voice_seat(user_id)
    if channel_id is None:
        return
    host = next((person for person in people if person.get("sharing")), None)
    if not host or host["user_id"] == user_id:
        return
    host_id = host["user_id"]
    viewers = list(voice_watchers.get(host_id) or [])
    if watching:
        if user_id not in viewers:
            viewers.append(user_id)
    else:
        viewers = [viewer for viewer in viewers if viewer != user_id]
    voice_watchers[host_id] = viewers
    await notify_user(host_id, {"type": "voice_watchers", "viewers": viewers})


async def relay_voice_speaking(user_id, speaking):
    server_id, channel_id, people = voice_seat(user_id)
    if channel_id is None:
        return
    speaking = bool(speaking)
    for person in people:
        if person["user_id"] == user_id:
            person["speaking"] = speaking
    notice = {
        "type": "voice_speaking",
        "user_id": user_id,
        "channel_id": channel_id,
        "server_id": server_id,
        "speaking": speaking,
    }
    for person in people:
        if person["user_id"] != user_id:
            await notify_user(person["user_id"], notice)


@router.get("/voice_ice")
async def voice_ice(current_user: UserInfo = Depends(get_current_user)):
    servers = [{"urls": "stun:stun.cloudflare.com:3478"}]
    servers.extend(await asyncio.to_thread(turn_ice_servers))
    return {"iceServers": servers}


@router.post("/voice_join")
async def join_voice(body: Voice_join, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, server = load_voice_channel(database, body.channel_id, current_user.id)
    existing = (voice_rooms.get(server.id) or {}).get(channel.id) or []
    others = [person for person in existing if person["user_id"] != current_user.id]
    if len(others) >= VOICE_ROOM_CAP:
        raise HTTPException(status_code=400, detail="That voice channel is full.")
    left, notices = drop_voice_user(current_user.id)
    await notify_watchers(notices)
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
    left, notices = drop_voice_user(current_user.id)
    await notify_watchers(notices)
    for server_id in set(left):
        await push_roster(database, server_id)
    return {"ok": True}
