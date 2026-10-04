import asyncio
import json
import os
import urllib.request
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Parties, Party_members, Party_messages, Message, Conversations, Block_user
from app.schemas import Voice_join, Voice_call
from app.database import get_db, SessionLocal
from app.auth import get_current_user
from app.privacy import can_send_dm
from app.routers.realtime import notify_user, server_broadcast
from app.routers.profile import public_identity

router = APIRouter()

voice_rooms = {}
voice_watchers = {}
voice_calls = {}
VOICE_ROOM_CAP = 10
CALL_CHANNEL = "call"


def normalize_voice_limit(value):
    try:
        count = int(value)
    except (TypeError, ValueError):
        return VOICE_ROOM_CAP
    if count < 1 or count > VOICE_ROOM_CAP:
        return VOICE_ROOM_CAP
    return count


def channel_voice_cap(channel):
    return normalize_voice_limit(getattr(channel, "user_limit", None))


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
    told = set()
    server = database.query(Servers).filter(Servers.id == server_id).first()
    if server and server.owner_id:
        await notify_user(server.owner_id, payload)
        told.add(server.owner_id)
    for people in (voice_rooms.get(server_id) or {}).values():
        for person in people:
            user_id = person["user_id"]
            if user_id in told:
                continue
            told.add(user_id)
            await notify_user(user_id, payload)


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
    if speaking and not is_call_server(server_id):
        database = SessionLocal()
        try:
            from app.routers.roles import effective_perms_for_user_in_channel
            server = database.query(Servers).filter(Servers.id == server_id).first()
            if not server or not effective_perms_for_user_in_channel(database, server, user_id, channel_id).get("talk_voice"):
                speaking = False
        finally:
            database.close()
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
    from app.routers.roles import effective_perms_for_user_in_channel, require_channel_perm
    channel, server = load_voice_channel(database, body.channel_id, current_user.id)
    require_channel_perm(database, server, current_user.id, channel.id, "hear_voice", "You do not have permission to join this voice channel.")
    can_talk = bool(effective_perms_for_user_in_channel(database, server, current_user.id, channel.id).get("talk_voice"))
    existing = (voice_rooms.get(server.id) or {}).get(channel.id) or []
    others = [person for person in existing if person["user_id"] != current_user.id]
    if len(others) >= channel_voice_cap(channel):
        raise HTTPException(status_code=400, detail="That voice channel is full.")
    left, notices = drop_voice_user(current_user.id)
    await notify_watchers(notices)
    rooms = voice_rooms.setdefault(server.id, {})
    people = rooms.setdefault(channel.id, [])
    people.append(voice_person(current_user))
    touched = set(left)
    touched.add(server.id)
    for server_id in touched:
        await fanout_voice(database, server_id)
    payload = roster_payload(server.id)
    payload["can_talk"] = can_talk
    return payload


