from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Channel_messages, Parties, Party_members, Party_messages, Invite_model
from app.schemas import Invite
from app.database import get_db, SessionLocal
from app.auth import get_current_user, get_optional_user
from app.routers.realtime import active_connections, serialize_member, server_broadcast, party_broadcast
from app.routers.roles import effective_perms_for_user, require_server_member, require_server_perm
from app.routers.moderation import active_ban, iso_dt
from app.routers.deletion import write_audit_log
from app.routers.account import public_display_name
from app.routers.profile import public_avatar
from datetime import datetime, timedelta
import asyncio
import random

router = APIRouter()

INVITE_TTL = timedelta(hours=24)
INVITE_MAX_USES = 10


def invite_created_at(invite):
    value = getattr(invite, "created_at", None)
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if getattr(value, "tzinfo", None):
        value = value.replace(tzinfo=None)
    return value

def is_invite_fresh(invite):
    created = invite_created_at(invite)
    if created is None:
        return False
    return datetime.utcnow() - created < INVITE_TTL

def is_invite_valid(invite: Invite_model):
    uses = invite.use_count if invite.use_count is not None else 0
    return is_invite_fresh(invite) and uses < INVITE_MAX_USES

def invite_expires_at(invite):
    created = invite_created_at(invite)
    if created is None:
        return None
    return created + INVITE_TTL


def can_open_server_invites(database, server, user_id):
    if server.owner_id == user_id:
        return True
    perms = effective_perms_for_user(database, server, user_id)
    return bool(perms.get("invite_members") or perms.get("update_server"))


def require_server_invites(database, server, user_id):
    if not can_open_server_invites(database, server, user_id):
        raise HTTPException(status_code=403, detail="You do not have permission to manage invites.")
    return True


def serialize_settings_invite(database, invite):
    creator = database.query(UserInfo).filter(UserInfo.id == invite.creator_id).first()
    expires = invite_expires_at(invite)
    payload = {
        "id": invite.id,
        "code": invite.code,
        "uses": invite.use_count if invite.use_count is not None else 0,
        "max_uses": INVITE_MAX_USES,
        "created_at": iso_dt(invite_created_at(invite)),
        "expires_at": iso_dt(expires) if expires else None,
        "channel_name": None,
        "roles": [],
        "creator": None,
    }
    if creator:
        payload["creator"] = {
            "id": creator.id,
            "username": creator.username,
            "display_name": public_display_name(creator),
            "avatar": public_avatar(creator),
        }
    return payload


@router.get("/server_settings_invites/{server_id}")
def server_settings_invites(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, server_id, current_user.id)
    require_server_invites(database, server, current_user.id)
    rows = database.query(Invite_model).filter(
        Invite_model.server_id == server_id,
        Invite_model.type == "server",
    ).order_by(Invite_model.created_at.desc()).all()
    invites = [serialize_settings_invite(database, row) for row in rows if is_invite_valid(row)]
    return {"server_id": server_id, "invites": invites}


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
async def accept_invite(code: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    invite = database.query(Invite_model).filter(Invite_model.code == code).first()
    if not invite or not is_invite_valid(invite):
        raise HTTPException(status_code=404, detail= "Invite not found")

    if invite.type == "server":
        if active_ban(database, invite.server_id, current_user.id):
            raise HTTPException(status_code=404, detail="Invite not found")
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

        from app.routers.roles import assign_members_role, hoist_role_for_user, name_color_role_for_user
        assign_members_role(database, invite.server_id, current_user.id)

        category = database.query(Server_categories).filter(Server_categories.server_id == invite.server_id).order_by(Server_categories.position).first()
        channel = database.query(Server_channels).filter(Server_channels.category_id == category.id).order_by(Server_channels.position).first()
        
        join_message = Channel_messages(
            sender_id = None,
            channel_id = channel.id,
            content = f"{current_user.username} has joined the server"
        )
        database.add(join_message)
        write_audit_log(database, invite.server_id, current_user.id, "member_joined", "member", current_user.id, {
            "username": current_user.username,
            "invite_code": invite.code,
        })
        database.commit()
        await server_broadcast(server_id= invite.server_id, payload= {
            "type": "member_joined",
            "scope": "server",
            "scope_id": invite.server_id,
            "member": serialize_member(
                current_user,
                current_user.id == server.owner_id,
                hoist_role_for_user(database, invite.server_id, current_user.id),
                name_color_role_for_user(database, invite.server_id, current_user.id),
            )
        }, database= database, exclude_user_id= current_user.id)
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
        await party_broadcast(party_id= invite.party_id, payload= {
            "type": "member_joined",
            "scope": "party",
            "scope_id": invite.party_id,
            "member": serialize_member(current_user, current_user.id == party.created_by_id)
        }, database= database, exclude_user_id= current_user.id)
        return {"type": "party", "id": invite.party_id, "party_name": party.party_name}
        
@router.post("/create_invite")
def create_invite(type: Invite, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    if type.type == "server":
        server = require_server_member(database, type.server_id, current_user.id)
        require_server_perm(database, server, current_user.id, "invite_members", "You do not have permission to invite members.")

        previous_invite = database.query(Invite_model).filter(Invite_model.server_id == type.server_id, Invite_model.creator_id == current_user.id).first()

        if previous_invite:
            if is_invite_fresh(previous_invite):
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
            if is_invite_fresh(previous_invite):
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
    if type.type == "server" and type.server_id:
        write_audit_log(database, type.server_id, current_user.id, "create_invite", "invite", 0, {
            "code": new_code,
        })
    database.commit()
    return {"invite_code": new_code}

@router.get("/invite/{code}")
def get_invite_info(code: str, database: Session = Depends(get_db), current_user: UserInfo | None = Depends(get_optional_user)):
    invite = database.query(Invite_model).filter(Invite_model.code == code).first()
    if not invite or not is_invite_valid(invite):
        return {"valid": False}
    if invite.type == "server" and current_user and active_ban(database, invite.server_id, current_user.id):
        return {"valid": False}

    if invite.type == "party":
        party_info= database.query(Parties).filter(Parties.id == invite.party_id).first()
        if not party_info:
            return {"valid": False}
        all_members = database.query(Party_members).filter(Party_members.party_id == invite.party_id).count()
        return {"valid": True, "type": "party","party_name": party_info.party_name, "full": True if all_members >= 10 else  False}
    elif invite.type == "server":
        server_info = database.query(Servers).filter(Servers.id == invite.server_id).first()
        if not server_info:
            return {"valid": False}
        total_members = database.query(Server_members).filter(Server_members.server_id == invite.server_id).count()
        all_members = database.query(Server_members).filter(Server_members.server_id == invite.server_id).all()
        active = sum(1 for member in all_members if member.user_id in active_connections)
        return {"valid": True, "type": "server", "server_name": server_info.name, "active_users": active, "total_users": total_members}
    return {"valid": False}
