# Shared live-connection book. Not a router — forums/docs/announcements
# and the /ws handler all push through this same dict.
from app.models import Server_members
import asyncio

active_connections = {}

async def server_broadcast(server_id, payload, database, exclude_user_id=None):
    all_members = database.query(Server_members).filter(Server_members.server_id == server_id).all()

    for member in all_members:
        if member.user_id != exclude_user_id and member.user_id in active_connections:
            await active_connections[member.user_id].send_json(payload)

async def heartbeat(socket):
    while True:
        await(asyncio.sleep(45))
        await socket.send_json({"type": "ping"})
