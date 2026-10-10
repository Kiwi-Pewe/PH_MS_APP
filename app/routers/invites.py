from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Server_roles, Server_role_members, Channel_messages, Parties, Party_members, Party_messages, Invite_model, Audit_log
from app.schemas import Invite
from app.database import get_db, SessionLocal
from app.auth import get_current_user, get_optional_user
from app.routers.realtime import active_connections, serialize_member, server_broadcast, party_broadcast
from app.routers.roles import channel_type_visible, effective_perms_for_user, effective_perms_for_user_in_channel, require_server_member, require_server_perm
from app.routers.moderation import active_ban, iso_dt
from app.routers.deletion import write_audit_log
from app.routers.account import public_display_name
from app.routers.profile import public_avatar
from datetime import datetime, timedelta
import asyncio
import json
import random

router = APIRouter()

INVITE_TTL = timedelta(hours=24)
INVITE_MAX_USES = 10
INVITE_AGE_CHOICES = (1800, 3600, 21600, 43200, 86400, 604800, 2592000, 0)
INVITE_USE_CHOICES = (1, 5, 10, 25, 50, 100, 0)
DEFAULT_MAX_AGE = 2592000
DEFAULT_MAX_USES = 0


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

def is_invite_fresh(invite, max_age=None):
    if max_age == 0:
        return True
    created = invite_created_at(invite)
    if created is None:
        return False
    window = INVITE_TTL if max_age is None else timedelta(seconds=int(max_age))
    return datetime.utcnow() - created < window


def legacy_invite_limits():
    return {
        "max_age": int(INVITE_TTL.total_seconds()),
        "max_uses": INVITE_MAX_USES,
        "role_ids": [],
        "temporary": False,
    }


def clean_max_age(value):
    try:
        value = int(value)
    except (TypeError, ValueError):
        return DEFAULT_MAX_AGE
    if value not in INVITE_AGE_CHOICES:
        return DEFAULT_MAX_AGE
    return value


def clean_max_uses(value):
    try:
        value = int(value)
    except (TypeError, ValueError):
        return DEFAULT_MAX_USES
    if value not in INVITE_USE_CHOICES:
        return DEFAULT_MAX_USES
    return value


def invite_saved_settings(database, invite):
    if not database or getattr(invite, "type", None) != "server" or not invite.server_id or not invite.code:
        return None
    row = database.query(Audit_log).filter(
        Audit_log.server_id == invite.server_id,
        Audit_log.action == "create_invite",
        Audit_log.detail.like('%"code": "' + invite.code + '"%'),
    ).order_by(Audit_log.id.desc()).first()
    if not row or not row.detail:
        return None
    try:
        detail = json.loads(row.detail)
    except (TypeError, ValueError):
        return None
    if not isinstance(detail, dict) or detail.get("code") != invite.code:
        return None
    if "max_age" not in detail and "max_uses" not in detail:
        return None
    role_ids = []
    for raw in detail.get("role_ids") or []:
        try:
            role_ids.append(int(raw))
        except (TypeError, ValueError):
            continue
    return {
        "max_age": clean_max_age(detail.get("max_age")),
        "max_uses": clean_max_uses(detail.get("max_uses")),
        "role_ids": role_ids,
        "temporary": bool(detail.get("temporary")),
    }


def invite_limits(database, invite):
    saved = invite_saved_settings(database, invite)
    return saved if saved else legacy_invite_limits()


def is_invite_valid(invite: Invite_model, database=None):
    limits = invite_limits(database, invite)
    uses = invite.use_count if invite.use_count is not None else 0
    if limits["max_uses"] and uses >= limits["max_uses"]:
        return False
    return is_invite_fresh(invite, limits["max_age"])


def invite_expires_at(invite, max_age=None):
    if max_age == 0:
        return None
    created = invite_created_at(invite)
    if created is None:
        return None
    window = INVITE_TTL if max_age is None else timedelta(seconds=int(max_age))
    return created + window


