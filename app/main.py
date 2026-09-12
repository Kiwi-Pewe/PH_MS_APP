# FastAPI app entry point — routers live in app/routers (one file per subject).
from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, HTTPException, Cookie
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from app.models import Parties, Party_members, Servers, Server_members, Server_categories, Server_channels, Forum_post
from app.schemas import Message_schema, Party_message_schema, Server_message, Forum_message_create
from app.database import get_db, Base, engine
from app.auth import validate_session
from app.routers import account, messages, friends, parties, servers, invites, announcements, forums, docs, embeds
from app.routers.realtime import active_connections, heartbeat
from app.routers.messages import send_message
from app.routers.parties import message_party, leave_party
from app.routers.servers import message_server_channel
from app.routers.forums import send_forum_message
from app.routers.docs import release_doc_locks
from app.routers.invites import check_invites
import asyncio

app = FastAPI()
Base.metadata.create_all(engine)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://oneira.cc"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="frontend", html=True), name="frontend")

app.include_router(account.router)
app.include_router(messages.router)
app.include_router(friends.router)
app.include_router(parties.router)
app.include_router(servers.router)
app.include_router(invites.router)
app.include_router(announcements.router)
app.include_router(forums.router)
app.include_router(docs.router)
app.include_router(embeds.router)

@app.on_event("startup")
async def interval_tasks():
    asyncio.create_task(check_invites())

@app.websocket("/ws")
async def connect_user(socket: WebSocket, session_id: str = Cookie(None), database: Session = Depends(get_db)):

    current_user = validate_session(session_id, database)
    if not current_user:
        await socket.close(code=1008)
        return

    await socket.accept()
    active_connections[current_user.id] = socket
    heartbeat_task = asyncio.create_task(heartbeat(socket))
    try:
        while True:
            data = await socket.receive_json()

            if data["type"] == "message":
                new_message = Message_schema(
                sender_id = current_user.id,
                receiver_id = data["receiver_id"],
                content= data["content"])

                try:
                    new_message = send_message(message=new_message, database=database, current_user=current_user)
                except HTTPException as e:
                    await socket.send_json({"type": "error", "detail": e.detail})
                    continue

                if data["receiver_id"] in active_connections:
                    await active_connections[data["receiver_id"]].send_json({
                    "type": "message",
                    "username": current_user.username,
                    "sender_id": current_user.id,
                    "content": data["content"],
                    "timestamp": str(new_message.timestamp)})
            elif data["type"] == "party_message":
                new_party_message = Party_message_schema(
                    sender_id= current_user.id,
                    party_id= data["party_id"],
                    content= data["content"] 
                )

                try:
                    new_party_message = message_party(party_msg= new_party_message,database=database, current_user=current_user)
                except HTTPException as e:
                    await socket.send_json({"type": "error", "detail": e.detail})
                    continue
                party_info = database.query(Parties).filter(Parties.id == data["party_id"]).first()
                all_members = database.query(Party_members).filter(Party_members.party_id == data["party_id"]).all()

                for member in all_members:
                    if member.user_id != current_user.id and member.user_id in active_connections:
                        await active_connections[member.user_id].send_json({
                            "type": "party_message",
                            "party_name": party_info.party_name,
                            "party_id": data["party_id"],
                            "sender_id": current_user.id,
                            "username": current_user.username,
                            "content": data["content"],
                            "timestamp": str(new_party_message.timestamp)
                        })            
            elif data["type"] == "leave_party":
                    
                try:
                    leave_notice = await leave_party(party_id= data["party_id"], database= database, current_user= current_user)
                except HTTPException as e:
                    await socket.send_json({"type": "error", "detail": e.detail})
                    continue
                remaining_members = database.query(Party_members).filter(Party_members.party_id == data["party_id"]).all()

                if remaining_members:
                    party_info = database.query(Parties).filter(Parties.id == data["party_id"]).first()
                    account_ids = list({member.user_id for member in remaining_members})

                    for id in account_ids:
                        if id in active_connections:
                            await active_connections[id].send_json({
                                "type": "party_message",
                                "party_name": party_info.party_name,
                                "party_id": data["party_id"],
                                "sender_id": None,
                                "username": "",
                                "content": leave_notice["message"].content,
                                "timestamp": str(leave_notice["message"].timestamp)
                            })
            elif data["type"] == "channel_message":
                new_server_msg = Server_message(
                    sender_id= current_user.id,
                    channel_id= data["channel_id"],
                    content = data["content"]
                )

                try:
                    new_server_msg = message_server_channel(server_msg= new_server_msg, database=database, current_user=current_user)
                except HTTPException as e:
                    await socket.send_json({"type": "error", "detail": e.detail})
                    continue

                channel = database.query(Server_channels).filter(Server_channels.id == data["channel_id"]).first()
                category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
                server = database.query(Servers).filter(Servers.id == category.server_id).first()

                all_members = database.query(Server_members).filter(Server_members.server_id == server.id).all()
                for member in all_members:
                    if member.user_id != current_user.id and member.user_id in active_connections:
                        await active_connections[member.user_id].send_json({
                            "type": "channel_message",
                            "channel_id": channel.id,
                            "sender_id": current_user.id,
                            "username": current_user.username,
                            "content": data["content"],
                            "timestamp": str(new_server_msg.timestamp) 
                        })
            elif data["type"] == "forum_message":
                new_forum_msg = Forum_message_create(
                    post_id = data["post_id"],
                    content = data["content"]
                )

                try:
                    new_forum_msg = await send_forum_message(forum_message= new_forum_msg, database=database, current_user=current_user)
                except HTTPException as e:
                    await socket.send_json({"type": "error", "detail": e.detail})
                    continue

                post = database.query(Forum_post).filter(Forum_post.id == data["post_id"]).first()
                channel = database.query(Server_channels).filter(Server_channels.id == post.channel_id).first()
                category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
                server = database.query(Servers).filter(Servers.id == category.server_id).first()

                all_members = database.query(Server_members).filter(Server_members.server_id == server.id).all()
                for member in all_members:
                    if member.user_id != current_user.id and member.user_id in active_connections:
                        await active_connections[member.user_id].send_json({
                            "type": "forum_message",
                            "post_id": post.id,
                            "channel_id": channel.id,
                            "id": new_forum_msg["id"],
                            "sender_id": current_user.id,
                            "username": current_user.username,
                            "content": data["content"],
                            "timestamp": new_forum_msg["timestamp"]
                        })


    except WebSocketDisconnect:
        await release_doc_locks(current_user.id, database)
        del active_connections[current_user.id]
        heartbeat_task.cancel()
