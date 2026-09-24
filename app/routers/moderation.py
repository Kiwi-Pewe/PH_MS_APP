from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Server_role_members, Server_roles, Channel_messages, Server_bans
from app.schemas import Server_moderation_in, Server_bulk_kick_in
from app.database import get_db
from app.auth import get_current_user
from app.routers.deletion import write_audit_log
from app.routers.realtime import notify_user, server_broadcast
from app.routers.roles import can_moderate_target, require_server_member, require_server_perm

router = APIRouter()

REASON_MAX = 200
TIMEOUT_SECONDS = (60, 300, 600, 3600, 86400, 604800)
KICK_TEMP_SECONDS = (0, 3600, 86400, 604800)
TIMEOUT_DETAIL = "You do not have permission to send messages in this channel."


def parse_dt(value):
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


def iso_dt(value):
    parsed = parse_dt(value)
    if not parsed:
        return None
    return parsed.strftime("%Y-%m-%dT%H:%M:%S")


def clean_reason(value):
    return (value or "").strip()[:REASON_MAX]


def timeout_until_for(membership):
    until = parse_dt(getattr(membership, "timeout_until", None) if membership else None)
    if until and until > datetime.utcnow():
        return until
    return None


def require_not_timed_out(membership, detail=TIMEOUT_DETAIL):
    if timeout_until_for(membership):
        raise HTTPException(status_code=403, detail=detail)
    return membership


def active_ban(database, server_id, user_id):
    row = database.query(Server_bans).filter(Server_bans.server_id == server_id, Server_bans.user_id == user_id).first()
    if not row:
        return None
    expires = parse_dt(row.expires_at)
    if expires and expires <= datetime.utcnow():
        database.delete(row)
        database.commit()
        return None
    return row


def require_moderate_member(database, server, actor_id, target_id, perm, detail):
    require_server_perm(database, server, actor_id, perm, detail)
    target = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Server membership not found")
    if not can_moderate_target(database, server, actor_id, target_id):
        raise HTTPException(status_code=403, detail="You can only moderate members below your highest role.")
    return target


def strip_member_roles(database, server_id, user_id):
    role_ids = [row.id for row in database.query(Server_roles).filter(Server_roles.server_id == server_id).all()]
    if not role_ids:
        return
    database.query(Server_role_members).filter(
        Server_role_members.user_id == user_id,
        Server_role_members.role_id.in_(role_ids),
    ).delete(synchronize_session=False)


def add_system_message(database, server_id, text):
    category = database.query(Server_categories).filter(Server_categories.server_id == server_id).order_by(Server_categories.position).first()
    if not category:
        return
    channel = database.query(Server_channels).filter(Server_channels.category_id == category.id).order_by(Server_channels.position).first()
    if not channel:
        return
    database.add(Channel_messages(sender_id=None, channel_id=channel.id, content=text))


def upsert_ban(database, server_id, user_id, actor_id, reason, expires_at):
    row = database.query(Server_bans).filter(Server_bans.server_id == server_id, Server_bans.user_id == user_id).first()
    if row:
        row.actor_id = actor_id
        row.reason = reason
        row.expires_at = expires_at
        return row
    row = Server_bans(
        server_id=server_id,
        user_id=user_id,
        actor_id=actor_id,
        reason=reason,
        expires_at=expires_at,
    )
    database.add(row)
    return row


async def remove_member(database, server, target_user, membership, actor, action, reason, expires_at=None):
    strip_member_roles(database, server.id, target_user.id)
    database.delete(membership)
    if action == "kick" and expires_at:
        upsert_ban(database, server.id, target_user.id, actor.id, reason, expires_at)
    elif action == "ban":
        upsert_ban(database, server.id, target_user.id, actor.id, reason, None)
    verb = "was kicked from the server" if action == "kick" else "was banned from the server"
    add_system_message(database, server.id, f"{target_user.username} {verb}")
    write_audit_log(database, server.id, actor.id, action + "_member", "member", target_user.id, {
        "username": target_user.username,
        "reason": reason,
        "duration_seconds": int((expires_at - datetime.utcnow()).total_seconds()) if expires_at else None,
    })
    database.commit()
    await notify_user(target_user.id, {
        "type": "removed_from_server",
        "server_id": server.id,
        "server_name": server.name,
        "reason": action,
        "detail": reason,
        "until": iso_dt(expires_at),
    })
    await server_broadcast(server_id=server.id, payload={
        "type": "member_left",
        "scope": "server",
        "scope_id": server.id,
        "user_id": target_user.id,
    }, database=database, exclude_user_id=actor.id)
    return {"ok": True, "user_id": target_user.id}


