from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from app.models import UserInfo, Message, Block_user, Friend_request, Conversations
from app.schemas import Message_schema
from app.database import get_db
from app.auth import get_current_user
from app.r2 import attachment_public, require_message_body, store_attachment
from datetime import datetime

router = APIRouter()

@router.post("/messages")
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

    require_message_body(message.content, message.attachment)
    attachment_json = store_attachment(message.attachment, current_user)

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
    attachment = attachment_json,
    read = False,
    )
    database.add(new_message)
    database.commit()
    database.refresh(new_message)

    return new_message

@router.get("/messages/{user_id}")
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
    messages_out = []
    for msg in History:
        messages_out.append({
            "id": msg.id,
            "sender_id": msg.sender_id,
            "receiver_id": msg.receiver_id,
            "content": msg.content,
            "attachment": attachment_public(msg.attachment),
            "timestamp": msg.timestamp,
            "read": msg.read,
        })
    return {"other_username": target_user.username, "session_username": current_user.username , "messages": messages_out}

@router.get("/conversation_history")
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

@router.post("/conversation/{other_user_id}/close")
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

