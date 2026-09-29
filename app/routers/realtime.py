# Shared live-connection book. Not a router — forums/docs/announcements
# and the /ws handler all push through this same dict.
from app.models import Server_members, Party_members, Friend_request, UserInfo
from sqlalchemy import or_
from starlette.websockets import WebSocketDisconnect
import asyncio

active_connections = {}

def presence_status(user_id):
    return "online" if user_id in active_connections else "offline"

def serialize_member(user, is_owner, hoist_role=None, name_role=None, highest_role=None, timeout_until=None, timeout_reason=None):
    payload = {
        "id": user.id,
        "username": user.username,
        "status": presence_status(user.id),
        "is_owner": bool(is_owner),
    }
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
    from app.routers.profile import public_avatar
    payload["avatar"] = public_avatar(user)
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
    seen = set()

    def queue_peer(peer_id):
        if peer_id == user_id or peer_id in seen:
            return
        seen.add(peer_id)
        return peer_id

    peers = []
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

    # Friends need presence even with no shared server/party (Steam toast).
    friend_rows = database.query(Friend_request).filter(
        or_(Friend_request.user_1 == user_id, Friend_request.user_2 == user_id),
        Friend_request.pending == False,
    ).all()
    for row in friend_rows:
        other = row.user_2 if row.user_1 == user_id else row.user_1
        pid = queue_peer(other)
        if pid is not None:
            peers.append(pid)

    for peer_id in peers:
        socket = active_connections.get(peer_id)
        if socket:
            await safe_send_json(socket, payload, peer_id)

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
            await socket.send_json({"type": "ping"})
    except (asyncio.CancelledError, WebSocketDisconnect, RuntimeError):
        return
    except Exception:
        return
