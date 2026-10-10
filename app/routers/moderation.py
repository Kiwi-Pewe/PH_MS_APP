from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, or_
from datetime import datetime, timedelta
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Server_role_members, Server_roles, Channel_messages, Server_bans, Announcement_post, Announcement_comment, Forum_post, Forum_messages, Media_item, Audit_log
from app.schemas import Server_moderation_in, Server_bulk_kick_in, Server_unban_in
from app.database import get_db
from app.auth import get_current_user
from app.routers.deletion import write_audit_log
from app.routers.realtime import notify_user, server_broadcast
from app.routers.roles import LIVE_ROLE_PERMS, can_moderate_target, effective_perms_for_user, require_server_member, require_server_perm, require_server_roster
from app.routers.account import public_display_name
from app.routers.profile import public_avatar
from app.routers.feed import notify_feed_alert

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


async def remove_member(database, server, target_user, membership, actor, action, reason, expires_at=None, duration_seconds=None):
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
        "duration_seconds": duration_seconds if duration_seconds is not None else (
            int((expires_at - datetime.utcnow()).total_seconds()) if expires_at else None
        ),
    })
    database.commit()
    await notify_feed_alert(
        database,
        receiver_id=target_user.id,
        alert_type=action,
        sender_id=actor.id,
        alert_family="moderation",
        server_id=server.id,
        reason=reason,
        duration_seconds=duration_seconds if duration_seconds is not None else (
            body_seconds_from_expires(expires_at) if expires_at else None
        ),
    )
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


def body_seconds_from_expires(expires_at):
    if not expires_at:
        return None
    secs = int((expires_at - datetime.utcnow()).total_seconds())
    return secs if secs > 0 else None


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
    return await remove_member(
        database, server, target, membership, current_user, "kick", clean_reason(body.reason),
        expires, duration_seconds=body.seconds or None,
    )


