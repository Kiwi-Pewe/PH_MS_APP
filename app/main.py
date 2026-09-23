# FastAPI app entry point — routers live in app/routers (one file per subject).
from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, HTTPException, Cookie
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from app.models import Parties, Party_members, Servers, Server_members, Server_categories, Server_channels, Forum_post, Message, Party_messages, Channel_messages, Forum_messages
from app.schemas import Attachment_in, Message_schema, Party_message_schema, Server_message, Forum_message_create
from app.database import get_db, Base, engine, ensure_attachment_columns, ensure_deletion_columns, ensure_edited_columns, ensure_reply_columns, ensure_account_columns, ensure_server_columns, ensure_role_columns, ensure_moderation_columns, ensure_forum_columns, ensure_doc_columns, ensure_feedback_columns
from app.auth import validate_session
from app.r2 import attachment_public
from app.routers import account, messages, friends, parties, servers, invites, announcements, forums, docs, embeds, uploads, deletion, editing, reactions, mentions, messaging_settings, appearance, accessibility, language_time, profile, roles, mini_profiles, moderation, feedback, admin
from pydantic import ValidationError
from app.routers.realtime import active_connections, heartbeat, notify_presence
from app.routers.messages import send_message
from app.routers.parties import message_party, leave_party
from app.routers.servers import message_server_channel
from app.routers.forums import send_forum_message
from app.routers.docs import release_doc_locks
from app.routers.invites import check_invites
from app.routers.admin import sweep_completed_feedback
from app.routers.mentions import mentioned_user_ids, mention_user_map, mention_role_map, live_reply_to
from app.routers.deletion import sweep_pending_deletes
from app.routers.typing import relay_typing
from app.routers.profile import public_avatar
import asyncio

def ws_attachment(data):
    raw = data.get("attachment")
    if not raw:
        return None
    try:
        return Attachment_in.model_validate(raw)
    except ValidationError:
        raise HTTPException(status_code=400, detail="Invalid attachment")


app = FastAPI()
Base.metadata.create_all(engine)
ensure_attachment_columns()
ensure_deletion_columns()
ensure_edited_columns()
ensure_reply_columns()
ensure_account_columns()
ensure_server_columns()
ensure_role_columns()
ensure_moderation_columns()
ensure_forum_columns()
ensure_doc_columns()
ensure_feedback_columns()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://oneira.cc"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="frontend", html=True), name="frontend")

app.include_router(account.router)
app.include_router(messaging_settings.router)
app.include_router(appearance.router)
app.include_router(accessibility.router)
app.include_router(language_time.router)
app.include_router(profile.router)
app.include_router(messages.router)
app.include_router(friends.router)
app.include_router(parties.router)
app.include_router(servers.router)
app.include_router(roles.router)
app.include_router(mini_profiles.router)
app.include_router(moderation.router)
app.include_router(invites.router)
app.include_router(announcements.router)
app.include_router(forums.router)
app.include_router(docs.router)
app.include_router(feedback.router)
app.include_router(admin.router)
app.include_router(embeds.router)
app.include_router(uploads.router)
app.include_router(deletion.router)
app.include_router(editing.router)
app.include_router(reactions.router)
app.include_router(mentions.router)

@app.on_event("startup")
async def interval_tasks():
    asyncio.create_task(check_invites())
    asyncio.create_task(sweep_pending_deletes())
    asyncio.create_task(sweep_completed_feedback())

