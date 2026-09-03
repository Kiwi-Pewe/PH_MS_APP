# FastAPI app entry point — your endpoints will live here.
from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, HTTPException, Response, Cookie
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from app.models import UserInfo, Message, Active_Sessions, Block_user, Friend_request, Conversations, Parties, Party_messages, Servers, Server_members, Server_categories, Server_channels, Channel_messages, Party_members, Invite_model
from app.schemas import Account_register, Account_login, Message_schema, Block_schema, Friend_user, Party_create, Party_message_schema, Server_create, Server_message, Invite
from app.database import get_db, Base, engine, SessionLocal
from app.auth import pwd_context, create_session_id, get_current_user, validate_session
from datetime import datetime, timedelta
import asyncio
import random

app = FastAPI()
Base.metadata.create_all(engine)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://oneira.cc"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
active_connections = {}

app.mount("/static", StaticFiles(directory="frontend", html=True), name="frontend")

@app.get("/home")
def home_page():
    return "Home Page"

@app.post("/login")
def login_account(account: Account_login, response: Response, database : Session = Depends(get_db)):

    existing_user = database.query(UserInfo).filter(UserInfo.username == account.username).first()
    
    if not existing_user:
        raise HTTPException(status_code = 401, detail= "Username or Password is incorrect.")
    correct_password = pwd_context.verify(account.password, existing_user.hashed_password)
    if not correct_password:
        raise HTTPException(status_code = 401, detail= "Username or Password is incorrect.")

    existing_session_id = database.query(Active_Sessions).filter(Active_Sessions.account_id == existing_user.id).first()

    if not existing_session_id:
        new_id = create_session_id(32)
        new_session_id = Active_Sessions(session_id =  new_id, account_id = existing_user.id)
        database.add(new_session_id)
        database.commit()
        database.refresh(new_session_id)
        response.set_cookie(
        samesite="none",
        secure=True,
        key='session_id',
        value= new_id,
        httponly=True,
        max_age= 60 * 60 * 24 * 30
        )
    else:
        existing_session_id.last_active = datetime.now()
        database.commit()
        response.set_cookie(
        samesite="none",
        secure=True,
        key='session_id',
        value= existing_session_id.session_id,
        httponly=True,
        max_age= 60 * 60 * 24 * 30
        )

    return existing_user

@app.post("/logout")
def logout_account(response:Response, session_id: str = Cookie(None), database: Session = Depends(get_db)):

    existing_session = database.query(Active_Sessions).filter(Active_Sessions.session_id == session_id).first()
    if existing_session:
        database.delete(existing_session)
        database.commit()
        response.delete_cookie(key="session_id", samesite="none", secure=True)
    return

@app.post("/register", status_code = 201)
def create_account(account: Account_register, database : Session = Depends(get_db)):

    existing_username = database.query(UserInfo).filter(UserInfo.username == account.username).first()

    if existing_username:
        raise HTTPException(status_code= 409 , detail= "Username is already taken." )   
    
    info = UserInfo(username = account.username, hashed_password = pwd_context.hash(account.password))    
    database.add(info)
    database.commit()
    database.refresh(info)
    return info