@router.post("/voice_leave")
async def leave_voice(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    await release_voice_seat(database, current_user.id)
    return {"ok": True}


def is_call_server(server_id):
    return isinstance(server_id, str) and (server_id.startswith("dm:") or server_id.startswith("party:"))


def call_room(key):
    return (voice_rooms.get(key) or {}).get(CALL_CHANNEL) or []


def chat_id_for(call, viewer_id):
    if call["kind"] == "party":
        return call["party_id"]
    first, second = call["pair"]
    return second if viewer_id == first else first


def label_for(call, viewer_id):
    if call["kind"] == "party":
        return call["name"]
    return call["names"].get(chat_id_for(call, viewer_id)) or "Call"


def ringing_people(database, user_ids):
    ids = list(user_ids or [])
    if not ids:
        return []
    users = database.query(UserInfo).filter(UserInfo.id.in_(ids)).all()
    order = {user_id: index for index, user_id in enumerate(ids)}
    people = [voice_person(user) for user in users]
    people.sort(key=lambda person: order.get(person["user_id"], 0))
    return people


def payload_for(database, call, viewer_id):
    return {
        "type": "voice_call",
        "active": True,
        "ended": False,
        "key": call["key"],
        "kind": call["kind"],
        "chat_id": chat_id_for(call, viewer_id),
        "label": label_for(call, viewer_id),
        "starter_id": call["starter_id"],
        "starter_name": call["starter_name"],
        "joined": list(call_room(call["key"])),
        "ringing": ringing_people(database, call["ringing"]),
    }


async def publish_call(database, key):
    call = voice_calls.get(key)
    if not call:
        return
    if not call_room(key):
        await finish_call(database, key)
        return
    for user_id in call["users"]:
        await notify_user(user_id, payload_for(database, call, user_id))


async def finish_call(database, key):
    call = voice_calls.pop(key, None)
    if not call:
        return
    task = call.get("ring_task")
    if task and task is not asyncio.current_task():
        task.cancel()
    voice_rooms.pop(key, None)
    seconds = max(0, int((datetime.utcnow() - call["started"]).total_seconds()))
    content = "oneira-call:" + str(seconds)
    if call["kind"] == "dm":
        message = database.query(Message).filter(Message.id == call["message_id"]).first()
    else:
        message = database.query(Party_messages).filter(Party_messages.id == call["message_id"]).first()
    if message:
        message.content = content
        database.commit()
    for user_id in call["users"]:
        await notify_user(user_id, {
            "type": "voice_call",
            "ended": True,
            "key": key,
            "kind": call["kind"],
            "chat_id": chat_id_for(call, user_id),
        })
        await notify_user(user_id, {
            "type": "call_line_update",
            "kind": call["kind"],
            "chat_id": chat_id_for(call, user_id),
            "id": call["message_id"],
            "content": content,
        })


async def fanout_voice(database, server_id):
    if is_call_server(server_id):
        await publish_call(database, server_id)
    else:
        await push_roster(database, server_id)


async def release_voice_seat(database, user_id):
    left, notices = drop_voice_user(user_id)
    await notify_watchers(notices)
    for server_id in set(left):
        await fanout_voice(database, server_id)


def arm_ring(key):
    call = voice_calls.get(key)
    if not call:
        return
    call["ring_gen"] = call.get("ring_gen", 0) + 1
    gen = call["ring_gen"]

    async def wait():
        await asyncio.sleep(30)
        current = voice_calls.get(key)
        if not current or current.get("ring_gen") != gen or not current["ringing"]:
            return
        current["ringing"] = set()
        database = SessionLocal()
        try:
            await publish_call(database, key)
        finally:
            database.close()

    call["ring_task"] = asyncio.create_task(wait())


def load_call_target(database, kind, chat_id, user_id):
    me = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    if not me:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if kind == "dm":
        other = database.query(UserInfo).filter(UserInfo.id == chat_id).first()
        if not other or other.id == user_id:
            raise HTTPException(status_code=404, detail="Conversation not found")
        blocked = database.query(Block_user).filter(
            ((Block_user.initiated_by == user_id) & (Block_user.blocked_user == other.id))
            | ((Block_user.initiated_by == other.id) & (Block_user.blocked_user == user_id))
        ).first()
        if blocked or not can_send_dm(database, user_id, other):
            raise HTTPException(status_code=403, detail="This user does not accept Direct Messages from you.")
        pair = tuple(sorted((user_id, other.id)))
        return {
            "key": "dm:" + str(pair[0]) + ":" + str(pair[1]),
            "kind": "dm",
            "pair": pair,
            "party_id": None,
            "name": "",
            "names": {me.id: me.username or "", other.id: other.username or ""},
            "users": [me.id, other.id],
        }
    if kind != "party":
        raise HTTPException(status_code=404, detail="Conversation not found")
    party = database.query(Parties).filter(Parties.id == chat_id).first()
    member = database.query(Party_members).filter(Party_members.party_id == chat_id, Party_members.user_id == user_id).first()
    if not party or not member:
        raise HTTPException(status_code=404, detail="Party not found")
    members = database.query(Party_members).filter(Party_members.party_id == chat_id).all()
    accounts = database.query(UserInfo).filter(UserInfo.id.in_([row.user_id for row in members])).all()
    return {
        "key": "party:" + str(party.id),
        "kind": "party",
        "pair": None,
        "party_id": party.id,
        "name": party.party_name or "Party",
        "names": {account.id: account.username or "" for account in accounts},
        "users": [account.id for account in accounts],
    }


def seated_in(key, user_id):
    return any(person["user_id"] == user_id for person in call_room(key))


async def notify_call_line(call, message):
    for user_id in call["users"]:
        await notify_user(user_id, {
            "type": "call_line",
            "kind": call["kind"],
            "chat_id": chat_id_for(call, user_id),
            "label": label_for(call, user_id),
            "id": message.id,
            "sender_id": call["starter_id"],
            "username": call["starter_name"],
            "content": message.content,
            "timestamp": str(message.timestamp),
        })


def store_call_line(database, meta, starter):
    if meta["kind"] == "dm":
        other_id = meta["pair"][1] if starter.id == meta["pair"][0] else meta["pair"][0]
        message = Message(sender_id=starter.id, receiver_id=other_id, content="oneira-call", read=False)
        database.add(message)
        convo = database.query(Conversations).filter(
            ((Conversations.user_1 == starter.id) & (Conversations.user_2 == other_id))
            | ((Conversations.user_1 == other_id) & (Conversations.user_2 == starter.id))
        ).first()
        if convo:
            convo.last_message_at = datetime.utcnow()
            convo.closed_by_user_1 = False
            convo.closed_by_user_2 = False
    else:
        message = Party_messages(party_id=meta["party_id"], sender_id=starter.id, content="oneira-call")
        database.add(message)
    database.commit()
    database.refresh(message)
    return message


async def enter_call(database, meta, user):
    key = meta["key"]
    call = voice_calls.get(key)
    if not call:
        raise HTTPException(status_code=404, detail="That call has ended.")
    if user.id not in call["users"]:
        raise HTTPException(status_code=404, detail="That call has ended.")
    if seated_in(key, user.id):
        return payload_for(database, call, user.id)
    others = [person for person in call_room(key) if person["user_id"] != user.id]
    if len(others) >= VOICE_ROOM_CAP:
        raise HTTPException(status_code=400, detail="That call is full.")
    await release_voice_seat(database, user.id)
    call = voice_calls.get(key)
    if not call:
        raise HTTPException(status_code=404, detail="That call has ended.")
    rooms = voice_rooms.setdefault(key, {})
    people = rooms.setdefault(CALL_CHANNEL, [])
    people.append(voice_person(user))
    call["ringing"].discard(user.id)
    await publish_call(database, key)
    return payload_for(database, call, user.id)


async def begin_call(database, meta, user):
    key = meta["key"]
    existing = voice_calls.get(key)
    if existing:
        return await enter_call(database, meta, user)
    await release_voice_seat(database, user.id)
    message = store_call_line(database, meta, user)
    ringing = {member_id for member_id in meta["users"] if member_id != user.id}
    call = {
        "key": key,
        "kind": meta["kind"],
        "pair": meta["pair"],
        "party_id": meta["party_id"],
        "name": meta["name"],
        "names": meta["names"],
        "users": list(meta["users"]),
        "starter_id": user.id,
        "starter_name": user.username or "",
        "message_id": message.id,
        "ringing": ringing,
        "started": datetime.utcnow(),
        "ring_gen": 0,
        "ring_task": None,
    }
    voice_calls[key] = call
    voice_rooms.setdefault(key, {})[CALL_CHANNEL] = [voice_person(user)]
    arm_ring(key)
    await notify_call_line(call, message)
    await publish_call(database, key)
    return payload_for(database, call, user.id)


@router.get("/voice_call/{kind}/{chat_id}")
def read_call(kind: str, chat_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    meta = load_call_target(database, kind, chat_id, current_user.id)
    call = voice_calls.get(meta["key"])
    if not call:
        return {"active": False, "kind": kind, "chat_id": chat_id}
    return payload_for(database, call, current_user.id)


@router.post("/voice_call")
async def start_call(body: Voice_call, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    meta = load_call_target(database, body.kind, body.chat_id, current_user.id)
    return await begin_call(database, meta, current_user)


@router.post("/voice_call/answer")
async def answer_call(body: Voice_call, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    meta = load_call_target(database, body.kind, body.chat_id, current_user.id)
    return await enter_call(database, meta, current_user)


@router.post("/voice_call/decline")
async def decline_call(body: Voice_call, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    meta = load_call_target(database, body.kind, body.chat_id, current_user.id)
    call = voice_calls.get(meta["key"])
    if not call:
        return {"ok": True}
    call["ringing"].discard(current_user.id)
    await publish_call(database, meta["key"])
    return {"ok": True}
