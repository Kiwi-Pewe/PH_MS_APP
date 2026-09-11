from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Channel_messages, Parties, Party_members, Party_messages, Invite_model
from app.schemas import Invite
from app.database import get_db, SessionLocal
from app.auth import get_current_user
from app.routers.realtime import active_connections
from datetime import datetime, timedelta
import asyncio
import random

router = APIRouter()

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

@router.post("/accept_invite")
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
        
@router.post("/create_invite")
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

@router.get("/invite/{code}")
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
