# Shared live-connection book. Not a router — forums/docs/announcements
# and the /ws handler all push through this same dict.
from app.models import Server_members, Party_members, Friend_request, UserInfo
from sqlalchemy import or_
from starlette.websockets import WebSocketDisconnect
import asyncio
import json

active_connections = {}
viewer_focus = {}
profile_chat_viewers = {}
presence_choice = {}
PRESENCE_MODES = ("online", "away", "dnd", "invisible")


def watch_profile_chat(owner_id, user_id):
    try:
        owner_id = int(owner_id)
        user_id = int(user_id)
    except (TypeError, ValueError):
        return
    if not owner_id or not user_id:
        return
    profile_chat_viewers.setdefault(owner_id, set()).add(user_id)


def unwatch_profile_chat(owner_id, user_id):
    try:
        owner_id = int(owner_id)
        user_id = int(user_id)
    except (TypeError, ValueError):
        return
    found = profile_chat_viewers.get(owner_id)
    if not found:
        return
    found.discard(user_id)
    if not found:
        profile_chat_viewers.pop(owner_id, None)


def drop_profile_chat_viewer(user_id):
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        return
    empty = []
    for owner_id, found in profile_chat_viewers.items():
        found.discard(user_id)
        if not found:
            empty.append(owner_id)
    for owner_id in empty:
        profile_chat_viewers.pop(owner_id, None)


def profile_chat_viewer_ids(owner_id):
    try:
        owner_id = int(owner_id)
    except (TypeError, ValueError):
        return []
    return list(profile_chat_viewers.get(owner_id) or [])


def set_viewer_focus(user_id, channel_id):
    if channel_id:
        viewer_focus[user_id] = int(channel_id)
    else:
        viewer_focus.pop(user_id, None)


def viewer_is_watching_channel(user_id, channel_id):
    if not channel_id:
        return False
    try:
        return viewer_focus.get(user_id) == int(channel_id)
    except (TypeError, ValueError):
        return False

def normalize_presence_mode(raw):
    mode = str(raw or "").strip().lower()
    if mode == "idle":
        mode = "away"
    if mode in PRESENCE_MODES:
        return mode
    return "online"


def presence_from_layout(raw_layout):
    layout = {}
    if isinstance(raw_layout, dict):
        layout = raw_layout
    else:
        try:
            parsed = json.loads(raw_layout or "")
        except Exception:
            parsed = {}
        if isinstance(parsed, dict):
            layout = parsed
    mini = layout.get("mini_profile") if isinstance(layout.get("mini_profile"), dict) else {}
    return normalize_presence_mode(mini.get("presence"))


def remember_presence_choice(user):
    if not user:
        return "online"
    mode = presence_from_layout(getattr(user, "profile_layout", None))
    presence_choice[user.id] = mode
    return mode


def persist_presence_choice(user, database, raw_status):
    mode = normalize_presence_mode(raw_status)
    presence_choice[user.id] = mode
    raw = getattr(user, "profile_layout", None) or ""
    try:
        parsed = json.loads(raw)
    except Exception:
        parsed = None
    if not isinstance(parsed, dict):
        return mode
    mini = parsed.get("mini_profile") if isinstance(parsed.get("mini_profile"), dict) else {}
    mini["presence"] = mode
    parsed["mini_profile"] = mini
    user.profile_layout = json.dumps(parsed)
    database.add(user)
    database.commit()
    return mode


def presence_own(user_id):
    if user_id not in active_connections:
        return "offline"
    return normalize_presence_mode(presence_choice.get(user_id) or "online")


def presence_status(user_id):
    if user_id not in active_connections:
        return "offline"
    mode = presence_own(user_id)
    if mode == "invisible":
        return "offline"
    if mode in ("online", "away", "dnd"):
        return mode
    return "online"


def set_user_presence(database, user, raw_status):
    persist_presence_choice(user, database, raw_status)
    return presence_status(user.id)