@router.post("/ban_server_member")
async def ban_server_member(body: Server_moderation_in, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    membership = require_moderate_member(database, server, current_user.id, body.user_id, "ban_members", "You do not have permission to ban members.")
    target = database.query(UserInfo).filter(UserInfo.id == body.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    return await remove_member(database, server, target, membership, current_user, "ban", clean_reason(body.reason), None, duration_seconds=None)


@router.post("/unban_server_member")
def unban_server_member(body: Server_unban_in, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    require_server_bans(database, server, current_user.id)
    row = database.query(Server_bans).filter(
        Server_bans.server_id == server.id,
        Server_bans.user_id == body.user_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Ban not found")
    account = database.query(UserInfo).filter(UserInfo.id == body.user_id).first()
    write_audit_log(database, server.id, current_user.id, "unban_member", "member", body.user_id, {
        "username": account.username if account else "",
    })
    database.delete(row)
    database.commit()
    return {"ok": True, "user_id": body.user_id}


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
    if body.seconds:
        await notify_feed_alert(
            database,
            receiver_id=target.id,
            alert_type="timeout",
            sender_id=current_user.id,
            alert_family="moderation",
            server_id=server.id,
            reason=reason,
            duration_seconds=body.seconds,
        )
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
        await remove_member(
            database, server, target, membership, current_user, "kick", reason,
            expires, duration_seconds=body.seconds or None,
        )
        kicked.append(uid)
    return {"ok": True, "kicked": kicked, "count": len(kicked)}


def can_open_server_bans(database, server, user_id):
    if server.owner_id == user_id:
        return True
    perms = effective_perms_for_user(database, server, user_id)
    return bool(perms.get("ban_members"))


def require_server_bans(database, server, user_id):
    if not can_open_server_bans(database, server, user_id):
        raise HTTPException(status_code=403, detail="You do not have permission to view bans.")
    return True


def serialize_settings_ban(database, row, user_lookup):
    user = user_lookup.get(row.user_id)
    actor = user_lookup.get(row.actor_id)
    expires = parse_dt(row.expires_at)
    payload = {
        "id": row.id,
        "user_id": row.user_id,
        "reason": row.reason or "",
        "created_at": iso_dt(row.created_at),
        "expires_at": iso_dt(expires) if expires else None,
        "temporary": bool(expires),
        "user": None,
        "actor": None,
    }
    if user:
        payload["user"] = {
            "id": user.id,
            "username": user.username,
            "display_name": public_display_name(user),
            "avatar": public_avatar(user),
        }
    if actor:
        payload["actor"] = {
            "id": actor.id,
            "username": actor.username,
            "display_name": public_display_name(actor),
        }
    return payload


@router.get("/server_settings_bans/{server_id}")
def server_settings_bans(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, server_id, current_user.id)
    require_server_bans(database, server, current_user.id)
    rows = database.query(Server_bans).filter(Server_bans.server_id == server_id).order_by(Server_bans.created_at.desc()).all()
    now = datetime.utcnow()
    live = []
    changed = False
    for row in rows:
        expires = parse_dt(row.expires_at)
        if expires and expires <= now:
            database.delete(row)
            changed = True
            continue
        live.append(row)
    if changed:
        database.commit()
    user_ids = set()
    for row in live:
        user_ids.add(row.user_id)
        if row.actor_id:
            user_ids.add(row.actor_id)
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(user_ids)).all() if user_ids else []
    lookup = {account.id: account for account in accounts}
    bans = [serialize_settings_ban(database, row, lookup) for row in live]
    return {"server_id": server_id, "bans": bans}


def server_channel_ids(database, server_id):
    return [
        row[0]
        for row in database.query(Server_channels.id)
        .join(Server_categories, Server_channels.category_id == Server_categories.id)
        .filter(Server_categories.server_id == server_id)
        .all()
    ]


def count_text_links(query, columns):
    clauses = []
    for column in columns:
        lowered = func.lower(column)
        clauses.append(lowered.like("%http://%"))
        clauses.append(lowered.like("%https://%"))
    if not clauses:
        return 0
    return query.filter(or_(*clauses)).count()


def count_attachments(query, column):
    return query.filter(column.isnot(None), column != "").count()


def member_activity_counts(database, server, user_id):
    channel_ids = server_channel_ids(database, server.id)
    messages = 0
    media = 0
    links = 0
    if not channel_ids:
        return messages, media, links

    def chat_query():
        return database.query(Channel_messages).filter(
            Channel_messages.channel_id.in_(channel_ids),
            Channel_messages.sender_id == user_id,
        )

    def post_query():
        return database.query(Announcement_post).filter(
            Announcement_post.channel_id.in_(channel_ids),
            Announcement_post.sender_id == user_id,
        )

    def comment_query():
        return database.query(Announcement_comment).join(
            Announcement_post, Announcement_comment.post_id == Announcement_post.id
        ).filter(
            Announcement_post.channel_id.in_(channel_ids),
            Announcement_comment.sender_id == user_id,
        )

    def topic_query():
        return database.query(Forum_post).filter(
            Forum_post.channel_id.in_(channel_ids),
            Forum_post.author_id == user_id,
        )

    def reply_query():
        return database.query(Forum_messages).join(
            Forum_post, Forum_messages.post_id == Forum_post.id
        ).filter(
            Forum_post.channel_id.in_(channel_ids),
            Forum_messages.author_id == user_id,
        )

    def gallery_query():
        return database.query(Media_item).filter(
            Media_item.channel_id.in_(channel_ids),
            Media_item.sender_id == user_id,
        )

    messages += chat_query().count()
    media += count_attachments(chat_query(), Channel_messages.attachment)
    links += count_text_links(chat_query(), [Channel_messages.content])

    messages += post_query().count()
    media += count_attachments(post_query(), Announcement_post.attachment)
    links += count_text_links(post_query(), [Announcement_post.title, Announcement_post.body])

    messages += comment_query().count()
    links += count_text_links(comment_query(), [Announcement_comment.content])

    messages += topic_query().count()
    media += count_attachments(topic_query(), Forum_post.attachment)
    links += count_text_links(topic_query(), [Forum_post.title, Forum_post.body])

    messages += reply_query().count()
    media += count_attachments(reply_query(), Forum_messages.attachment)
    links += count_text_links(reply_query(), [Forum_messages.content])

    media += gallery_query().count()
    links += count_text_links(gallery_query(), [Media_item.title, Media_item.description])
    return messages, media, links


@router.get("/server_member_mod/{server_id}/{user_id}")
def server_member_mod(server_id: str, user_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, server_id, current_user.id)
    require_server_roster(database, server, current_user.id)
    membership = database.query(Server_members).filter(
        Server_members.server_id == server.id,
        Server_members.user_id == user_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Server membership not found")
    messages, media, links = member_activity_counts(database, server, user_id)
    perms = effective_perms_for_user(database, server, user_id)
    audit = database.query(Audit_log).filter(
        Audit_log.server_id == server.id,
        or_(
            Audit_log.actor_id == user_id,
            and_(Audit_log.target_type == "member", Audit_log.target_id == user_id),
        ),
    ).count()
    return {
        "messages": messages,
        "links": links,
        "media": media,
        "audit": audit,
        "permissions": [key for key in LIVE_ROLE_PERMS if perms.get(key)],
    }