@app.websocket("/ws")
async def connect_user(socket: WebSocket, session_id: str = Cookie(None), database: Session = Depends(get_db)):

    current_user = validate_session(session_id, database)
    if not current_user:
        await socket.close(code=1008)
        return

    await socket.accept()
    was_online = current_user.id in active_connections
    active_connections[current_user.id] = socket
    if not was_online:
        await notify_presence(database, current_user.id, "online")
    heartbeat_task = asyncio.create_task(heartbeat(socket))
    try:
        while True:
            data = await socket.receive_json()

            if data["type"] == "message":
                try:
                    new_message = Message_schema(
                    sender_id = current_user.id,
                    receiver_id = data["receiver_id"],
                    content= data.get("content") or "",
                    attachment= ws_attachment(data),
                    reply_to_id= data.get("reply_to_id"))
                    new_message = send_message(message=new_message, database=database, current_user=current_user)
                except HTTPException as e:
                    await socket.send_json({"type": "error", "detail": e.detail})
                    continue

                await socket.send_json({
                    "type": "message_ack",
                    "kind": "dm",
                    "id": new_message.id,
                    "temp_id": data.get("temp_id"),
                })
                if data["receiver_id"] in active_connections:
                    await active_connections[data["receiver_id"]].send_json({
                    "type": "message",
                    "id": new_message.id,
                    "username": current_user.username,
                    "sender_id": current_user.id,
                    "content": data.get("content") or "",
                    "attachment": attachment_public(new_message.attachment),
                    "timestamp": str(new_message.timestamp),
                    "reply_to": live_reply_to(database, Message, new_message.reply_to_id),
                    "avatar": public_avatar(current_user)})
            elif data["type"] == "party_message":
                try:
                    new_party_message = Party_message_schema(
                    sender_id= current_user.id,
                    party_id= data["party_id"],
                    content= data.get("content") or "",
                    attachment= ws_attachment(data),
                    reply_to_id= data.get("reply_to_id"),
                    )
                    new_party_message = message_party(party_msg= new_party_message,database=database, current_user=current_user)
                except HTTPException as e:
                    await socket.send_json({"type": "error", "detail": e.detail})
                    continue
                await socket.send_json({
                    "type": "message_ack",
                    "kind": "party",
                    "id": new_party_message.id,
                    "temp_id": data.get("temp_id"),
                })
                party_info = database.query(Parties).filter(Parties.id == data["party_id"]).first()
                all_members = database.query(Party_members).filter(Party_members.party_id == data["party_id"]).all()
                pinged_ids = mentioned_user_ids(database, "party", new_party_message.id)
                users_map = mention_user_map(database, new_party_message.content)
                reply_to = live_reply_to(database, Party_messages, new_party_message.reply_to_id)

                for member in all_members:
                    if member.user_id != current_user.id and member.user_id in active_connections:
                        await active_connections[member.user_id].send_json({
                            "type": "party_message",
                            "id": new_party_message.id,
                            "party_name": party_info.party_name,
                            "party_id": data["party_id"],
                            "sender_id": current_user.id,
                            "username": current_user.username,
                            "content": new_party_message.content,
                            "attachment": attachment_public(new_party_message.attachment),
                            "timestamp": str(new_party_message.timestamp),
                            "mentioned": member.user_id in pinged_ids,
                            "mention_users": users_map,
                            "reply_to": reply_to,
                            "avatar": public_avatar(current_user)
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
                try:
                    new_server_msg = Server_message(
                    sender_id= current_user.id,
                    channel_id= data["channel_id"],
                    content = data.get("content") or "",
                    attachment= ws_attachment(data),
                    reply_to_id= data.get("reply_to_id"),
                    )
                    new_server_msg = message_server_channel(server_msg= new_server_msg, database=database, current_user=current_user)
                except HTTPException as e:
                    await socket.send_json({"type": "error", "detail": e.detail})
                    continue

                await socket.send_json({
                    "type": "message_ack",
                    "kind": "channel",
                    "id": new_server_msg.id,
                    "temp_id": data.get("temp_id"),
                })
                channel = database.query(Server_channels).filter(Server_channels.id == data["channel_id"]).first()
                category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
                server = database.query(Servers).filter(Servers.id == category.server_id).first()

                all_members = database.query(Server_members).filter(Server_members.server_id == server.id).all()
                pinged_ids = mentioned_user_ids(database, "channel", new_server_msg.id)
                users_map = mention_user_map(database, new_server_msg.content)
                roles_map = mention_role_map(database, new_server_msg.content)
                reply_to = live_reply_to(database, Channel_messages, new_server_msg.reply_to_id)
                from app.routers.roles import name_color_role_for_user
                name_role = name_color_role_for_user(database, server.id, current_user.id)
                for member in all_members:
                    if member.user_id != current_user.id and member.user_id in active_connections:
                        await active_connections[member.user_id].send_json({
                            "type": "channel_message",
                            "id": new_server_msg.id,
                            "server_id": server.id,
                            "channel_id": channel.id,
                            "sender_id": current_user.id,
                            "username": current_user.username,
                            "content": new_server_msg.content,
                            "attachment": attachment_public(new_server_msg.attachment),
                            "timestamp": str(new_server_msg.timestamp),
                            "mentioned": member.user_id in pinged_ids,
                            "mention_users": users_map,
                            "mention_roles": roles_map,
                            "reply_to": reply_to,
                            "avatar": public_avatar(current_user),
                            "name_role": name_role,
                        })
            elif data["type"] == "forum_message":
                try:
                    new_forum_msg = Forum_message_create(
                    post_id = data["post_id"],
                    content = data.get("content") or "",
                    attachment= ws_attachment(data),
                    reply_to_id= data.get("reply_to_id"),
                    )
                    new_forum_msg = await send_forum_message(forum_message= new_forum_msg, database=database, current_user=current_user)
                except HTTPException as e:
                    await socket.send_json({"type": "error", "detail": e.detail})
                    continue

                await socket.send_json({
                    "type": "message_ack",
                    "kind": "forum",
                    "id": new_forum_msg["id"],
                    "temp_id": data.get("temp_id"),
                })
                post = database.query(Forum_post).filter(Forum_post.id == data["post_id"]).first()
                channel = database.query(Server_channels).filter(Server_channels.id == post.channel_id).first()
                category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
                server = database.query(Servers).filter(Servers.id == category.server_id).first()

                all_members = database.query(Server_members).filter(Server_members.server_id == server.id).all()
                pinged_ids = mentioned_user_ids(database, "forum", new_forum_msg["id"])
                users_map = mention_user_map(database, new_forum_msg.get("content") or "")
                roles_map = mention_role_map(database, new_forum_msg.get("content") or "")
                from app.routers.roles import name_color_role_for_user
                name_role = name_color_role_for_user(database, server.id, current_user.id)
                for member in all_members:
                    if member.user_id != current_user.id and member.user_id in active_connections:
                        await active_connections[member.user_id].send_json({
                            "type": "forum_message",
                            "post_id": post.id,
                            "channel_id": channel.id,
                            "server_id": server.id,
                            "id": new_forum_msg["id"],
                            "sender_id": current_user.id,
                            "username": current_user.username,
                            "content": new_forum_msg.get("content") or "",
                            "attachment": new_forum_msg.get("attachment"),
                            "timestamp": new_forum_msg["timestamp"],
                            "mentioned": member.user_id in pinged_ids,
                            "mention_users": users_map,
                            "mention_roles": roles_map,
                            "reply_to": new_forum_msg.get("reply_to"),
                            "avatar": public_avatar(current_user),
                            "name_role": name_role,
                        })
            elif data["type"] == "typing":
                await relay_typing(data, current_user, database)

    except WebSocketDisconnect:
        await release_doc_locks(current_user.id, database)
        if current_user.id in active_connections and active_connections[current_user.id] is socket:
            del active_connections[current_user.id]
            await notify_presence(database, current_user.id, "offline")
        heartbeat_task.cancel()