def serialize_member(user, is_owner, hoist_role=None, name_role=None, highest_role=None, timeout_until=None, timeout_reason=None, nickname=None, role_ids=None, display_name=None):
    payload = {
        "id": user.id,
        "username": user.username,
        "status": presence_status(user.id),
        "is_owner": bool(is_owner),
    }
    shown = (display_name if display_name is not None else getattr(user, "display_name", None) or "").strip()
    if shown:
        payload["display_name"] = shown
    if role_ids is not None:
        payload["role_ids"] = [int(role_id) for role_id in role_ids]
    if hoist_role:
        payload["hoist_role"] = hoist_role
    if name_role:
        payload["name_role"] = name_role
    if highest_role:
        payload["highest_role"] = highest_role
    if timeout_until:
        payload["timeout_until"] = timeout_until
    if timeout_reason:
        payload["timeout_reason"] = timeout_reason
    from app.routers.profile import public_avatar, clip_text, STATUS_MAX
    payload["avatar"] = public_avatar(user)
    payload["status_line"] = clip_text(getattr(user, "profile_status", None), STATUS_MAX).strip()
    nick = (nickname or "").strip()
    if nick:
        payload["nickname"] = nick
    return payload


async def safe_send_json(socket, payload, user_id=None):
    if socket is None:
        return False
    try:
        await socket.send_json(payload)
        return True
    except (WebSocketDisconnect, RuntimeError):
        pass
    except Exception:
        pass
    if user_id is not None and active_connections.get(user_id) is socket:
        del active_connections[user_id]
    return False

async def server_broadcast(server_id, payload, database, exclude_user_id=None):
    all_members = database.query(Server_members).filter(Server_members.server_id == server_id).all()

    for member in all_members:
        if member.user_id != exclude_user_id and member.user_id in active_connections:
            await safe_send_json(active_connections.get(member.user_id), payload, member.user_id)

async def party_broadcast(party_id, payload, database, exclude_user_id=None):
    all_members = database.query(Party_members).filter(Party_members.party_id == party_id).all()

    for member in all_members:
        if member.user_id != exclude_user_id and member.user_id in active_connections:
            await safe_send_json(active_connections.get(member.user_id), payload, member.user_id)

def presence_peer_ids(database, user_id):
    seen = set()
    peers = []

    def queue_peer(peer_id):
        if peer_id == user_id or peer_id in seen:
            return None
        seen.add(peer_id)
        return peer_id

    server_ids = [row.server_id for row in database.query(Server_members).filter(Server_members.user_id == user_id).all()]
    for server_id in server_ids:
        for peer in database.query(Server_members).filter(Server_members.server_id == server_id).all():
            pid = queue_peer(peer.user_id)
            if pid is not None:
                peers.append(pid)

    party_ids = [row.party_id for row in database.query(Party_members).filter(Party_members.user_id == user_id).all()]
    for party_id in party_ids:
        for peer in database.query(Party_members).filter(Party_members.party_id == party_id).all():
            pid = queue_peer(peer.user_id)
            if pid is not None:
                peers.append(pid)

    friend_rows = database.query(Friend_request).filter(
        or_(Friend_request.user_1 == user_id, Friend_request.user_2 == user_id),
        Friend_request.pending == False,
    ).all()
    for row in friend_rows:
        other = row.user_2 if row.user_1 == user_id else row.user_1
        pid = queue_peer(other)
        if pid is not None:
            peers.append(pid)
    return peers


async def fanout_to_peers(database, user_id, payload):
    for peer_id in presence_peer_ids(database, user_id):
        socket = active_connections.get(peer_id)
        if socket:
            await safe_send_json(socket, payload, peer_id)


async def notify_presence(database, user_id, status):
    user = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    from app.routers.profile import public_avatar
    payload = {
        "type": "presence",
        "user_id": user_id,
        "status": status,
        "username": user.username if user else None,
        "display_name": (user.display_name or user.username) if user else None,
        "avatar": public_avatar(user) if user else None,
    }
    await fanout_to_peers(database, user_id, payload)


async def notify_status_line(database, user_id, status_line):
    user = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    payload = {
        "type": "status_line",
        "user_id": user_id,
        "status_line": status_line or "",
        "username": user.username if user else None,
    }
    await fanout_to_peers(database, user_id, payload)


async def notify_user(user_id, payload):
    socket = active_connections.get(user_id)
    if socket:
        await safe_send_json(socket, payload, user_id)


async def notify_party(party_id, payload, database, exclude_user_id=None):
    await party_broadcast(party_id, payload, database, exclude_user_id=exclude_user_id)


async def heartbeat(socket):
    try:
        while True:
            await asyncio.sleep(45)
            await asyncio.wait_for(socket.send_json({"type": "ping"}), timeout=10)
    except asyncio.CancelledError:
        return
    except Exception:
        try:
            await asyncio.wait_for(socket.close(), timeout=5)
        except Exception:
            return
