from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from app.models import UserInfo, Message, Block_user, Conversations
from app.privacy import can_send_dm
from app.schemas import Message_schema
from app.database import get_db
from app.auth import get_current_user
from app.r2 import attachment_public, require_message_body, store_attachment
from app.routers.deletion import deletion_fields, refresh_pending_messages
from app.routers.reactions import reactions_for_messages
from app.routers.mentions import accepted_reply_parent, reply_map_for
from app.routers.profile import avatar_lookup, public_avatar
from app.site_moderation import mask_message_payloads, permaban_by_user_id
from datetime import datetime

router = APIRouter()

@router.post("/messages")
def send_message(message: Message_schema, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    is_blocked = database.query(Block_user).filter(Block_user.initiated_by == current_user.id, Block_user.blocked_user == message.receiver_id).first()
    blocked_mirrored = database.query(Block_user).filter(Block_user.initiated_by == message.receiver_id, Block_user.blocked_user == current_user.id).first()

    if is_blocked or blocked_mirrored:
        raise HTTPException(status_code= 400, detail= "User is blocked.")

    recipient = database.query(UserInfo).filter(UserInfo.id == message.receiver_id).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="User not found.")
    if not can_send_dm(database, current_user.id, recipient):
        raise HTTPException(status_code=403, detail="This user does not accept Direct Messages from you.")

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
    parent = None
    if message.reply_to_id:
        candidate = database.query(Message).filter(Message.id == message.reply_to_id).first()
        if accepted_reply_parent(candidate):
            pair = {candidate.sender_id, candidate.receiver_id}
            if current_user.id in pair and message.receiver_id in pair:
                parent = candidate
    new_message = Message(sender_id = current_user.id, 
    receiver_id = message.receiver_id,
    content = message.content,
    attachment = attachment_json,
    read = False,
    reply_to_id = parent.id if parent else None,
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
    banned = permaban_by_user_id(database, user_id)
    if not target_user and not banned:
        raise HTTPException(status_code= 404,  detail="No user found")
    for msg in History:
        if msg.receiver_id == current_user.id:
            msg.read = True

    database.commit()
    refresh_pending_messages(database, History)
    History.reverse()
    reaction_map = reactions_for_messages(database, "dm", [msg.id for msg in History], current_user.id)
    reply_map = reply_map_for(database, Message, History)
    sender_ids = list({msg.sender_id for msg in History if msg.sender_id})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(sender_ids)).all() if sender_ids else []
    faces = avatar_lookup(accounts)
    messages_out = []
    for msg in History:
        fields = deletion_fields(msg, attachment_public(msg.attachment))
        messages_out.append({
            "id": msg.id,
            "sender_id": msg.sender_id,
            "receiver_id": msg.receiver_id,
            "content": fields["content"],
            "attachment": fields["attachment"],
            "timestamp": msg.timestamp,
            "read": msg.read,
            "deletion_state": fields["deletion_state"],
            "deletion_requested_at": fields["deletion_requested_at"],
            "edited": fields["edited"],
            "reactions": reaction_map.get(msg.id, []),
            "reply_to": reply_map.get(msg.reply_to_id) if msg.reply_to_id else None,
            "avatar": faces.get(msg.sender_id),
        })
    mask_message_payloads(database, messages_out)
    return {
        "other_username": target_user.username if target_user else "",
        "session_username": current_user.username,
        "other_avatar": public_avatar(target_user) if target_user else None,
        "permaban": bool(banned and not target_user),
        "messages": messages_out,
    }

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
        conversations_out.append({
            "type": "dm",
            "id": other_id,
            "username": other_account.username if other_account else "",
            "unread_count": message_status,
            "last_message_at": str(convo.last_message_at),
            "avatar": public_avatar(other_account) if other_account else None,
            "permaban": not bool(other_account),
        })

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

