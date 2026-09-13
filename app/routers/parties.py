from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import UserInfo, Parties, Party_messages, Party_members
from app.schemas import Party_create, Party_message_schema
from app.database import get_db
from app.auth import get_current_user
from app.r2 import attachment_public, require_message_body, store_attachment
from datetime import datetime
import random

router = APIRouter()

@router.post("/create_party")
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

@router.get("/get_parties")
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
    
@router.post("/send_party_message")
def message_party(party_msg: Party_message_schema, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    in_Party = database.query(Party_members).filter(Party_members.user_id == current_user.id, Party_members.party_id == party_msg.party_id).first()

    if not in_Party:
        raise HTTPException(status_code=404, detail="Party not found.")

    require_message_body(party_msg.content, party_msg.attachment)
    new_party_msg = Party_messages(
        party_id=party_msg.party_id,
        sender_id=current_user.id,
        content=party_msg.content,
        attachment=store_attachment(party_msg.attachment, current_user),
    )
    database.add(new_party_msg)

    database.query(Party_members).filter(Party_members.party_id == party_msg.party_id, Party_members.user_id == current_user.id).update(
        {"last_activity": datetime.utcnow()}
    )
    database.commit()
    database.refresh(new_party_msg)

    return new_party_msg

@router.get("/get_party_messages/{party_id}")
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
            "attachment": attachment_public(message.attachment),
            "timestamp": str(message.timestamp)
        })

    message_history.reverse()
    return {"party_name": party_info.party_name, "party_id": party_id, "session_username": current_user.username, "messages": message_history}

@router.post("/leave_party")
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