@app.post("/messages")
def send_message(message: Message_schema, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    is_blocked = database.query(Block_user).filter(Block_user.initiated_by == current_user.id, Block_user.blocked_user == message.receiver_id).first()
    blocked_mirrored = database.query(Block_user).filter(Block_user.initiated_by == message.receiver_id, Block_user.blocked_user == current_user.id).first()

    if is_blocked or blocked_mirrored:
        raise HTTPException(status_code= 400, detail= "User is blocked.")

    is_friend = database.query(Friend_request).filter(Friend_request.user_1 == current_user.id, Friend_request.user_2 == message.receiver_id).first()
    friend_mirrored = database.query(Friend_request).filter(Friend_request.user_1 == message.receiver_id, Friend_request.user_2 == current_user.id).first()
    active_request = is_friend or friend_mirrored

    if not active_request:
        raise HTTPException(status_code= 404, detail= "No friend request found")

    if active_request.pending == True:
        raise HTTPException(status_code= 400, detail= "Friend request pending")

    convo_exists = database.query(Conversations).filter(Conversations.user_1 == current_user.id, Conversations.user_2 == message.receiver_id).first()
    mirrored_convo = database.query(Conversations).filter(Conversations.user_1 == message.receiver_id, Conversations.user_2 == current_user.id).first()
    active_convo = convo_exists or mirrored_convo

    if not active_convo:
        new_convo = Conversations(user_1 = current_user.id, user_2 = message.receiver_id, last_message_at = datetime.now()) 
        database.add(new_convo)
        database.commit()
        database.refresh(new_convo)
        active_convo = new_convo
    else:
        active_convo.last_message_at = datetime.now()

    active_convo.closed_by_user_1 = False
    active_convo.closed_by_user_2 = False
    new_message = Message(sender_id = current_user.id, 
    receiver_id = message.receiver_id,
    content = message.content,
    read = False,
    )
    database.add(new_message)
    database.commit()
    database.refresh(new_message)

    return new_message

@app.get("/messages/{user_id}")
def get_conversation(user_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user), before_id: int = None):

    if before_id:
        History = database.query(Message).filter(or_(
        (Message.sender_id == current_user.id) & (Message.receiver_id == user_id),
        (Message.sender_id == user_id) & (Message.receiver_id == current_user.id)
        )).filter(Message.id < before_id).order_by(Message.timestamp.desc()).limit(25).all()
    else:
        History = database.query(Message).filter(or_((Message.sender_id == current_user.id) & (Message.receiver_id == user_id),
        (Message.sender_id == user_id) & (Message.receiver_id == current_user.id))).order_by(Message.timestamp.desc()).limit(25).all()


    target_user = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code= 404,  detail="No user found")
    for msg in History:
        if msg.receiver_id == current_user.id:
            msg.read = True

    database.commit()
    History.reverse()
    return {"other_username": target_user.username, "session_username": current_user.username , "messages":History}

