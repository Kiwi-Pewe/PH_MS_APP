# Shared live-connection book. Not a router — forums/docs/announcements
# and the /ws handler all push through this same dict.
from app.models import Server_members, Party_members
import asyncio

active_connections = {}

def presence_status(user_id):
    return "online" if user_id in active_connections else "offline"

def serialize_member(user, is_owner):
    return {
        "id": user.id,
        "username": user.username,
        "status": presence_status(user.id),
        "is_owner": bool(is_owner),
    }

async def server_broadcast(server_id, payload, database, exclude_user_id=None):
    all_members = database.query(Server_members).filter(Server_members.server_id == server_id).all()

    for member in all_members:
        if member.user_id != exclude_user_id and member.user_id in active_connections:
            await active_connections[member.user_id].send_json(payload)

async def party_broadcast(party_id, payload, database, exclude_user_id=None):
    all_members = database.query(Party_members).filter(Party_members.party_id == party_id).all()

    for member in all_members:
        if member.user_id != exclude_user_id and member.user_id in active_connections:
            await active_connections[member.user_id].send_json(payload)

async def notify_presence(database, user_id, status):
    payload = {"type": "presence", "user_id": user_id, "status": status}
    seen = set()

    server_ids = [row.server_id for row in database.query(Server_members).filter(Server_members.user_id == user_id).all()]
    for server_id in server_ids:
        peers = database.query(Server_members).filter(Server_members.server_id == server_id).all()
        for peer in peers:
            if peer.user_id != user_id and peer.user_id not in seen:
                seen.add(peer.user_id)
                if peer.user_id in active_connections:
                    await active_connections[peer.user_id].send_json(payload)

    party_ids = [row.party_id for row in database.query(Party_members).filter(Party_members.user_id == user_id).all()]
    for party_id in party_ids:
        peers = database.query(Party_members).filter(Party_members.party_id == party_id).all()
        for peer in peers:
            if peer.user_id != user_id and peer.user_id not in seen:
                seen.add(peer.user_id)
                if peer.user_id in active_connections:
                    await active_connections[peer.user_id].send_json(payload)

async def heartbeat(socket):
    while True:
        await(asyncio.sleep(45))
        await socket.send_json({"type": "ping"})
