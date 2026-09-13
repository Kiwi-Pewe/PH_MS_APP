from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Channel_messages
from app.schemas import Server_create, Server_message, Category_create, Channel_create
from app.database import get_db
from app.auth import get_current_user
from app.r2 import attachment_public, require_message_body, store_attachment
from app.routers.realtime import server_broadcast
import random

router = APIRouter()

@router.post("/create_server")
def create_server(server_name: Server_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server_id_chars = "234679ACDEFGHJKLMNPQRTUVWXYZ"

    while True:
        test_id = "".join(random.choices(server_id_chars, k=10))
        id_check = database.query(Servers).filter(Servers.id == test_id).first()
        if not id_check: break

    new_server = Servers(
        id = test_id,
        name = server_name.name,
        owner_id = current_user.id
    )
    database.add(new_server)

    highest_position = database.query(func.max(Server_members.position)).filter(Server_members.user_id == current_user.id).scalar()

    new_member = Server_members(
        server_id = test_id,
        user_id = current_user.id,
        position = 100 if highest_position == None else highest_position + 100,
    )
    database.add(new_member)

    text_category = Server_categories(
        server_id = test_id,
        name = "Text Channels",
        position = 100,
    )
    database.add(text_category)
    database.flush() 

    text_channel = Server_channels(
        category_id = text_category.id,
        name = "general",
        channel_type = "text",
        position = 100,
    )
    database.add(text_channel)

    voice_category = Server_categories(
        server_id = test_id,
        name = "Voice Channels",
        position = 200,
    )
    database.add(voice_category)
    database.flush() 

    voice_channel = Server_channels(
        category_id = voice_category.id,
        name = "General",
        channel_type = "voice",
        position = 100,
    )
    database.add(voice_channel)

    database.commit()

@router.get("/get_servers")
def get_user_servers(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    user_servers = database.query(Server_members).filter(Server_members.user_id == current_user.id).order_by(Server_members.position).all()

    server_list = []
    for server in user_servers:
        server_info = database.query(Servers).filter(Servers.id == server.server_id).first()
        server_list.append({"type": "server", "id": server_info.id, "name": server_info.name,  "position": server.position})

    return {"servers": server_list}

@router.get("/get_server_contents/{server_id}")
def get_server_contents(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    in_server = database.query(Server_members).filter(Server_members.server_id == server_id, Server_members.user_id == current_user.id).first()

    if not in_server:
        raise HTTPException(status_code=404, detail="Server membership not found")

    all_categories = database.query(Server_categories).filter(Server_categories.server_id == server_id).order_by(Server_categories.position).all()
    server = database.query(Servers).filter(Servers.id == server_id).first()
    is_owner = server.owner_id == current_user.id
    server_info = []

    for category in all_categories:
        channel_info = []
        if category.is_private == False or is_owner:
            all_channels = database.query(Server_channels).filter(Server_channels.category_id == category.id).order_by(Server_channels.position).all()

            for channel in all_channels:
                if channel.is_private == False or is_owner:
                    channel_info.append({"id": channel.id, "category_id": channel.category_id, "name": channel.name, "channel_type": channel.channel_type, "position": channel.position, "is_private": channel.is_private})

            server_info.append({"id": category.id, "name": category.name, "position": category.position, "is_private": category.is_private, "channels": channel_info})
            
    return {"type": "server", "categories": server_info, "owner": server.owner_id}

@router.post("/message_server_channel")
def message_server_channel(server_msg: Server_message, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel = database.query(Server_channels).filter(Server_channels.id == server_msg.channel_id).first()
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()

    if not is_member:
        raise HTTPException(status_code=404, detail= "Server membership not found.")

    require_message_body(server_msg.content, server_msg.attachment)
    new_message = Channel_messages(
        sender_id= current_user.id,
        channel_id = channel.id,
        content= server_msg.content,
        attachment=store_attachment(server_msg.attachment, current_user),
    )
    database.add(new_message)
    database.commit()
    database.refresh(new_message)
    return new_message    

@router.get("/get_channel_history/{channel_id}")
def get_channel_history(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user), before_id: int = None):

    target_channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not target_channel:
        raise HTTPException(status_code= 404, detail="Channel not found.")

    category = database.query(Server_categories).filter(Server_categories.id == target_channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()

    if not is_member:
        raise HTTPException(status_code= 404, detail="Server membership not found")

    if before_id:
        channel_history = database.query(Channel_messages).filter(Channel_messages.channel_id == channel_id, Channel_messages.id < before_id).order_by(Channel_messages.timestamp.desc()).limit(25).all()
    else:
        channel_history = database.query(Channel_messages).filter(Channel_messages.channel_id == channel_id).order_by(Channel_messages.timestamp.desc()).limit(25).all()

    sender_ids = list({message.sender_id for message in channel_history})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(sender_ids)).all()
    username_lookup = {account.id: account.username for account in accounts}

    message_history = []
    for message in channel_history:
        message_history.append({
            "id": message.id,
            "sender_id": message.sender_id,
            "username": "" if message.sender_id == None else username_lookup[message.sender_id],
            "content": message.content,
            "attachment": attachment_public(message.attachment),
            "timestamp": str(message.timestamp)
        })

    message_history.reverse()
    return {"server_name": server.name, "server_id": server.id, "channel_id": channel_id, "session_username": current_user.username, "messages": message_history}

@router.post("/create_category")
async def create_category(category_info: Category_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = database.query(Servers).filter(Servers.id == category_info.server_id).first()
    if not server or not server.owner_id == current_user.id:
        raise HTTPException(status_code= 403, detail= "Server or owner doesnt match")
    
    highest_position = database.query(func.max(Server_categories.position)).filter(Server_categories.server_id == category_info.server_id).scalar()

    new_category = Server_categories(
        server_id = server.id,
        name = category_info.name,
        position = 100 if highest_position == None else highest_position + 100,
        is_private = category_info.is_private
    )
    database.add(new_category)
    database.commit()
    database.refresh(new_category)
    payload = {
        "type": "category_created",
        "server_id": server.id,
        "category": {"id": new_category.id, "name": new_category.name, "position": new_category.position, "is_private": new_category.is_private, "channels": []}
    }
    await server_broadcast(server_id= server.id, payload= payload, database= database, exclude_user_id= current_user.id)
    return "success"

@router.post("/create_channel")
async def create_channel(channel_info: Channel_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    category = database.query(Server_categories).filter(Server_categories.id == channel_info.category_id).first()
    if not category:
        raise HTTPException (status_code= 404, detail= "Category not found")
    server = database.query(Servers).filter(Servers.id == category.server_id).first()

    if not server.owner_id == current_user.id:
        raise HTTPException(status_code= 403, detail="Owner doesn't match")

    highest_position = database.query(func.max(Server_channels.position)).filter(Server_channels.category_id == channel_info.category_id).scalar()

    new_channel = Server_channels(
        category_id = category.id,
        name = channel_info.name,
        channel_type = channel_info.channel_type,
        position = 100 if highest_position == None else highest_position + 100,
        is_private = channel_info.is_private
    )
    database.add(new_channel)
    database.commit()
    database.refresh(new_channel)
    payload = {
        "type": "channel_created",
        "server_id": server.id,
        "channel": {"channel_type": new_channel.channel_type, "id": new_channel.id, "name": new_channel.name, "position": new_channel.position, "is_private": new_channel.is_private, "category_id": new_channel.category_id}
    }
    await server_broadcast(server_id= server.id, payload= payload, database= database, exclude_user_id= current_user.id)
    return "success"