@app.get("/conversation_history")
def conversation_history(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    convo_history = database.query(Conversations).filter(or_(Conversations.user_1 == current_user.id, Conversations.user_2 == current_user.id),
    or_(and_(Conversations.user_1 == current_user.id, Conversations.closed_by_user_1 == False),
    and_(Conversations.user_2 == current_user.id, Conversations.closed_by_user_2 == False))
    ).order_by(Conversations.last_message_at.desc()).all()

    conversations_out = []
    for convo in convo_history:
        other_id = convo.user_2 if convo.user_1 == current_user.id else convo.user_1
        other_account = database.query(UserInfo).filter(UserInfo.id == other_id).first()
        message_status = database.query(Message).filter(Message.sender_id == other_id, Message.receiver_id == current_user.id, Message.read == False).count()
        conversations_out.append({"type": "dm", "id": other_id, "username": other_account.username, "unread_count": message_status, "last_message_at": str(convo.last_message_at)})

    return {"conversations": conversations_out}

@app.post("/conversation/{other_user_id}/close")
def close_conversation(other_user_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    convo = database.query(Conversations).filter(Conversations.user_1 == current_user.id, Conversations.user_2 == other_user_id).first()
    mirrored_convo = database.query(Conversations).filter(Conversations.user_1 == other_user_id, Conversations.user_2 == current_user.id).first()

    active_convo = convo or mirrored_convo

    if not active_convo:
        raise HTTPException(status_code= 404, detail= "No conversation found.")

    if active_convo.user_1 == current_user.id:
        active_convo.closed_by_user_1 = True
        database.commit()
    else:
        active_convo.closed_by_user_2 = True
        database.commit()

@app.post("/block")
def block_account(block_user: Block_schema, database: Session= Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    are_friends_1 = database.query(Friend_request).filter(Friend_request.user_1 == current_user.id, Friend_request.user_2 == block_user.blocked_user).first()
    are_friends_2 = database.query(Friend_request).filter(Friend_request.user_1 == block_user.blocked_user, Friend_request.user_2 == current_user.id).first()

    if are_friends_1:
        info = Friend_user(user_id_1 = are_friends_1.user_1, user_id_2= are_friends_1.user_2)
        remove_user(info, database= database, current_user= current_user)
    elif are_friends_2:
        info = Friend_user(user_id_1 = are_friends_2.user_1, user_id_2= are_friends_2.user_2)
        remove_user(info, database= database, current_user= current_user)

    block = Block_user(initiated_by= current_user.id ,blocked_user = block_user.blocked_user)
    database.add(block)
    database.commit()
    database.refresh(block)
    return

@app.post("/unblock")
def unblock_account(block_user: Block_schema, database: Session= Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    is_blocked = database.query(Block_user).filter(Block_user.initiated_by == current_user.id, Block_user.blocked_user == block_user.blocked_user).first()
    if not is_blocked:
        raise HTTPException(status_code= 404, detail= "blocked user not found.")

    if is_blocked.initiated_by != current_user.id:
        raise HTTPException(status_code= 409, detail="Current user did not create Block.") 
    database.delete(is_blocked)
    database.commit()
    return

@app.post("/friend_user")
async def add_user(friends: Friend_user, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    friend_exists = database.query(UserInfo).filter(UserInfo.username == friends.username).first()
    if not friend_exists:
        raise HTTPException(status_code= 404, detail= "Friend not found")
    if current_user.id == friend_exists.id:
        raise HTTPException(status_code=409, detail="Cannot friend yourself")

    blocked_1 = database.query(Block_user).filter(Block_user.initiated_by == friend_exists.id, Block_user.blocked_user == current_user.id).first()
    blocked_2 = database.query(Block_user).filter(Block_user.initiated_by == current_user.id, Block_user.blocked_user == friend_exists.id).first()
    is_blocked = blocked_1 or blocked_2
    if is_blocked:
        raise HTTPException(status_code=400, detail="User is blocked from sending request")

    reversed_pending = database.query(Friend_request).filter(Friend_request.user_1 == friend_exists.id, Friend_request.user_2 == current_user.id).first()
    if reversed_pending and reversed_pending.pending == True:
        reversed_pending.pending = False
        database.commit()
        return
    
    pending_request = database.query(Friend_request).filter(Friend_request.user_1 == current_user.id, Friend_request.user_2 == friend_exists.id).first()
    if pending_request and pending_request.pending == True:
        raise HTTPException(status_code=409, detail="account has pending request.")
    elif (pending_request and pending_request.pending == False) or (reversed_pending and reversed_pending.pending == False):
        raise HTTPException(status_code=400, detail="accounts are already friends.")

    add_friend = Friend_request(user_1 = current_user.id, user_2 = friend_exists.id, pending = True)
    database.add(add_friend)
    database.commit()
    database.refresh(add_friend)

    if friend_exists.id in active_connections:
        await active_connections[friend_exists.id].send_json({"type": "friend_request", "sender_id": current_user.id, "username": current_user.username})
    return

@app.get("/get_friends")
def get_friends(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    pending_requests = database.query(Friend_request).filter(Friend_request.user_2 == current_user.id, Friend_request.pending == True).all()
    accepted_friends = database.query(Friend_request).filter(or_(Friend_request.user_1 == current_user.id, Friend_request.user_2 == current_user.id), Friend_request.pending == False).all()
    all_requests = []
    online_friends = []
    offline_friends = []

    for entry in pending_requests:
        other_id = entry.user_2 if entry.user_1 == current_user.id else entry.user_1
        actual_account = database.query(UserInfo).filter(UserInfo.id == other_id).first()
        all_requests.append({"id": other_id, "username": actual_account.username})

    for friends in accepted_friends:
        other_id = friends.user_2 if friends.user_1 == current_user.id else friends.user_1
        actual_account = database.query(UserInfo).filter(UserInfo.id == other_id).first()

        if actual_account.id in active_connections:
            online_friends.append({"id": other_id, "username": actual_account.username})
        else:
            offline_friends.append({"id": other_id, "username": actual_account.username})

    return {"pending_requests": all_requests, "online_friends": online_friends, "offline_friends": offline_friends}

@app.post("/unfriend_user")
def remove_user(friends: Friend_user, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    friend_file_1 = database.query(Friend_request).filter(Friend_request.user_1 == current_user.id, Friend_request.user_2 == friends.user_id_2).first()
    friend_file_2 = database.query(Friend_request).filter(Friend_request.user_1 == friends.user_id_2, Friend_request.user_2 == current_user.id).first()

    if friend_file_1:
        database.delete(friend_file_1)
        database.commit()
    elif friend_file_2:
        database.delete(friend_file_2)
        database.commit()
    else:
        raise HTTPException(status_code= 404, detail="Friend not found.")
    return

@app.post("/create_party")
def create_party(party: Party_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    while True:
        potential_id = random.randint(1000, 9999)
        id_check = database.query(Parties).filter(Parties.id == potential_id).first()
        if not id_check:
            break

    new_party = Parties(
        id=potential_id,
        party_name=party.party_name,
        created_by_id=current_user.id
    )
    database.add(new_party)

    owner_member = Party_members(party_id=potential_id, user_id=current_user.id)
    database.add(owner_member)

    for user in party.member_ids:
        if not user == current_user.id:
            invited_member = Party_members(party_id=potential_id, user_id=user)
            database.add(invited_member)

    database.commit()

@app.get("/get_parties")
def get_parties(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    my_memberships = database.query(Party_members).filter(Party_members.user_id == current_user.id).all()

    parties_out = []
    for membership in my_memberships:
        party_info = database.query(Parties).filter(Parties.id == membership.party_id).first()
        member_count = database.query(Party_members).filter(Party_members.party_id == membership.party_id).count()

        latest_message_time = database.query(func.max(Party_messages.timestamp)).filter(Party_messages.party_id == membership.party_id).scalar()
        sort_timestamp = latest_message_time if latest_message_time else membership.joined_at

        unread_count = database.query(Party_messages).filter(
            Party_messages.party_id == membership.party_id,
            Party_messages.timestamp > membership.last_activity,
            Party_messages.sender_id != current_user.id
        ).count()

        parties_out.append({"type": "party", "id": membership.party_id, "name": party_info.party_name, "member_count": member_count, "last_activity": str(sort_timestamp), "unread_count": unread_count})

    return {"parties": parties_out}
    
@app.post("/send_party_message")
def message_party(party_msg: Party_message_schema, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    in_Party = database.query(Party_members).filter(Party_members.user_id == current_user.id, Party_members.party_id == party_msg.party_id).first()

    if not in_Party:
        raise HTTPException(status_code=404, detail="Party not found.")

    new_party_msg = Party_messages(
        party_id=party_msg.party_id,
        sender_id=current_user.id,
        content=party_msg.content,
    )
    database.add(new_party_msg)

    database.query(Party_members).filter(Party_members.party_id == party_msg.party_id, Party_members.user_id == current_user.id).update(
        {"last_activity": datetime.utcnow()}
    )
    database.commit()
    database.refresh(new_party_msg)

    return new_party_msg

@app.get("/get_party_messages/{party_id}")
def get_party_messages(party_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user), before_id: int = None):

    target_membership = database.query(Party_members).filter(Party_members.party_id == party_id, Party_members.user_id == current_user.id).first()
    if not target_membership:
        raise HTTPException(status_code=404, detail="User not in party")

    party_info = database.query(Parties).filter(Parties.id == party_id).first()

    if not before_id:
        database.query(Party_members).filter(Party_members.party_id == party_id, Party_members.user_id == current_user.id).update(
            {"last_activity": datetime.utcnow()}
        )
    database.commit()

    if before_id:
        party_history = database.query(Party_messages).filter(Party_messages.party_id == party_id, Party_messages.id < before_id).order_by(Party_messages.timestamp.desc()).limit(25).all()
    else:
        party_history = database.query(Party_messages).filter(Party_messages.party_id == party_id).order_by(Party_messages.timestamp.desc()).limit(25).all()

    sender_ids = list({message.sender_id for message in party_history})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(sender_ids)).all()
    username_lookup = {account.id: account.username for account in accounts}

    message_history = []

    for message in party_history:
        message_history.append({
            "id": message.id,
            "sender_id": message.sender_id,
            "username": "" if message.sender_id == None else username_lookup[message.sender_id],
            "content": message.content,
            "timestamp": str(message.timestamp)
        })

    message_history.reverse()
    return {"party_name": party_info.party_name, "party_id": party_id, "session_username": current_user.username, "messages": message_history}

@app.post("/leave_party")
async def leave_party(party_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    membership_to_leave = database.query(Party_members).filter(Party_members.party_id == party_id, Party_members.user_id == current_user.id).first()

    if not membership_to_leave:
        raise HTTPException(status_code=404, detail="No party with user_id found")

    server_message = Party_messages(
        party_id=party_id,
        sender_id=None,
        content=f"{current_user.username} has left the party.",
    )
    database.add(server_message)
    database.delete(membership_to_leave)
    database.flush() 

    remaining_count = database.query(Party_members).filter(Party_members.party_id == party_id).count()
    if remaining_count == 0:
        database.query(Party_messages).filter(Party_messages.party_id == party_id).delete()
        empty_party = database.query(Parties).filter(Parties.id == party_id).first()
        if empty_party:
            database.delete(empty_party)

    database.commit()
    database.refresh(server_message)

    return {"success": True, "message": server_message}

@app.post("/create_server")
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

@app.get("/get_servers")
def get_user_servers(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    user_servers = database.query(Server_members).filter(Server_members.user_id == current_user.id).order_by(Server_members.position).all()

    server_list = []
    for server in user_servers:
        server_info = database.query(Servers).filter(Servers.id == server.server_id).first()
        server_list.append({"type": "server", "id": server_info.id, "name": server_info.name,  "position": server.position})

    return {"servers": server_list}

@app.get("/get_server_contents/{server_id}")
def get_server_contents(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    in_server = database.query(Server_members).filter(Server_members.server_id == server_id, Server_members.user_id == current_user.id).first()

    if not in_server:
        raise HTTPException(status_code=404, detail="Server membership not found")

    all_categories = database.query(Server_categories).filter(Server_categories.server_id == server_id).order_by(Server_categories.position).all()
    server = database.query(Servers).filter(Servers.id == server_id).first()
    server_info = []
    for category in all_categories:
        channel_info = []
        all_channels = database.query(Server_channels).filter(Server_channels.category_id == category.id).order_by(Server_channels.position).all()

        for channel in all_channels:
            channel_info.append({"id": channel.id ,"category_id": channel.category_id, "name": channel.name, "channel_type": channel.channel_type, "position": channel.position})

        server_info.append({"id": category.id, "name": category.name, "position": category.position, "channels": channel_info})
        
    return {"type": "server", "categories": server_info, "owner": server.owner_id}

@app.post("/message_server_channel")
def message_server_channel(server_msg: Server_message, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel = database.query(Server_channels).filter(Server_channels.id == server_msg.channel_id).first()
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()

    if not is_member:
        raise HTTPException(status_code=404, detail= "Server membership not found.")

    new_message = Channel_messages(
        sender_id= current_user.id,
        channel_id = channel.id,
        content= server_msg.content
    )
    database.add(new_message)
    database.commit()
    database.refresh(new_message)
    return new_message    

@app.get("/get_channel_history/{channel_id}")
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
            "timestamp": str(message.timestamp)
        })

    message_history.reverse()
    return {"server_name": server.name, "server_id": server.id, "channel_id": channel_id, "session_username": current_user.username, "messages": message_history}

@app.post("/accept_invite")
def accept_invite(code: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    invite = database.query(Invite_model).filter(Invite_model.code == code).first()
    if not invite or not is_invite_valid(invite):
        raise HTTPException(status_code=404, detail= "Invite not found")

    if invite.type == "server":
        server = database.query(Servers).filter(Servers.id == invite.server_id).first()
        is_member = database.query(Server_members).filter(Server_members.server_id == invite.server_id, Server_members.user_id == current_user.id).first()
        if is_member:
            return {"type": "server", "id": invite.server_id, "server_name": server.name, "position": is_member.position}
        
        highest_position = database.query(func.max(Server_members.position)).filter(Server_members.user_id == current_user.id).scalar()
        new_member = Server_members(
            server_id = invite.server_id,
            user_id = current_user.id,
            position = 100 if highest_position == None else highest_position + 100,
        )
        database.add(new_member)

        category = database.query(Server_categories).filter(Server_categories.server_id == invite.server_id).order_by(Server_categories.position).first()
        channel = database.query(Server_channels).filter(Server_channels.category_id == category.id).order_by(Server_channels.position).first()
        
        join_message = Channel_messages(
            sender_id = None,
            channel_id = channel.id,
            content = f"{current_user.username} has joined the server"
        )
        database.add(join_message)
        database.commit()
        return {"type": "server", "id": invite.server_id, "server_name": server.name, "position": new_member.position,}

    elif invite.type == "party":
        party = database.query(Parties).filter(Parties.id == invite.party_id).first()
        is_member = database.query(Party_members).filter(Party_members.party_id == invite.party_id, Party_members.user_id == current_user.id).first()
        if is_member:
            return {"type": "party", "party_name": party.party_name, "party_id": invite.party_id}
        member_count = database.query(Party_members).filter(Party_members.party_id == invite.party_id).count()
        if member_count == 10:
            return{"type": "party", "id": invite.party_id, "party_name": party.party_name,"full": True}

        new_member = Party_members(
            party_id = invite.party_id,
            user_id = current_user.id
        )
        invite.use_count += 1
        database.add(new_member)
        join_message = Party_messages(
            sender_id= None,
            party_id= invite.party_id,
            content = f"{current_user.username} has joined the party."
        )
        database.add(join_message)
        database.commit()
        return {"type": "party", "id": invite.party_id, "party_name": party.party_name}
        
@app.post("/create_invite")
def create_invite(type: Invite, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    if type.type == "server":
        is_member = database.query(Server_members).filter(Server_members.server_id == type.server_id, Server_members.user_id == current_user.id).first()

        if not is_member:
            raise HTTPException(status_code=404, detail="Server membership not found")

        previous_invite = database.query(Invite_model).filter(Invite_model.server_id == type.server_id, Invite_model.creator_id == current_user.id).first()

        if previous_invite:
            if datetime.utcnow() - previous_invite.created_at < timedelta(hours=24):
                return {"invite_code": previous_invite.code}
            else:
                database.delete(previous_invite)
                database.commit()
    elif type.type == "party":
        is_member = database.query(Party_members).filter(Party_members.party_id == type.party_id, Party_members.user_id == current_user.id).first()

        if not is_member:
            raise HTTPException(status_code=404, detail="Party membership not found")

        previous_invite = database.query(Invite_model).filter(Invite_model.party_id == type.party_id, Invite_model.creator_id == current_user.id).first()

        if previous_invite:
            if datetime.utcnow() - previous_invite.created_at < timedelta(hours=24):
                return {"invite_code": previous_invite.code}
            else:
                database.delete(previous_invite)
                database.commit()
    elif type.type not in ("server", "party"):
        raise HTTPException(status_code= 400, detail="Invalid invite type")

    valid_code_characters = "234679ACDEFGHJKLMNPQRTUVWXYZ"
    while True:
        new_code = "".join(random.choices(valid_code_characters, k=8))
        check_code = database.query(Invite_model).filter(Invite_model.code == new_code).first()
        if not check_code: break

    invite_card = Invite_model(
        code = new_code,
        type = type.type,
        creator_id = current_user.id,
        server_id = type.server_id,
        party_id = type.party_id,
    )

    database.add(invite_card)
    database.commit()
    return {"invite_code": new_code}

@app.get("/invite/{code}")
def get_invite_info(code: str, database: Session = Depends(get_db)):
    invite = database.query(Invite_model).filter(Invite_model.code == code).first()
    if not invite or not is_invite_valid(invite):
        return {"valid": False}

    if invite.type == "party":
        party_info= database.query(Parties).filter(Parties.id == invite.party_id).first()
        all_members = database.query(Party_members).filter(Party_members.party_id == invite.party_id).count()
        return {"type": "party","party_name": party_info.party_name, "full": True if all_members >= 10 else  False}
    elif invite.type == "server":
        server_info = database.query(Servers).filter(Servers.id == invite.server_id).first()
        total_members = database.query(Server_members).filter(Server_members.server_id == invite.server_id).count()
        all_members = database.query(Server_members).filter(Server_members.server_id == invite.server_id).all()

        active = 0
        for members in all_members:
            if members.user_id in active_connections:
                active += 1
        return{"type": "server", "server_name": server_info.name, "active_users": active, "total_users": total_members}

def is_invite_valid(invite: Invite_model):
    return datetime.utcnow() - invite.created_at < timedelta(hours=24) and invite.use_count < 10

async def check_invites():
    while True:
        await asyncio.sleep(1800)
        database = SessionLocal()
        all_invites = database.query(Invite_model).all()

        for invite in all_invites:
            if is_invite_valid(invite) == False:
                database.delete(invite)
        database.commit()
        database.close()

@app.on_event("startup")
async def interval_tasks():
    asyncio.create_task(check_invites())

async def heartbeat(socket):
    while True:
        await(asyncio.sleep(45))
        await socket.send_json({"type": "ping"})

@app.get("/whoami")
def self_identity(current_user: UserInfo = Depends(get_current_user)):
    return {"username": current_user.username, "id": current_user.id}

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


    except WebSocketDisconnect:
        del active_connections[current_user.id]
        heartbeat_task.cancel()