@router.post("/kick_server_member")
async def kick_server_member(body: Server_moderation_in, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    membership = require_moderate_member(database, server, current_user.id, body.user_id, "kick_members", "You do not have permission to kick members.")
    if body.seconds not in KICK_TEMP_SECONDS:
        raise HTTPException(status_code=400, detail="Pick a valid wait time.")
    target = database.query(UserInfo).filter(UserInfo.id == body.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    expires = datetime.utcnow() + timedelta(seconds=body.seconds) if body.seconds else None
    return await remove_member(database, server, target, membership, current_user, "kick", clean_reason(body.reason), expires)


@router.post("/ban_server_member")
async def ban_server_member(body: Server_moderation_in, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    membership = require_moderate_member(database, server, current_user.id, body.user_id, "ban_members", "You do not have permission to ban members.")
    target = database.query(UserInfo).filter(UserInfo.id == body.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    return await remove_member(database, server, target, membership, current_user, "ban", clean_reason(body.reason), None)


@router.post("/timeout_server_member")
async def timeout_server_member(body: Server_moderation_in, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    membership = require_moderate_member(database, server, current_user.id, body.user_id, "timeout_members", "You do not have permission to timeout members.")
    target = database.query(UserInfo).filter(UserInfo.id == body.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    reason = clean_reason(body.reason)
    if body.seconds == 0:
        membership.timeout_until = None
        membership.timeout_reason = None
        action = "timeout_clear"
        until = None
    else:
        if body.seconds not in TIMEOUT_SECONDS:
            raise HTTPException(status_code=400, detail="Pick a valid timeout length.")
        until = datetime.utcnow() + timedelta(seconds=body.seconds)
        membership.timeout_until = until
        membership.timeout_reason = reason
        action = "timeout_member"
    write_audit_log(database, server.id, current_user.id, action, "member", target.id, {
        "username": target.username,
        "reason": reason,
        "duration_seconds": body.seconds or None,
    })
    database.commit()
    payload = {
        "type": "member_timeout",
        "server_id": server.id,
        "user_id": target.id,
        "timeout_until": iso_dt(until) if body.seconds else None,
        "timeout_reason": reason if body.seconds else "",
    }
    await server_broadcast(server_id=server.id, payload=payload, database=database, exclude_user_id=current_user.id)
    await notify_user(target.id, payload)
    return {"ok": True, **payload}


@router.post("/bulk_kick_server_members")
async def bulk_kick_server_members(body: Server_bulk_kick_in, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    require_server_perm(database, server, current_user.id, "kick_members", "You do not have permission to kick members.")
    if body.seconds not in KICK_TEMP_SECONDS:
        raise HTTPException(status_code=400, detail="Pick a valid wait time.")
    ids = []
    seen = set()
    for uid in body.user_ids or []:
        try:
            uid = int(uid)
        except (TypeError, ValueError):
            continue
        if uid in seen:
            continue
        seen.add(uid)
        ids.append(uid)
    if not ids:
        raise HTTPException(status_code=400, detail="Select at least one member.")
    if len(ids) > 50:
        raise HTTPException(status_code=400, detail="Kick at most 50 members at a time.")
    reason = clean_reason(body.reason)
    kicked = []
    for uid in ids:
        membership = database.query(Server_members).filter(
            Server_members.server_id == server.id,
            Server_members.user_id == uid,
        ).first()
        if not membership:
            continue
        if not can_moderate_target(database, server, current_user.id, uid):
            continue
        target = database.query(UserInfo).filter(UserInfo.id == uid).first()
        if not target:
            continue
        expires = datetime.utcnow() + timedelta(seconds=body.seconds) if body.seconds else None
        await remove_member(database, server, target, membership, current_user, "kick", reason, expires)
        kicked.append(uid)
    return {"ok": True, "kicked": kicked, "count": len(kicked)}