def can_open_server_invites(database, server, user_id):
    if server.owner_id == user_id:
        return True
    perms = effective_perms_for_user(database, server, user_id)
    return bool(perms.get("invite_members") or perms.get("update_server"))


def require_server_invites(database, server, user_id):
    if not can_open_server_invites(database, server, user_id):
        raise HTTPException(status_code=403, detail="You do not have permission to manage invites.")
    return True


def invite_channel_for(database, invite, user_id):
    channel_id = getattr(invite, "channel_id", None)
    if not channel_id or invite.type != "server":
        return None
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel:
        return None
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    if not category or category.server_id != invite.server_id:
        return None
    server = database.query(Servers).filter(Servers.id == invite.server_id).first()
    if not server:
        return None
    perms = effective_perms_for_user_in_channel(database, server, user_id, channel.id)
    if not channel_type_visible(perms, channel.channel_type):
        return None
    return channel


def serialize_settings_invite(database, invite):
    creator = database.query(UserInfo).filter(UserInfo.id == invite.creator_id).first()
    limits = invite_limits(database, invite)
    expires = invite_expires_at(invite, limits["max_age"])
    channel = None
    if getattr(invite, "channel_id", None):
        channel = database.query(Server_channels).filter(Server_channels.id == invite.channel_id).first()
    roles = []
    if limits["role_ids"]:
        rows = database.query(Server_roles).filter(
            Server_roles.server_id == invite.server_id,
            Server_roles.id.in_(limits["role_ids"]),
        ).all()
        roles = [{"id": row.id, "name": row.name or "Role", "color": row.color or ""} for row in rows]
    payload = {
        "id": invite.id,
        "code": invite.code,
        "uses": invite.use_count if invite.use_count is not None else 0,
        "max_uses": limits["max_uses"],
        "max_age": limits["max_age"],
        "temporary": limits["temporary"],
        "created_at": iso_dt(invite_created_at(invite)),
        "expires_at": iso_dt(expires) if expires else None,
        "channel_id": invite.channel_id if channel else None,
        "channel_name": channel.name if channel else None,
        "roles": roles,
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
    invites = [serialize_settings_invite(database, row) for row in rows if is_invite_valid(row, database)]
    return {"server_id": server_id, "invites": invites}


async def check_invites():
    while True:
        await asyncio.sleep(1800)
        database = SessionLocal()
        all_invites = database.query(Invite_model).all()

        for invite in all_invites:
            if is_invite_valid(invite, database) == False:
                database.delete(invite)
        database.commit()
        database.close()


@router.post("/accept_invite")
async def accept_invite(code: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    invite = database.query(Invite_model).filter(Invite_model.code == code).first()
    if not invite or not is_invite_valid(invite, database):
        raise HTTPException(status_code=404, detail= "Invite not found")

    if invite.type == "server":
        if active_ban(database, invite.server_id, current_user.id):
            raise HTTPException(status_code=404, detail="Invite not found")
        server = database.query(Servers).filter(Servers.id == invite.server_id).first()
        is_member = database.query(Server_members).filter(Server_members.server_id == invite.server_id, Server_members.user_id == current_user.id).first()
        if is_member:
            landing = invite_channel_for(database, invite, current_user.id)
            payload = {"type": "server", "id": invite.server_id, "server_name": server.name, "position": is_member.position}
            if landing:
                payload["channel_id"] = landing.id
                payload["channel_name"] = landing.name
            return payload
        
        highest_position = database.query(func.max(Server_members.position)).filter(Server_members.user_id == current_user.id).scalar()
        new_member = Server_members(
            server_id = invite.server_id,
            user_id = current_user.id,
            position = 100 if highest_position == None else highest_position + 100,
        )
        database.add(new_member)

        from app.routers.roles import assign_members_role, hoist_role_for_user, name_color_role_for_user
        assign_members_role(database, invite.server_id, current_user.id)
        limits = invite_limits(database, invite)
        for role_id in limits["role_ids"]:
            role = database.query(Server_roles).filter(
                Server_roles.id == role_id,
                Server_roles.server_id == invite.server_id,
                Server_roles.is_members == False,
            ).first()
            if not role:
                continue
            already = database.query(Server_role_members).filter(
                Server_role_members.role_id == role.id,
                Server_role_members.user_id == current_user.id,
            ).first()
            if not already:
                database.add(Server_role_members(role_id=role.id, user_id=current_user.id))
        invite.use_count = (invite.use_count or 0) + 1

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
        landing = invite_channel_for(database, invite, current_user.id)
        payload = {"type": "server", "id": invite.server_id, "server_name": server.name, "position": new_member.position}
        if landing:
            payload["channel_id"] = landing.id
            payload["channel_name"] = landing.name
        return payload

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
        
def clean_invite_role_ids(database, server, actor_id, role_ids):
    if not server:
        return []
    from app.routers.roles import actor_highest_role, can_manage_target_role
    is_owner = server.owner_id == actor_id
    if not is_owner:
        perms = effective_perms_for_user(database, server, actor_id)
        if not perms.get("manage_roles"):
            return []
    actor_highest = None if is_owner else actor_highest_role(database, server, actor_id)
    kept = []
    for raw in role_ids or []:
        try:
            role_id = int(raw)
        except (TypeError, ValueError):
            continue
        if role_id in kept:
            continue
        role = database.query(Server_roles).filter(
            Server_roles.id == role_id,
            Server_roles.server_id == server.id,
            Server_roles.is_members == False,
        ).first()
        if not role or not can_manage_target_role(is_owner, actor_highest, role):
            continue
        kept.append(role_id)
    return kept


@router.post("/create_invite")
def create_invite(type: Invite, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    if type.type == "server":
        server = require_server_member(database, type.server_id, current_user.id)
        require_server_perm(database, server, current_user.id, "invite_members", "You do not have permission to invite members.")

        if type.channel_id:
            channel = database.query(Server_channels).filter(Server_channels.id == type.channel_id).first()
            if not channel:
                raise HTTPException(status_code=404, detail="Channel not found")
            category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
            if not category or category.server_id != server.id:
                raise HTTPException(status_code=400, detail="That channel is not in this server.")
            channel_perms = effective_perms_for_user_in_channel(database, server, current_user.id, channel.id)
            if not channel_type_visible(channel_perms, channel.channel_type):
                raise HTTPException(status_code=403, detail="You do not have permission to invite into this channel.")

        previous_invite = database.query(Invite_model).filter(
            Invite_model.server_id == type.server_id,
            Invite_model.creator_id == current_user.id,
            Invite_model.channel_id == type.channel_id,
        ).first()

        if previous_invite and not type.replace and is_invite_valid(previous_invite, database):
            limits = invite_limits(database, previous_invite)
            return {
                "invite_code": previous_invite.code,
                "max_age": limits["max_age"],
                "max_uses": limits["max_uses"],
                "role_ids": limits["role_ids"],
                "temporary": limits["temporary"],
                "uses": previous_invite.use_count or 0,
            }
        if previous_invite:
            database.delete(previous_invite)
            database.commit()
    elif type.type == "party":
        is_member = database.query(Party_members).filter(Party_members.party_id == type.party_id, Party_members.user_id == current_user.id).first()

        if not is_member:
            raise HTTPException(status_code=404, detail="Party membership not found")

        previous_invite = database.query(Invite_model).filter(Invite_model.party_id == type.party_id, Invite_model.creator_id == current_user.id).first()

        if previous_invite and not type.replace and is_invite_fresh(previous_invite):
            legacy = legacy_invite_limits()
            return {
                "invite_code": previous_invite.code,
                "max_age": legacy["max_age"],
                "max_uses": legacy["max_uses"],
                "role_ids": [],
                "temporary": False,
                "uses": previous_invite.use_count or 0,
            }
        if previous_invite:
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
        channel_id = type.channel_id if type.type == "server" else None,
        party_id = type.party_id,
    )

    database.add(invite_card)
    limits = legacy_invite_limits()
    if type.type == "server" and type.server_id:
        server = database.query(Servers).filter(Servers.id == type.server_id).first()
        limits = {
            "max_age": clean_max_age(DEFAULT_MAX_AGE if type.max_age is None else type.max_age),
            "max_uses": clean_max_uses(DEFAULT_MAX_USES if type.max_uses is None else type.max_uses),
            "role_ids": clean_invite_role_ids(database, server, current_user.id, type.role_ids),
            "temporary": bool(type.temporary),
        }
        write_audit_log(database, type.server_id, current_user.id, "create_invite", "invite", 0, {
            "code": new_code,
            "max_age": limits["max_age"],
            "max_uses": limits["max_uses"],
            "role_ids": limits["role_ids"],
            "temporary": limits["temporary"],
        })
    database.commit()
    return {
        "invite_code": new_code,
        "max_age": limits["max_age"],
        "max_uses": limits["max_uses"],
        "role_ids": limits["role_ids"],
        "temporary": limits["temporary"],
        "uses": 0,
    }

@router.get("/invite/{code}")
def get_invite_info(code: str, database: Session = Depends(get_db), current_user: UserInfo | None = Depends(get_optional_user)):
    invite = database.query(Invite_model).filter(Invite_model.code == code).first()
    if not invite or not is_invite_valid(invite, database):
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
        landing = invite_channel_for(database, invite, current_user.id) if current_user else None
        if landing is None and getattr(invite, "channel_id", None) and not current_user:
            named = database.query(Server_channels).filter(Server_channels.id == invite.channel_id).first()
            channel_name = named.name if named else None
            channel_id = named.id if named else None
        else:
            channel_name = landing.name if landing else None
            channel_id = landing.id if landing else None
        return {
            "valid": True,
            "type": "server",
            "server_name": server_info.name,
            "active_users": active,
            "total_users": total_members,
            "channel_id": channel_id,
            "channel_name": channel_name,
        }
    return {"valid": False}


async def release_temporary_members(user_id):
    await asyncio.sleep(20)
    from app.routers.realtime import active_connections
    if active_connections.get(user_id):
        return
    database = SessionLocal()
    try:
        memberships = database.query(Server_members).filter(Server_members.user_id == user_id).all()
        for membership in list(memberships):
            server = database.query(Servers).filter(Servers.id == membership.server_id).first()
            if not server or server.owner_id == user_id:
                continue
            joined = database.query(Audit_log).filter(
                Audit_log.server_id == server.id,
                Audit_log.action == "member_joined",
                Audit_log.target_id == user_id,
            ).order_by(Audit_log.id.desc()).first()
            if not joined or not joined.detail:
                continue
            try:
                detail = json.loads(joined.detail)
            except (TypeError, ValueError):
                continue
            code = detail.get("invite_code") if isinstance(detail, dict) else None
            if not code:
                continue
            probe = Invite_model(code=code, type="server", server_id=server.id)
            limits = invite_saved_settings(database, probe)
            if not limits or not limits.get("temporary"):
                continue
            extra = database.query(Server_role_members).join(
                Server_roles, Server_roles.id == Server_role_members.role_id
            ).filter(
                Server_role_members.user_id == user_id,
                Server_roles.server_id == server.id,
                Server_roles.is_members == False,
            ).first()
            if extra:
                continue
            actor = database.query(UserInfo).filter(UserInfo.id == server.owner_id).first()
            target = database.query(UserInfo).filter(UserInfo.id == user_id).first()
            fresh = database.query(Server_members).filter(Server_members.id == membership.id).first()
            if not actor or not target or not fresh:
                continue
            from app.routers.moderation import remove_member
            await remove_member(database, server, target, fresh, actor, "kick", "Temporary membership ended", None, None)
    finally:
        database.close()
