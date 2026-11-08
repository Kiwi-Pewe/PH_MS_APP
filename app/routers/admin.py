from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, cast, String
from app.models import (
    UserInfo, Feedback_report, Feedback_event, Admin_user_note, Servers, Server_members,
    Server_bans, Friend_request, Account_warn, Site_ban, Active_Sessions, Message,
    Community_lock, Server_lock,
    Channel_messages, Server_channels, Server_categories, Server_roles, Server_role_members, Community_post, Community_room,
    Community_room_member, Community_room_message, Community_phone_wait, Community_phone_call,
    Block_user,
)
from app.database import get_db, SessionLocal
from app.auth import get_current_user
from app.schemas import Feedback_status, Admin_warn, Admin_ban, Admin_delete, Admin_note, Admin_user_report, Admin_server_report, Admin_report_update
from app.routers.account import public_display_name
from app.routers.feedback import (
    REPORT_KINDS, feedback_file_count, feedback_score, clean_feedback_text, clean_report_kind,
)
from app.routers.profile import public_identity, public_avatar, ensure_layout, profile_payload, friend_preview, avatar_lookup
from app.routers.mini_profiles import layout_banner_and_about
from app.routers.servers import server_banner_fields, server_icon_url, server_type_label, join_methods_by_user
from app.routers.mentions import decorate_history, reply_map_for
from app.routers.moderation import iso_dt
from app.routers.reactions import reactions_for_messages
from app.routers.roles import name_color_roles_by_user, nicknames_for_users, clean_role_color
from app.r2 import delete_attachment, post_attachments_public, attachment_public
from app.routers.feed import notify_feed_alert
from app.routers.realtime import active_connections, presence_status
from app.site_moderation import (
    COMMUNITY_LOCKS,
    SITE_BAN_LABELS,
    SITE_BAN_SECONDS,
    account_warn_count,
    ban_account,
    ban_account_until,
    delete_account_to_permaban,
    friend_count,
    is_protected_account,
    pack_community_locks,
    pack_server_locks,
    refuse_moderate,
    SERVER_LOCKS,
    server_ban_count,
    set_community_lock,
    set_server_lock,
    freeze_and_empty_server,
    mask_message_payloads,
    site_ban_active,
    site_ban_count,
    warn_account,
)
from datetime import datetime, timedelta
import asyncio
import json

router = APIRouter()

PAGE_SIZE = 10

FEEDBACK_TYPE_LABELS = {
    "bug": "Bug Report",
    "feature": "Feature Request",
    "inquiry": "General Inquiries",
    "report": "Report",
}

FEEDBACK_STATUSES = ("new", "viewed", "review", "completed", "open", "followup", "closed")
FEEDBACK_CHANGE_STATUSES = ("viewed", "review", "open", "followup")
FEEDBACK_COMPLETE_DAYS = 30
FEEDBACK_STATUS_LABELS = {
    "new": "New",
    "viewed": "Viewed",
    "review": "In review",
    "completed": "Completed",
    "open": "Open",
    "followup": "Needs Followup",
    "closed": "Closed",
}
ADMIN_REPORT_STATUSES = ("open", "followup", "closed")
ADMIN_URGENCY = ("high", "medium", "low")
ADMIN_LOCK_DAYS = (1, 3, 5, 7)


def require_oneira_admin(user):
    if (user.username or "").strip().lower() != "kiwi":
        raise HTTPException(status_code=403, detail="Admin Panel is not available.")
    return user


async def notify_feedback_ticket_alert(database, row, actor, previous_status):
    if not row or not row.user_id:
        return
    new_status = (row.status or "").strip().lower()
    old_status = (previous_status or "").strip().lower()
    if not new_status or new_status == old_status:
        return
    alert_type = "report_status" if (row.feedback_type or "").strip().lower() == "report" else "feedback_status"
    await notify_feed_alert(
        database,
        receiver_id=row.user_id,
        alert_type=alert_type,
        sender_id=actor.id if actor else None,
        alert_family="feedback",
        reason=FEEDBACK_STATUS_LABELS.get(new_status, new_status),
        context=json.dumps({
            "report_id": row.id,
            "feedback_type": (row.feedback_type or "").strip().lower() or None,
        }),
    )


def user_visuals(account):
    ident = public_identity(account)
    try:
        raw = json.loads(getattr(account, "profile_layout", None) or "{}")
    except (TypeError, ValueError):
        raw = {}
    if not isinstance(raw, dict):
        raw = {}
    color, _ = layout_banner_and_about(raw)
    return ident.get("avatar") or {}, ident.get("banner") or {}, color


def pack_user(account, server_count, database=None):
    avatar, banner, banner_color = user_visuals(account)
    payload = {
        "id": account.id,
        "username": account.username,
        "display_name": public_display_name(account),
        "created_at": str(account.created_at) if account.created_at else None,
        "status": account.profile_status or "",
        "pronouns": account.profile_pronouns or "",
        "mfa_enabled": bool(account.mfa_enabled),
        "server_count": int(server_count),
        "avatar": avatar,
        "banner": banner,
        "banner_color": banner_color,
        "protected": is_protected_account(account),
        "site_banned": site_ban_active(account),
        "banned_until": str(account.banned_until) if getattr(account, "banned_until", None) else None,
        "ban_reason": getattr(account, "ban_reason", None) or "",
        "presence": presence_status(account.id),
        "flagged": False,
    }
    if database is not None:
        payload["friend_count"] = friend_count(database, account.id)
        payload["warn_count"] = account_warn_count(database, account.id)
        payload["site_ban_count"] = site_ban_count(database, account.id)
        payload["server_ban_count"] = server_ban_count(database, account.id)
        payload["ban_count"] = int(payload["site_ban_count"]) + int(payload["server_ban_count"])
    return payload


def load_admin_user(database, user_id):
    account = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="User not found.")
    count = user_server_counts(database, [account.id]).get(account.id, 0)
    packed = pack_user(account, count, database)
    packed["session_count"] = int(
        database.query(func.count()).select_from(Active_Sessions)
        .filter(Active_Sessions.account_id == account.id)
        .scalar() or 0
    )
    last_active = (
        database.query(func.max(Active_Sessions.last_active))
        .filter(Active_Sessions.account_id == account.id)
        .scalar()
    )
    packed["last_active"] = str(last_active) if last_active else None
    packed["blocked_by"] = int(
        database.query(func.count()).select_from(Block_user)
        .filter(Block_user.blocked_user == account.id)
        .scalar() or 0
    )
    packed["reports_made"] = int(
        database.query(func.count()).select_from(Feedback_report)
        .filter(Feedback_report.user_id == account.id)
        .scalar() or 0
    )
    packed["reports_about"] = int(
        database.query(func.count()).select_from(Feedback_report)
        .filter(feedback_about_user(account.id, account.username))
        .filter(or_(Feedback_report.user_id.is_(None), Feedback_report.user_id != account.id))
        .scalar() or 0
    )
    packed["community_locks"] = pack_community_locks(database, account.id)
    packed["flagged"] = "flagged" in packed["community_locks"]
    database.commit()
    return packed


def server_online_count(database, server_id):
    ids = [
        uid for (uid,) in database.query(Server_members.user_id).filter(Server_members.server_id == server_id).all()
    ]
    return sum(1 for uid in ids if presence_status(uid) == "online")


def server_last_message_at(database, server_id):
    last = (
        database.query(func.max(Channel_messages.timestamp))
        .select_from(Channel_messages)
        .join(Server_channels, Server_channels.id == Channel_messages.channel_id)
        .join(Server_categories, Server_categories.id == Server_channels.category_id)
        .filter(Server_categories.server_id == server_id)
        .scalar()
    )
    return str(last) if last else None


def pack_server(server, owner_names, owner_handles, member_count):
    banner = server_banner_fields(server)
    return {
        "id": server.id,
        "name": server.name,
        "about": server.about or "",
        "url_slug": server.url_slug or "",
        "server_type": server.server_type or "",
        "owner_id": server.owner_id,
        "owner_username": owner_handles.get(server.owner_id, ""),
        "owner_display_name": owner_names.get(server.owner_id, ""),
        "member_count": int(member_count),
        "created_at": str(server.created_at) if server.created_at else None,
        "icon_url": server_icon_url(server),
        "banner_url": banner.get("banner_url") or "",
        "banner_color": banner.get("banner_color") or "",
        "discoverable": bool(getattr(server, "discoverable", False)),
        "server_type_label": server_type_label(server.server_type or ""),
        "frozen": False,
        "flagged": False,
        "locks": {},
    }


def pack_admin_server(database, server):
    owner_names, owner_handles = owner_maps(database, [server])
    counts = server_member_counts(database, [server.id])
    packed = pack_server(server, owner_names, owner_handles, counts.get(server.id, 0))
    locks = pack_server_locks(database, server.id)
    packed["locks"] = locks
    packed["frozen"] = "frozen" in locks
    packed["flagged"] = "flagged" in locks
    packed["online_count"] = server_online_count(database, server.id)
    packed["last_activity"] = server_last_message_at(database, server.id)
    return packed


def flagged_user_ids(database, ids):
    if not ids:
        return set()
    rows = (
        database.query(Community_lock.user_id)
        .filter(Community_lock.user_id.in_(ids), Community_lock.kind == "flagged")
        .all()
    )
    return {uid for (uid,) in rows}


def flagged_server_ids(database, ids):
    if not ids:
        return set()
    rows = (
        database.query(Server_lock.server_id)
        .filter(Server_lock.server_id.in_(ids), Server_lock.kind == "flagged")
        .all()
    )
    return {sid for (sid,) in rows}


def user_server_counts(database, ids):
    if not ids:
        return {}
    rows = (
        database.query(Server_members.user_id, func.count(Server_members.id))
        .filter(Server_members.user_id.in_(ids))
        .group_by(Server_members.user_id)
        .all()
    )
    return {uid: int(n) for uid, n in rows}


def server_member_counts(database, ids):
    if not ids:
        return {}
    rows = (
        database.query(Server_members.server_id, func.count(Server_members.id))
        .filter(Server_members.server_id.in_(ids))
        .group_by(Server_members.server_id)
        .all()
    )
    return {sid: int(n) for sid, n in rows}


def owner_maps(database, servers):
    owner_ids = [row.owner_id for row in servers if row.owner_id]
    owners = database.query(UserInfo).filter(UserInfo.id.in_(owner_ids)).all() if owner_ids else []
    return (
        {account.id: public_display_name(account) for account in owners},
        {account.id: account.username for account in owners},
    )


def page_window(offset, limit):
    try:
        start = int(offset or 0)
    except (TypeError, ValueError):
        start = 0
    try:
        size = int(limit or PAGE_SIZE)
    except (TypeError, ValueError):
        size = PAGE_SIZE
    return max(start, 0), min(max(size, 1), 50)


def sort_keys(column, order, tie):
    descending = (order or "").strip().lower() == "desc"
    if descending:
        return column.desc(), tie.desc()
    return column.asc(), tie.asc()


def like_text(text):
    return "%" + (text or "") + "%"


def take_page(query, offset, limit):
    start, size = page_window(offset, limit)
    rows = query.offset(start).limit(size + 1).all()
    return rows[:size], len(rows) > size


def pack_feedback(row, extra=None):
    extra = extra or {}
    return {
        "id": row.id,
        "user_id": row.user_id,
        "username": row.username,
        "display_name": extra.get("display_name") or row.display_name,
        "feedback_type": row.feedback_type,
        "feedback_label": FEEDBACK_TYPE_LABELS.get(row.feedback_type, row.feedback_type),
        "report_kind": row.report_kind or "",
        "report_kind_label": REPORT_KINDS.get(row.report_kind, ""),
        "report_score": int(row.report_score) if row.report_score is not None else feedback_score(
            row.feedback_type, row.report, feedback_file_count(row.attachments)
        ),
        "report": row.report,
        "attachments": post_attachments_public(row.attachments),
        "status": row.status or "new",
        "context_view": row.context_view,
        "server_id": row.server_id,
        "server_name": row.server_name,
        "channel_id": row.channel_id,
        "channel_name": row.channel_name,
        "channel_type": row.channel_type,
        "target_user_id": row.target_user_id,
        "assign_id": row.assign_id,
        "urgency": row.urgency or "",
        "alert_user": bool(row.alert_user),
        "requests_info": bool(row.requests_info),
        "report_mode": row.report_mode or "",
        "created_at": str(row.created_at) if row.created_at else None,
        "last_interacted": extra.get("last_interacted") or (str(row.created_at) if row.created_at else None),
        "update_count": int(extra.get("update_count") or 0),
        "last_username": extra.get("last_username") or row.username,
        "delete_after": str(row.delete_after) if getattr(row, "delete_after", None) else None,
        "avatar": extra.get("avatar") or {},
        "joined_at": extra.get("joined_at"),
        "reports_made": int(extra.get("reports_made") or 0),
        "ban_count": int(extra.get("ban_count") or 0),
    }


def feedback_extras(database, rows, accounts):
    ids = [row.user_id for row in rows if row.user_id]
    faces = {account.id: public_identity(account).get("avatar") or {} for account in accounts}
    joined = {account.id: str(account.created_at) if account.created_at else None for account in accounts}
    names = {account.id: public_display_name(account) for account in accounts}
    made = {}
    bans = {}
    if ids:
        made = dict(
            database.query(Feedback_report.user_id, func.count(Feedback_report.id))
            .filter(Feedback_report.user_id.in_(ids))
            .group_by(Feedback_report.user_id)
            .all()
        )
        bans = dict(
            database.query(Server_bans.user_id, func.count(Server_bans.id))
            .filter(Server_bans.user_id.in_(ids))
            .group_by(Server_bans.user_id)
            .all()
        )
    extras = {}
    for row in rows:
        uid = row.user_id
        extras[row.id] = {
            "avatar": faces.get(uid) or {},
            "joined_at": joined.get(uid),
            "display_name": names.get(uid) or row.display_name,
            "reports_made": int(made.get(uid, 0)),
            "ban_count": int(bans.get(uid, 0)),
        }
    return extras


def load_feedback_row(database, report_id):
    row = database.query(Feedback_report).filter(Feedback_report.id == report_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found.")
    account = database.query(UserInfo).filter(UserInfo.id == row.user_id).first() if row.user_id else None
    extras = feedback_extras(database, [row], [account] if account else [])
    return pack_feedback(row, extras.get(row.id))


def feedback_about_user(user_id, username=""):
    handle = (username or "").strip()
    parts = [
        Feedback_report.target_user_id == user_id,
        and_(Feedback_report.context_view == "phone", Feedback_report.channel_id == user_id),
        and_(Feedback_report.context_view == "profile", Feedback_report.channel_id == user_id),
    ]
    if handle:
        parts.append(and_(Feedback_report.context_view == "post", Feedback_report.server_name == handle))
    return or_(*parts)


def feedback_for_user(user_id, username=""):
    return or_(
        Feedback_report.user_id == user_id,
        feedback_about_user(user_id, username),
    )


def add_feedback_event(database, report_id, actor, kind, text=""):
    database.add(Feedback_event(
        report_id=report_id,
        actor_id=actor.id if actor else None,
        actor_username=((actor.username if actor else "") or ""),
        kind=kind,
        text=text or "",
    ))


def pack_event_payload(row):
    raw = row.text or ""
    if raw.startswith("{") or raw.startswith("["):
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                return data
        except (TypeError, ValueError):
            pass
    return None


def pack_feedback_event(row, extra=None):
    extra = extra or {}
    payload = pack_event_payload(row)
    kind = (row.kind or "").strip().lower()
    message = ""
    changes = []
    if payload:
        message = (payload.get("report") or "").strip()
        for key in ("status", "urgency", "assign", "alert_user", "requests_info"):
            pair = payload.get(key)
            if isinstance(pair, list) and len(pair) == 2 and pair[0] != pair[1]:
                changes.append({"field": key, "from": pair[0], "to": pair[1]})
    elif kind == "note":
        message = row.text or ""
    elif kind == "status":
        changes.append({"field": "status", "from": "", "to": row.text or ""})
    elif kind == "created":
        message = ""
    else:
        message = row.text or ""
    return {
        "id": row.id,
        "kind": kind,
        "text": row.text or "",
        "message": message,
        "changes": changes,
        "actor_id": row.actor_id,
        "actor_username": extra.get("username") or row.actor_username or "",
        "actor_display_name": extra.get("display_name") or row.actor_username or "",
        "avatar": extra.get("avatar") or {},
        "created_at": str(row.created_at) if row.created_at else None,
    }


def load_feedback_events(database, row):
    events = (
        database.query(Feedback_event)
        .filter(Feedback_event.report_id == row.id)
        .order_by(Feedback_event.created_at.asc(), Feedback_event.id.asc())
        .all()
    )
    actor_ids = list({item.actor_id for item in events if item.actor_id})
    if row.user_id:
        actor_ids.append(row.user_id)
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(actor_ids)).all() if actor_ids else []
    faces = {account.id: public_identity(account).get("avatar") or {} for account in accounts}
    names = {account.id: public_display_name(account) for account in accounts}
    handles = {account.id: account.username or "" for account in accounts}
    packed = []
    for item in events:
        extra = {
            "avatar": faces.get(item.actor_id) or {},
            "display_name": names.get(item.actor_id) or "",
            "username": handles.get(item.actor_id) or item.actor_username or "",
        }
        payload = pack_feedback_event(item, extra)
        if payload["kind"] == "created" and not payload["message"]:
            payload["message"] = row.report or ""
            if not payload["avatar"]:
                payload["avatar"] = faces.get(row.user_id) or {}
            if not payload["actor_username"]:
                payload["actor_username"] = handles.get(row.user_id) or row.username or ""
            if not payload["actor_display_name"]:
                payload["actor_display_name"] = names.get(row.user_id) or row.display_name or ""
        packed.append(payload)
    if packed:
        return packed
    return [{
        "id": 0,
        "kind": "created",
        "text": "",
        "message": row.report or "",
        "changes": [],
        "actor_id": row.user_id,
        "actor_username": row.username or "",
        "actor_display_name": row.display_name or row.username or "",
        "avatar": faces.get(row.user_id) if actor_ids else {},
        "created_at": str(row.created_at) if row.created_at else None,
    }]


def pack_admin_note(row):
    return {
        "id": row.id,
        "text": row.text or "",
        "actor_username": row.actor_username or "",
        "created_at": str(row.created_at) if row.created_at else None,
    }


def clip_admin_note(text, required=True):
    value = (text or "").replace("\r\n", "\n").strip()
    if required and not value:
        raise HTTPException(status_code=400, detail="Write a note.")
    if len(value) > 1500:
        raise HTTPException(status_code=400, detail="Note is over the character limit.")
    return value


def apply_feedback_status(row, status):
    key = (status or "").strip().lower()
    if key in ("completed", "closed"):
        row.status = "closed"
        row.delete_after = None
        return row
    if key in ("review", "followup"):
        row.status = "followup"
        row.delete_after = None
        return row
    if key in ("new", "open"):
        row.status = "open"
        row.delete_after = None
        return row
    if key not in FEEDBACK_CHANGE_STATUSES:
        raise HTTPException(status_code=400, detail="That status cannot be set.")
    row.status = key
    row.delete_after = None
    return row


def parse_admin_until(until, days, permanent):
    if permanent:
        return None, True
    text = (until or "").strip()
    if text:
        try:
            if "T" in text:
                when = datetime.fromisoformat(text.replace("Z", ""))
            else:
                bits = text.split("-")
                when = datetime(int(bits[0]), int(bits[1]), int(bits[2]), 23, 59, 59)
        except (TypeError, ValueError, IndexError):
            raise HTTPException(status_code=400, detail="Pick a valid date.")
        if when <= datetime.utcnow():
            raise HTTPException(status_code=400, detail="Pick a date in the future.")
        return when, False
    try:
        count = int(days or 1)
    except (TypeError, ValueError):
        count = 1
    if count < 1:
        count = 1
    return datetime.utcnow() + timedelta(days=count), False


async def sweep_completed_feedback():
    while True:
        await asyncio.sleep(1800)


MONTH_SHORT = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def utc_now():
    return datetime.utcnow()


def utc_day(when):
    return when.replace(hour=0, minute=0, second=0, microsecond=0)


def day_label(when):
    return str(when.day).zfill(2) + " " + MONTH_SHORT[when.month - 1]


def count_rows(database, model, column, start, end=None):
    query = database.query(func.count()).select_from(model).filter(column >= start)
    if end is not None:
        query = query.filter(column < end)
    return int(query.scalar() or 0)


def active_server_ids(database, start, ids=None):
    query = (
        database.query(Server_categories.server_id)
        .select_from(Channel_messages)
        .join(Server_channels, Server_channels.id == Channel_messages.channel_id)
        .join(Server_categories, Server_categories.id == Server_channels.category_id)
        .filter(Channel_messages.timestamp >= start)
        .distinct()
    )
    if ids:
        query = query.filter(Server_categories.server_id.in_(ids))
    return {row[0] for row in query.all() if row[0]}


def active_server_count(database, start, end=None):
    query = (
        database.query(func.count(func.distinct(Server_categories.server_id)))
        .select_from(Channel_messages)
        .join(Server_channels, Server_channels.id == Channel_messages.channel_id)
        .join(Server_categories, Server_categories.id == Server_channels.category_id)
        .filter(Channel_messages.timestamp >= start)
    )
    if end is not None:
        query = query.filter(Channel_messages.timestamp < end)
    return int(query.scalar() or 0)


def message_count(database, start, end=None):
    return (
        count_rows(database, Channel_messages, Channel_messages.timestamp, start, end)
        + count_rows(database, Message, Message.timestamp, start, end)
        + count_rows(database, Community_room_message, Community_room_message.created_at, start, end)
    )


@router.get("/admin/me")
def admin_me(current_user: UserInfo = Depends(get_current_user)):
    require_oneira_admin(current_user)
    return {
        "id": current_user.id,
        "username": current_user.username,
        "display_name": public_display_name(current_user),
    }


@router.get("/admin/overview/stats")
def admin_overview_stats(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    now = utc_now()
    day = utc_day(now)
    ago_1 = now - timedelta(hours=24)
    ago_2 = now - timedelta(hours=48)
    week_start = day - timedelta(days=6)
    prev_week_start = week_start - timedelta(days=7)
    accounts_total = int(database.query(func.count()).select_from(UserInfo).scalar() or 0)
    accounts_24h = count_rows(database, UserInfo, UserInfo.created_at, ago_1)
    accounts_prev = count_rows(database, UserInfo, UserInfo.created_at, ago_2, ago_1)
    accounts_today = count_rows(database, UserInfo, UserInfo.created_at, day)
    ago_7 = now - timedelta(days=7)
    ago_30 = now - timedelta(days=30)
    age_1_7d = count_rows(database, UserInfo, UserInfo.created_at, ago_7, ago_1)
    age_8_30d = count_rows(database, UserInfo, UserInfo.created_at, ago_30, ago_7)
    age_older = max(0, accounts_total - accounts_24h - age_1_7d - age_8_30d)
    banned_ids = database.query(UserInfo.id).filter(
        UserInfo.banned_until != None,
        UserInfo.banned_until > now,
    )
    banned = int(
        database.query(func.count()).select_from(UserInfo).filter(
            UserInfo.banned_until != None,
            UserInfo.banned_until > now,
        ).scalar() or 0
    )
    warned = int(
        database.query(func.count(func.distinct(Account_warn.user_id))).scalar() or 0
    )
    warned_open = int(
        database.query(func.count(func.distinct(Account_warn.user_id)))
        .filter(~Account_warn.user_id.in_(banned_ids))
        .scalar() or 0
    )
    standing_clear = max(0, accounts_total - banned - warned_open)
    recent_rows = (
        database.query(UserInfo)
        .order_by(UserInfo.created_at.desc(), UserInfo.id.desc())
        .limit(8)
        .all()
    )
    recent = [{
        "id": row.id,
        "username": row.username or "",
        "display_name": public_display_name(row),
        "created_at": str(row.created_at) if row.created_at else None,
    } for row in recent_rows]
    reports_open = int(
        database.query(func.count()).select_from(Feedback_report).filter(
            or_(Feedback_report.status.is_(None), Feedback_report.status != "completed")
        ).scalar() or 0
    )
    reports_24h = count_rows(database, Feedback_report, Feedback_report.created_at, ago_1)
    reports_prev = count_rows(database, Feedback_report, Feedback_report.created_at, ago_2, ago_1)
    report_status = {key: 0 for key in FEEDBACK_STATUSES}
    for status, n in database.query(Feedback_report.status, func.count()).group_by(Feedback_report.status).all():
        key = status if status in report_status else "new"
        report_status[key] += int(n or 0)
    report_types = {key: 0 for key in FEEDBACK_TYPE_LABELS}
    for kind, n in (
        database.query(Feedback_report.feedback_type, func.count())
        .filter(or_(Feedback_report.status.is_(None), Feedback_report.status != "completed"))
        .group_by(Feedback_report.feedback_type)
        .all()
    ):
        if kind in report_types:
            report_types[kind] = int(n or 0)
    recent_report_rows = (
        database.query(Feedback_report)
        .order_by(Feedback_report.created_at.desc(), Feedback_report.id.desc())
        .limit(8)
        .all()
    )
    report_kinds = {key: 0 for key in REPORT_KINDS}
    for kind, n in (
        database.query(Feedback_report.report_kind, func.count())
        .filter(
            Feedback_report.feedback_type == "report",
            or_(Feedback_report.status.is_(None), Feedback_report.status != "completed"),
        )
        .group_by(Feedback_report.report_kind)
        .all()
    ):
        if kind in report_kinds:
            report_kinds[kind] = int(n or 0)
    recent_reports = [{
        "id": row.id,
        "username": row.username or "",
        "display_name": row.display_name or row.username or "",
        "feedback_type": row.feedback_type or "",
        "report_kind": row.report_kind or "",
        "report_score": int(row.report_score) if row.report_score is not None else feedback_score(
            row.feedback_type, row.report, feedback_file_count(row.attachments)
        ),
        "status": row.status or "new",
        "created_at": str(row.created_at) if row.created_at else None,
    } for row in recent_report_rows]
    servers_total = int(database.query(func.count()).select_from(Servers).scalar() or 0)
    servers_24h = count_rows(database, Servers, Servers.created_at, ago_1)
    servers_prev = count_rows(database, Servers, Servers.created_at, ago_2, ago_1)
    servers_today = count_rows(database, Servers, Servers.created_at, day)
    servers_active = active_server_count(database, ago_1)
    servers_public = int(
        database.query(func.count()).select_from(Servers).filter(Servers.discoverable == True).scalar() or 0
    )
    recent_server_rows = (
        database.query(Servers)
        .filter(Servers.created_at >= ago_1)
        .order_by(Servers.created_at.desc())
        .limit(5)
        .all()
    )
    recent_server_ids = [row.id for row in recent_server_rows]
    member_counts = {}
    active_recent = set()
    if recent_server_ids:
        member_counts = dict(
            database.query(Server_members.server_id, func.count())
            .filter(Server_members.server_id.in_(recent_server_ids))
            .group_by(Server_members.server_id)
            .all()
        )
        active_recent = active_server_ids(database, ago_1, recent_server_ids)
    recent_servers = [{
        "id": row.id,
        "name": row.name or row.id,
        "created_at": str(row.created_at) if row.created_at else None,
        "public": bool(row.discoverable),
        "members": int(member_counts.get(row.id, 0)),
        "active": row.id in active_recent,
    } for row in recent_server_rows]
    posts_24h = count_rows(database, Community_post, Community_post.created_at, ago_1)
    posts_prev = count_rows(database, Community_post, Community_post.created_at, ago_2, ago_1)
    rooms_total = int(database.query(func.count()).select_from(Community_room).scalar() or 0)
    rooms_occupied = int(
        database.query(func.count(func.distinct(Community_room_member.room_id))).scalar() or 0
    )
    rooms_empty = max(0, rooms_total - rooms_occupied)
    rooms_active = int(
        database.query(func.count()).select_from(Community_room)
        .filter(Community_room.active_at.isnot(None), Community_room.active_at >= ago_1)
        .scalar() or 0
    )
    rooms_quiet = max(0, rooms_total - rooms_active)
    in_rooms = int(
        database.query(func.count(func.distinct(Community_room_member.user_id))).scalar() or 0
    )
    call_users = (
        database.query(Community_phone_call.user_a, Community_phone_call.user_b)
        .filter(Community_phone_call.status == "active")
        .all()
    )
    phone_ids = set()
    for user_a, user_b in call_users:
        if user_a:
            phone_ids.add(user_a)
        if user_b:
            phone_ids.add(user_b)
    in_call = len(phone_ids)
    wait_ids = {
        row[0] for row in database.query(Community_phone_wait.user_id).all() if row[0]
    }
    waiting = len(wait_ids)
    on_phone = len(phone_ids | wait_ids)
    recent_post_rows = (
        database.query(Community_post, UserInfo)
        .join(UserInfo, UserInfo.id == Community_post.author_id)
        .filter(Community_post.created_at >= ago_1)
        .order_by(Community_post.created_at.desc(), Community_post.id.desc())
        .limit(5)
        .all()
    )
    recent_posts = [{
        "id": post.id,
        "body": post.body or "",
        "username": user.username or "",
        "created_at": str(post.created_at) if post.created_at else None,
    } for post, user in recent_post_rows]
    week_new = count_rows(database, UserInfo, UserInfo.created_at, week_start)
    prev_week_new = count_rows(database, UserInfo, UserInfo.created_at, prev_week_start, week_start)
    bars = []
    for offset in range(7):
        start = week_start + timedelta(days=offset)
        end = start + timedelta(days=1)
        bars.append({
            "label": day_label(start),
            "value": count_rows(database, UserInfo, UserInfo.created_at, start, end),
            "hot": offset == 6,
        })
    active_24h = int(
        database.query(func.count(func.distinct(Active_Sessions.account_id)))
        .filter(Active_Sessions.last_active >= ago_1)
        .scalar() or 0
    )
    active_prev = int(
        database.query(func.count(func.distinct(Active_Sessions.account_id)))
        .filter(Active_Sessions.last_active >= ago_2, Active_Sessions.last_active < ago_1)
        .scalar() or 0
    )
    messages_24h = message_count(database, ago_1)
    messages_prev = message_count(database, ago_2, ago_1)
    growth = "even"
    if week_new > prev_week_new:
        growth = "above"
    elif week_new < prev_week_new:
        growth = "below"
    return {
        "accounts": {
            "total": accounts_total,
            "new_24h": accounts_24h,
            "new_prev_24h": accounts_prev,
            "new_today": accounts_today,
            "new_7d": week_new,
            "online": len(active_connections),
            "warned": warned,
            "banned": banned,
            "standing": {
                "clear": standing_clear,
                "warned": warned_open,
                "banned": banned,
            },
            "age": {
                "h24": accounts_24h,
                "d7": age_1_7d,
                "d30": age_8_30d,
                "older": age_older,
            },
            "recent": recent,
        },
        "reports": {
            "open": reports_open,
            "new_24h": reports_24h,
            "new_prev_24h": reports_prev,
            "review": report_status["review"],
            "completed": report_status["completed"],
            "user_server": report_types["report"],
            "status": report_status,
            "types": report_types,
            "kinds": report_kinds,
            "recent": recent_reports,
        },
        "servers": {
            "total": servers_total,
            "created_24h": servers_24h,
            "created_prev_24h": servers_prev,
            "created_today": servers_today,
            "active_24h": servers_active,
            "public": servers_public,
            "recent": recent_servers,
        },
        "community": {
            "posts_24h": posts_24h,
            "posts_prev_24h": posts_prev,
            "rooms": rooms_total,
            "rooms_occupied": rooms_occupied,
            "rooms_empty": rooms_empty,
            "rooms_active": rooms_active,
            "rooms_quiet": rooms_quiet,
            "in_rooms": in_rooms,
            "in_call": in_call,
            "waiting": waiting,
            "on_phone": on_phone,
            "listings": servers_public,
            "recent": recent_posts,
        },
        "growth": {
            "week": week_new,
            "prev_week": prev_week_new,
            "vs_week": growth,
            "range": day_label(week_start) + " – " + day_label(day) + " · 7 days",
            "bars": bars,
        },
        "pulse": {
            "active_24h": active_24h,
            "active_prev_24h": active_prev,
            "messages_24h": messages_24h,
            "messages_prev_24h": messages_prev,
            "servers_24h": servers_24h,
            "servers_today": servers_today,
        },
    }


@router.get("/admin/feedback")
def admin_feedback(
    q: str = "",
    by: str = "",
    sort: str = "id",
    order: str = "desc",
    flagged: int = 0,
    scope: str = "",
    status: str = "",
    assign: str = "",
    urgency: str = "",
    offset: int = 0,
    limit: int = PAGE_SIZE,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    query = database.query(Feedback_report)
    bucket = (scope or "").strip().lower()
    if bucket == "search":
        query = query.filter(Feedback_report.feedback_type.in_(("bug", "report")))
    elif bucket == "feedback":
        query = query.filter(Feedback_report.feedback_type.in_(("inquiry", "feature")))
    text = (q or "").strip()
    field = (by or "").strip().lower()
    if text:
        needle = like_text(text)
        if field == "username":
            query = query.filter(Feedback_report.username.ilike(needle))
        elif field == "display_name":
            query = query.filter(Feedback_report.display_name.ilike(needle))
        elif field == "id":
            query = query.filter(cast(Feedback_report.id, String).ilike(needle))
        else:
            query = query.filter(or_(
                Feedback_report.username.ilike(needle),
                Feedback_report.display_name.ilike(needle),
                Feedback_report.report.ilike(needle),
                Feedback_report.feedback_type.ilike(needle),
                Feedback_report.status.ilike(needle),
                Feedback_report.server_name.ilike(needle),
                Feedback_report.server_id.ilike(needle),
                Feedback_report.channel_name.ilike(needle),
                cast(Feedback_report.id, String).ilike(needle),
            ))
    if flagged:
        query = query.filter(or_(
            Feedback_report.target_user_id.in_(
                database.query(Community_lock.user_id).filter(Community_lock.kind == "flagged")
            ),
            Feedback_report.server_id.in_(
                database.query(Server_lock.server_id).filter(Server_lock.kind == "flagged")
            ),
        ))
    status_key = (status or "").strip().lower()
    if status_key:
        query = query.filter(Feedback_report.status == status_key)
    assign_key = (assign or "").strip().lower()
    if assign_key == "everyone":
        query = query.filter(Feedback_report.assign_id.is_(None))
    elif assign_key:
        try:
            query = query.filter(Feedback_report.assign_id == int(assign_key))
        except (TypeError, ValueError):
            pass
    urgency_key = (urgency or "").strip().lower()
    if urgency_key:
        query = query.filter(Feedback_report.urgency == urgency_key)
    columns = {
        "id": Feedback_report.id,
        "feedback_label": Feedback_report.feedback_type,
        "username": Feedback_report.username,
        "display_name": Feedback_report.display_name,
        "status": Feedback_report.status,
        "server_name": Feedback_report.server_name,
        "created_at": Feedback_report.created_at,
    }
    query = query.order_by(*sort_keys(columns.get(sort, Feedback_report.id), order, Feedback_report.id))
    rows, has_more = take_page(query, offset, limit)
    user_ids = list({row.user_id for row in rows if row.user_id})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(user_ids)).all() if user_ids else []
    extras = feedback_extras(database, rows, accounts)
    return {
        "reports": [pack_feedback(row, extras.get(row.id)) for row in rows],
        "has_more": has_more,
    }


@router.post("/admin/feedback/{report_id}/status")
async def admin_feedback_status(
    report_id: int,
    body: Feedback_status,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    row = database.query(Feedback_report).filter(Feedback_report.id == report_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found.")
    previous = row.status
    apply_feedback_status(row, body.status)
    add_feedback_event(database, row.id, current_user, "status", row.status or "")
    database.commit()
    database.refresh(row)
    await notify_feedback_ticket_alert(database, row, current_user, previous)
    return {"report": load_feedback_row(database, row.id)}


@router.post("/admin/feedback/{report_id}/complete")
async def admin_feedback_complete(
    report_id: int,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    row = database.query(Feedback_report).filter(Feedback_report.id == report_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found.")
    previous = row.status
    apply_feedback_status(row, "completed")
    add_feedback_event(database, row.id, current_user, "status", "completed")
    database.commit()
    database.refresh(row)
    await notify_feedback_ticket_alert(database, row, current_user, previous)
    return {"report": load_feedback_row(database, row.id)}


@router.get("/admin/user")
def admin_user(
    q: str = "",
    by: str = "id",
    sort: str = "id",
    order: str = "asc",
    flagged: int = 0,
    offset: int = 0,
    limit: int = PAGE_SIZE,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    query = database.query(UserInfo)
    text = (q or "").strip()
    field = (by or "id").strip().lower()
    if field not in ("id", "username", "display_name"):
        field = "id"
    if text:
        needle = like_text(text)
        if field == "username":
            query = query.filter(UserInfo.username.ilike(needle))
        elif field == "display_name":
            query = query.filter(UserInfo.display_name.ilike(needle))
        else:
            query = query.filter(cast(UserInfo.id, String).ilike(needle))
    if flagged:
        query = query.join(
            Community_lock,
            and_(Community_lock.user_id == UserInfo.id, Community_lock.kind == "flagged"),
        )
    query = query.order_by(UserInfo.id.asc())
    accounts, has_more = take_page(query, offset, limit)
    counts = user_server_counts(database, [account.id for account in accounts])
    marked = flagged_user_ids(database, [account.id for account in accounts])
    packed = []
    for account in accounts:
        row = pack_user(account, counts.get(account.id, 0), database)
        row["flagged"] = account.id in marked
        packed.append(row)
    return {
        "users": packed,
        "has_more": has_more,
    }


@router.get("/admin/user/{user_id}")
def admin_user_detail(user_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    require_oneira_admin(current_user)
    return {"user": load_admin_user(database, user_id)}


def pack_admin_reports(database, rows):
    user_ids = list({row.user_id for row in rows if row.user_id})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(user_ids)).all() if user_ids else []
    extras = feedback_extras(database, rows, accounts)
    report_ids = [row.id for row in rows]
    last = {}
    added = {}
    last_handles = {}
    if report_ids:
        stats = (
            database.query(
                Feedback_event.report_id,
                func.max(Feedback_event.created_at),
                func.count(Feedback_event.id),
            )
            .filter(Feedback_event.report_id.in_(report_ids))
            .group_by(Feedback_event.report_id)
            .all()
        )
        last = {report_id: touched for report_id, touched, _count in stats}
        added = {report_id: int(count or 0) for report_id, _touched, count in stats}
        last_ids = dict(
            database.query(Feedback_event.report_id, func.max(Feedback_event.id))
            .filter(Feedback_event.report_id.in_(report_ids))
            .group_by(Feedback_event.report_id)
            .all()
        )
        if last_ids:
            last_events = database.query(Feedback_event).filter(Feedback_event.id.in_(list(last_ids.values()))).all()
            last_handles = {item.report_id: item.actor_username or "" for item in last_events}
    packed = []
    for row in rows:
        extra = dict(extras.get(row.id) or {})
        touched = last.get(row.id) or row.created_at
        extra["last_interacted"] = str(touched) if touched else None
        extra["update_count"] = max(0, int(added.get(row.id) or 0) - 1)
        extra["last_username"] = last_handles.get(row.id) or row.username
        packed.append(pack_feedback(row, extra))
    packed.sort(key=lambda item: (item.get("last_interacted") or "", item.get("id") or 0), reverse=True)
    return packed


@router.get("/admin/user/{user_id}/reports")
def admin_user_reports(
    user_id: int,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    account = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="User not found.")
    rows = (
        database.query(Feedback_report)
        .filter(feedback_for_user(account.id, account.username))
        .order_by(Feedback_report.created_at.desc(), Feedback_report.id.desc())
        .limit(50)
        .all()
    )
    packed = pack_admin_reports(database, rows)
    about = {row.id: bool(row.user_id != account.id) for row in rows}
    for item in packed:
        item["about"] = about.get(item["id"], False)
    return {"reports": packed}


@router.get("/admin/user/{user_id}/notes")
def admin_user_notes(
    user_id: int,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    account = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="User not found.")
    rows = (
        database.query(Admin_user_note)
        .filter(Admin_user_note.user_id == user_id)
        .order_by(Admin_user_note.created_at.desc(), Admin_user_note.id.desc())
        .limit(50)
        .all()
    )
    text = rows[0].text if rows else ""
    return {"text": text, "notes": [pack_admin_note(row) for row in rows]}


@router.post("/admin/user/{user_id}/notes")
def admin_add_user_note(
    user_id: int,
    body: Admin_note,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    account = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="User not found.")
    text = clip_admin_note(body.text, required=False)
    database.query(Admin_user_note).filter(Admin_user_note.user_id == user_id).delete(synchronize_session=False)
    row = None
    if text:
        row = Admin_user_note(
            user_id=account.id,
            actor_id=current_user.id,
            actor_username=current_user.username or "",
            text=text,
        )
        database.add(row)
    database.commit()
    if row:
        database.refresh(row)
    return {"text": text, "note": pack_admin_note(row) if row else None}


@router.post("/admin/user/{user_id}/report")
async def admin_create_user_report(
    user_id: int,
    body: Admin_user_report,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    account = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="User not found.")
    report = clip_admin_note(body.report, required=True)
    mode = (body.mode or "general").strip().lower()
    if mode not in ("general", "moderation"):
        raise HTTPException(status_code=400, detail="Pick General or Moderation.")
    status = (body.status or "open").strip().lower()
    if status not in ADMIN_REPORT_STATUSES:
        raise HTTPException(status_code=400, detail="Pick a valid status.")
    urgency = (body.urgency or "").strip().lower()
    if status != "closed":
        if urgency not in ADMIN_URGENCY:
            urgency = "low"
    else:
        urgency = None
    assign_id = None
    if status != "closed" and body.assign_id:
        if int(body.assign_id) != current_user.id:
            raise HTTPException(status_code=400, detail="Assign to kiwi.")
        assign_id = current_user.id
    locks = body.locks or []
    need_action = bool(body.warn or body.ban or body.flag or any(not item.allowed for item in locks))
    if need_action:
        refuse_moderate(current_user, account)
    if mode == "moderation" and body.warn:
        warn_account(database, current_user, account, body.warn_reason)
    if mode == "moderation" and body.ban:
        until, permanent = parse_admin_until(body.ban_until, body.ban_days, body.ban_permanent)
        ban_account_until(database, current_user, account, until, "", permanent)
    if mode == "moderation" and body.flag:
        set_community_lock(database, current_user, account, "flagged", True, None)
    for item in locks:
        kind = (item.kind or "").strip().lower()
        if kind not in COMMUNITY_LOCKS or item.allowed:
            continue
        until, permanent = parse_admin_until(item.until, item.days, item.permanent)
        set_community_lock(database, current_user, account, kind, permanent, until)
    alert_user = bool(mode == "general" and body.alert_user)
    requests_info = bool(mode == "general" and body.requests_info)
    score = feedback_score("report", report, 0)
    row = Feedback_report(
        user_id=current_user.id,
        username=current_user.username,
        display_name=public_display_name(current_user),
        feedback_type="report",
        report_kind=mode,
        report_score=score,
        report=report,
        status=status,
        context_view="profile",
        channel_id=account.id,
        channel_name="@" + (account.username or ""),
        target_user_id=account.id,
        assign_id=assign_id,
        urgency=urgency,
        alert_user=alert_user,
        requests_info=requests_info,
        report_mode=mode,
    )
    database.add(row)
    database.commit()
    database.refresh(row)
    add_feedback_event(database, row.id, current_user, "created", json.dumps({"report": report}))
    database.commit()
    if alert_user:
        await notify_feed_alert(
            database,
            receiver_id=account.id,
            alert_type="report_status",
            sender_id=current_user.id,
            alert_family="feedback",
            reason="Open" if status == "open" else FEEDBACK_STATUS_LABELS.get(status, status),
            context=json.dumps({"report_id": row.id, "feedback_type": "report"}),
            force=True,
        )
    extras = feedback_extras(database, [row], [current_user])
    packed = pack_feedback(row, extras.get(row.id))
    packed["about"] = True
    packed["user"] = load_admin_user(database, account.id)
    return {"report": packed}


@router.get("/admin/feedback/{report_id}/events")
def admin_feedback_events(
    report_id: int,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    row = database.query(Feedback_report).filter(Feedback_report.id == report_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found.")
    return {"events": load_feedback_events(database, row)}


def assign_label(database, assign_id):
    if not assign_id:
        return "Everyone"
    account = database.query(UserInfo).filter(UserInfo.id == assign_id).first()
    if not account:
        return "Everyone"
    return public_display_name(account) or account.username or "kiwi"


@router.post("/admin/feedback/{report_id}/update")
async def admin_update_user_report(
    report_id: int,
    body: Admin_report_update,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    row = database.query(Feedback_report).filter(Feedback_report.id == report_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found.")
    status = (body.status or "open").strip().lower()
    if status not in ADMIN_REPORT_STATUSES:
        raise HTTPException(status_code=400, detail="Pick a valid status.")
    urgency = (body.urgency or "").strip().lower()
    assign_id = None
    if status == "closed":
        urgency = row.urgency
        assign_id = row.assign_id
    else:
        if urgency not in ADMIN_URGENCY:
            urgency = (row.urgency or "low").strip().lower() or "low"
        if body.assign_id:
            if int(body.assign_id) != current_user.id:
                raise HTTPException(status_code=400, detail="Assign to kiwi.")
            assign_id = current_user.id
    note = clip_admin_note(body.report, required=False)
    payload = {}
    if note and note != (row.report or "").strip():
        payload["report"] = note
        row.report = note
    old_status = (row.status or "").strip().lower()
    if status != old_status:
        payload["status"] = [old_status, status]
        apply_feedback_status(row, status)
    old_urgency = (row.urgency or "low").strip().lower() or "low"
    new_urgency = (urgency or "low").strip().lower() or "low"
    if new_urgency != old_urgency:
        payload["urgency"] = [old_urgency, new_urgency]
        row.urgency = new_urgency
    old_assign = row.assign_id
    if assign_id != old_assign:
        payload["assign"] = [assign_label(database, old_assign), assign_label(database, assign_id)]
        row.assign_id = assign_id
    old_alert = bool(row.alert_user)
    new_alert = bool(body.alert_user)
    if new_alert != old_alert:
        payload["alert_user"] = ["On" if old_alert else "Off", "On" if new_alert else "Off"]
        row.alert_user = new_alert
    old_info = bool(row.requests_info)
    new_info = bool(body.requests_info)
    if new_info != old_info:
        payload["requests_info"] = ["On" if old_info else "Off", "On" if new_info else "Off"]
        row.requests_info = new_info
    if not payload:
        raise HTTPException(status_code=400, detail="Change something before updating.")
    add_feedback_event(database, row.id, current_user, "update", json.dumps(payload))
    database.commit()
    database.refresh(row)
    if new_alert and not old_alert:
        account_id = row.target_user_id or row.channel_id
        if account_id:
            await notify_feed_alert(
                database,
                receiver_id=account_id,
                alert_type="report_status",
                sender_id=current_user.id,
                alert_family="feedback",
                reason=FEEDBACK_STATUS_LABELS.get(row.status or "", row.status or ""),
                context=json.dumps({"report_id": row.id, "feedback_type": "report"}),
                force=True,
            )
    extras = feedback_extras(database, [row], [current_user])
    extra = dict(extras.get(row.id) or {})
    extra["last_username"] = current_user.username
    packed = pack_feedback(row, extra)
    events = load_feedback_events(database, row)
    if events:
        packed["last_interacted"] = events[-1].get("created_at")
        packed["update_count"] = max(0, len(events) - 1)
        packed["last_username"] = events[-1].get("actor_username") or current_user.username
    return {"report": packed, "events": events}


@router.post("/admin/feedback/{report_id}/note")
def admin_feedback_note(
    report_id: int,
    body: Admin_note,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    row = database.query(Feedback_report).filter(Feedback_report.id == report_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found.")
    text = clip_admin_note(body.text)
    add_feedback_event(database, row.id, current_user, "note", text)
    database.commit()
    return {"events": load_feedback_events(database, row)}


@router.get("/admin/user/{user_id}/friends")
def admin_user_friends(
    user_id: int,
    offset: int = 0,
    limit: int = PAGE_SIZE,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    account = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="User not found.")
    rows = (
        database.query(Friend_request)
        .filter(
            or_(Friend_request.user_1 == user_id, Friend_request.user_2 == user_id),
            Friend_request.pending == False,
        )
        .order_by(Friend_request.id.asc())
    )
    page, has_more = take_page(rows, offset, limit)
    other_ids = [(row.user_2 if row.user_1 == user_id else row.user_1) for row in page]
    others = database.query(UserInfo).filter(UserInfo.id.in_(other_ids)).all() if other_ids else []
    by_id = {row.id: row for row in others}
    out = []
    for oid in other_ids:
        other = by_id.get(oid)
        if not other:
            continue
        out.append({
            "id": other.id,
            "username": other.username,
            "display_name": public_display_name(other),
            "avatar": public_avatar(other),
        })
    return {"friends": out, "has_more": has_more, "total": friend_count(database, user_id)}


@router.get("/admin/user/{user_id}/servers")
def admin_user_servers(
    user_id: int,
    offset: int = 0,
    limit: int = PAGE_SIZE,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    account = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="User not found.")
    memberships = (
        database.query(Server_members)
        .filter(Server_members.user_id == user_id)
        .order_by(Server_members.id.asc())
    )
    page, has_more = take_page(memberships, offset, limit)
    server_ids = [row.server_id for row in page]
    servers = database.query(Servers).filter(Servers.id.in_(server_ids)).all() if server_ids else []
    by_id = {row.id: row for row in servers}
    out = []
    for sid in server_ids:
        server = by_id.get(sid)
        if not server:
            continue
        out.append({
            "id": server.id,
            "name": server.name,
            "icon_url": server_icon_url(server),
            "owner_id": server.owner_id,
            "owner": server.owner_id == user_id,
        })
    total = user_server_counts(database, [user_id]).get(user_id, 0)
    return {"servers": out, "has_more": has_more, "total": total}


@router.get("/admin/user/{user_id}/warns")
def admin_user_warns(user_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    require_oneira_admin(current_user)
    rows = database.query(Account_warn).filter(Account_warn.user_id == user_id).order_by(Account_warn.id.desc()).limit(100).all()
    return {
        "warns": [{
            "id": row.id,
            "reason": row.reason or "",
            "actor_username": row.actor_username or "",
            "created_at": str(row.created_at) if row.created_at else None,
        } for row in rows]
    }


@router.get("/admin/user/{user_id}/bans")
def admin_user_bans(user_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    require_oneira_admin(current_user)
    site_rows = database.query(Site_ban).filter(Site_ban.user_id == user_id).order_by(Site_ban.id.desc()).limit(100).all()
    server_rows = database.query(Server_bans).filter(Server_bans.user_id == user_id).order_by(Server_bans.id.desc()).limit(100).all()
    server_ids = [row.server_id for row in server_rows]
    servers = database.query(Servers).filter(Servers.id.in_(server_ids)).all() if server_ids else []
    names = {row.id: row.name for row in servers}
    bans = []
    for row in site_rows:
        bans.append({
            "kind": "site",
            "id": row.id,
            "reason": row.reason or "",
            "actor_username": row.actor_username or "",
            "created_at": str(row.created_at) if row.created_at else None,
            "expires_at": str(row.expires_at) if row.expires_at else None,
            "label": "Oneira",
        })
    for row in server_rows:
        bans.append({
            "kind": "server",
            "id": row.id,
            "reason": row.reason or "",
            "actor_username": "",
            "created_at": str(row.created_at) if row.created_at else None,
            "expires_at": str(row.expires_at) if row.expires_at else None,
            "label": names.get(row.server_id) or row.server_id,
        })
    return {"bans": bans}


@router.get("/admin/user/{user_id}/profile")
def admin_user_profile(user_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    require_oneira_admin(current_user)
    account = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="User not found.")
    layout = ensure_layout(account, database)
    return profile_payload(account, layout, False, friend_preview(database, account.id))


@router.post("/admin/user/{user_id}/warn")
def admin_warn_user(user_id: int, body: Admin_warn, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    require_oneira_admin(current_user)
    target = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    refuse_moderate(current_user, target)
    warn_account(database, current_user, target, body.reason)
    database.commit()
    return {"user": load_admin_user(database, user_id)}


@router.post("/admin/user/{user_id}/ban")
def admin_ban_user(user_id: int, body: Admin_ban, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    require_oneira_admin(current_user)
    target = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    refuse_moderate(current_user, target)
    ban_account(database, current_user, target, body.seconds, body.reason)
    database.commit()
    return {"user": load_admin_user(database, user_id), "ban_lengths": SITE_BAN_LABELS}


@router.post("/admin/user/{user_id}/delete")
def admin_delete_user(user_id: int, body: Admin_delete, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    require_oneira_admin(current_user)
    target = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    refuse_moderate(current_user, target)
    if (body.username or "").strip().lstrip("@").lower() != (target.username or "").strip().lower():
        raise HTTPException(status_code=400, detail="Type the account username to confirm.")
    delete_account_to_permaban(database, current_user, target, "")
    database.commit()
    return {"ok": True, "user_id": user_id}


@router.get("/admin/ban_lengths")
def admin_ban_lengths(current_user: UserInfo = Depends(get_current_user)):
    require_oneira_admin(current_user)
    return {
        "lengths": [{"seconds": secs, "label": SITE_BAN_LABELS[secs]} for secs in SITE_BAN_SECONDS]
    }


@router.get("/admin/server")
def admin_server(
    q: str = "",
    by: str = "",
    sort: str = "id",
    order: str = "asc",
    flagged: int = 0,
    offset: int = 0,
    limit: int = PAGE_SIZE,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    query = database.query(Servers)
    text = (q or "").strip()
    field = (by or "").strip().lower()
    if text:
        needle = like_text(text)
        if field == "id":
            query = query.filter(Servers.id.ilike(needle))
        elif field == "name":
            query = query.filter(Servers.name.ilike(needle))
        else:
            query = query.filter(or_(
                Servers.id.ilike(needle),
                Servers.name.ilike(needle),
                Servers.url_slug.ilike(needle),
                Servers.about.ilike(needle),
                Servers.server_type.ilike(needle),
            ))
    if flagged:
        query = query.join(
            Server_lock,
            and_(Server_lock.server_id == Servers.id, Server_lock.kind == "flagged"),
        )
    member_count_col = (
        database.query(func.count(Server_members.id))
        .filter(Server_members.server_id == Servers.id)
        .correlate(Servers)
        .as_scalar()
    )
    if sort == "owner_display_name":
        query = query.outerjoin(UserInfo, UserInfo.id == Servers.owner_id)
        sort_col = func.coalesce(UserInfo.display_name, UserInfo.username)
    else:
        columns = {
            "id": Servers.id,
            "name": Servers.name,
            "member_count": member_count_col,
            "server_type": Servers.server_type,
            "url_slug": Servers.url_slug,
            "about": Servers.about,
            "created_at": Servers.created_at,
        }
        sort_col = columns.get(sort, Servers.id)
    query = query.order_by(*sort_keys(sort_col, order, Servers.id))
    matches, has_more = take_page(query, offset, limit)
    owner_names, owner_handles = owner_maps(database, matches)
    counts = server_member_counts(database, [row.id for row in matches])
    marked = flagged_server_ids(database, [row.id for row in matches])
    packed = []
    for server in matches:
        row = pack_server(server, owner_names, owner_handles, counts.get(server.id, 0))
        row["flagged"] = server.id in marked
        packed.append(row)
    return {
        "servers": packed,
        "has_more": has_more,
    }


@router.get("/admin/server/{server_id}")
def admin_server_detail(
    server_id: str,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    server = database.query(Servers).filter(Servers.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found.")
    owner_names, owner_handles = owner_maps(database, [server])
    counts = server_member_counts(database, [server.id])
    packed = pack_admin_server(database, server)
    return {"server": packed}


@router.get("/admin/server/{server_id}/reports")
def admin_server_reports(
    server_id: str,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    server = database.query(Servers).filter(Servers.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found.")
    rows = (
        database.query(Feedback_report)
        .filter(Feedback_report.server_id == server.id)
        .order_by(Feedback_report.created_at.desc(), Feedback_report.id.desc())
        .limit(50)
        .all()
    )
    return {"reports": pack_admin_reports(database, rows)}


@router.post("/admin/server/{server_id}/report")
async def admin_create_server_report(
    server_id: str,
    body: Admin_server_report,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    server = database.query(Servers).filter(Servers.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found.")
    report = clip_admin_note(body.report, required=True)
    mode = (body.mode or "general").strip().lower()
    if mode not in ("general", "moderation"):
        raise HTTPException(status_code=400, detail="Pick General or Moderation.")
    status = (body.status or "open").strip().lower()
    if status not in ADMIN_REPORT_STATUSES:
        raise HTTPException(status_code=400, detail="Pick a valid status.")
    urgency = (body.urgency or "").strip().lower()
    if status != "closed":
        if urgency not in ADMIN_URGENCY:
            urgency = "low"
    else:
        urgency = None
    assign_id = None
    if status != "closed" and body.assign_id:
        if int(body.assign_id) != current_user.id:
            raise HTTPException(status_code=400, detail="Assign to kiwi.")
        assign_id = current_user.id
    owner = database.query(UserInfo).filter(UserInfo.id == server.owner_id).first() if server.owner_id else None
    locks = body.locks or []
    need_action = bool(body.warn or body.disband or body.flag or any(not item.allowed for item in locks))
    if need_action and owner:
        refuse_moderate(current_user, owner)
    if mode == "moderation" and body.warn:
        if not owner:
            raise HTTPException(status_code=400, detail="This server has no owner to warn.")
        warn_account(database, current_user, owner, body.warn_reason)
    if mode == "moderation" and body.disband:
        freeze_and_empty_server(database, current_user, server)
    if mode == "moderation" and body.flag:
        set_server_lock(database, current_user, server.id, "flagged", True, None)
    for item in locks:
        kind = (item.kind or "").strip().lower()
        if kind not in SERVER_LOCKS or item.allowed:
            continue
        until, permanent = parse_admin_until(item.until, item.days, item.permanent)
        set_server_lock(database, current_user, server.id, kind, permanent, until)
        if kind == "discovery":
            server.discoverable = False
        if kind == "joins":
            server.applications_enabled = False
    alert_user = bool(mode == "general" and body.alert_user)
    requests_info = bool(mode == "general" and body.requests_info)
    score = feedback_score("report", report, 0)
    row = Feedback_report(
        user_id=current_user.id,
        username=current_user.username,
        display_name=public_display_name(current_user),
        feedback_type="report",
        report_kind=mode,
        report_score=score,
        report=report,
        status=status,
        context_view="server",
        server_id=server.id,
        server_name=server.name or "",
        channel_id=owner.id if owner else None,
        channel_name="@" + ((owner.username if owner else "") or ""),
        target_user_id=owner.id if owner else None,
        assign_id=assign_id,
        urgency=urgency,
        alert_user=alert_user,
        requests_info=requests_info,
        report_mode=mode,
    )
    database.add(row)
    database.commit()
    database.refresh(row)
    add_feedback_event(database, row.id, current_user, "created", json.dumps({"report": report}))
    database.commit()
    if alert_user and owner:
        await notify_feed_alert(
            database,
            receiver_id=owner.id,
            alert_type="report_status",
            sender_id=current_user.id,
            alert_family="feedback",
            reason="Open" if status == "open" else FEEDBACK_STATUS_LABELS.get(status, status),
            context=json.dumps({"report_id": row.id, "feedback_type": "report"}),
            force=True,
        )
    extras = feedback_extras(database, [row], [current_user])
    packed = pack_feedback(row, extras.get(row.id))
    packed["about"] = True
    packed["server"] = pack_admin_server(database, server)
    return {"report": packed}


def admin_channel_is_chat(channel):
    kind = (getattr(channel, "channel_type", None) or "text").strip().lower()
    return kind == "text"


def pack_admin_server_layout(database, server):
    categories = (
        database.query(Server_categories)
        .filter(Server_categories.server_id == server.id)
        .order_by(Server_categories.position, Server_categories.id)
        .all()
    )
    cat_ids = [row.id for row in categories]
    channels = (
        database.query(Server_channels)
        .filter(Server_channels.category_id.in_(cat_ids))
        .order_by(Server_channels.position, Server_channels.id)
        .all()
        if cat_ids
        else []
    )
    by_cat = {}
    for channel in channels:
        by_cat.setdefault(channel.category_id, []).append({
            "id": channel.id,
            "category_id": channel.category_id,
            "name": channel.name or "",
            "channel_type": channel.channel_type or "text",
            "topic": getattr(channel, "topic", None) or "",
            "is_private": bool(channel.is_private),
            "chat": admin_channel_is_chat(channel),
        })
    tree = []
    for category in categories:
        tree.append({
            "id": category.id,
            "name": category.name or "",
            "position": category.position,
            "is_private": bool(category.is_private),
            "channels": by_cat.get(category.id) or [],
        })
    banner = server_banner_fields(server)
    return {
        "id": server.id,
        "name": server.name or "",
        "discoverable": bool(getattr(server, "discoverable", False)),
        "icon_url": server_icon_url(server),
        "banner_url": banner.get("banner_url") or "",
        "banner_color": banner.get("banner_color") or "",
        "categories": tree,
    }


def pack_admin_channel_history(database, current_user, server, channel, before_id=None):
    base = database.query(Channel_messages).filter(Channel_messages.channel_id == channel.id)
    if before_id:
        rows = base.filter(Channel_messages.id < before_id).order_by(Channel_messages.timestamp.desc()).limit(25).all()
    else:
        rows = base.order_by(Channel_messages.timestamp.desc()).limit(25).all()
    sender_ids = list({message.sender_id for message in rows if message.sender_id})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(sender_ids)).all() if sender_ids else []
    username_lookup = {account.id: account.username for account in accounts}
    faces = avatar_lookup(accounts)
    reaction_map = reactions_for_messages(database, "channel", [message.id for message in rows], current_user.id)
    mention_meta = decorate_history(database, "channel", rows, current_user.id)
    reply_map = reply_map_for(database, Channel_messages, rows)
    name_map = name_color_roles_by_user(database, server.id, sender_ids)
    nick_map = nicknames_for_users(database, server.id, sender_ids)
    message_history = []
    for index, message in enumerate(rows):
        hook_name = getattr(message, "webhook_name", None) or ""
        is_hook = bool(getattr(message, "webhook_id", None) or hook_name)
        message_history.append({
            "id": message.id,
            "sender_id": message.sender_id,
            "username": hook_name if is_hook else ("" if message.sender_id is None else username_lookup.get(message.sender_id, "")),
            "nickname": "" if is_hook else nick_map.get(message.sender_id, ""),
            "content": message.content,
            "attachment": attachment_public(message.attachment),
            "timestamp": str(message.timestamp),
            "edited": bool(message.edited),
            "reactions": reaction_map.get(message.id, []),
            "mentioned": mention_meta[index]["mentioned"],
            "mention_users": mention_meta[index]["mention_users"],
            "mention_roles": mention_meta[index]["mention_roles"],
            "reply_to": reply_map.get(message.reply_to_id) if message.reply_to_id else None,
            "avatar": None if is_hook else faces.get(message.sender_id),
            "name_role": None if is_hook else name_map.get(message.sender_id),
            "is_webhook": is_hook,
            "webhook_id": getattr(message, "webhook_id", None),
            "webhook_name": hook_name,
        })
    message_history.reverse()
    mask_message_payloads(database, message_history)
    return {
        "server_id": server.id,
        "channel_id": channel.id,
        "channel_name": channel.name or "",
        "topic": getattr(channel, "topic", None) or "",
        "messages": message_history,
    }


@router.get("/admin/server/{server_id}/layout")
def admin_server_layout(
    server_id: str,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    server = database.query(Servers).filter(Servers.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found.")
    return {"server": pack_admin_server_layout(database, server)}


@router.get("/admin/server/{server_id}/channel/{channel_id}/history")
def admin_server_channel_history(
    server_id: str,
    channel_id: int,
    before_id: int = None,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    server = database.query(Servers).filter(Servers.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found.")
    if not bool(getattr(server, "discoverable", False)):
        raise HTTPException(status_code=403, detail="This server is private.")
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found.")
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    if not category or category.server_id != server.id:
        raise HTTPException(status_code=404, detail="Channel not found.")
    if not admin_channel_is_chat(channel):
        raise HTTPException(status_code=400, detail="Chat history is only available in text channels.")
    return pack_admin_channel_history(database, current_user, server, channel, before_id)


def pack_admin_member_roles(database, server_id, user_ids):
    if not user_ids:
        return {}
    rows = (
        database.query(Server_roles, Server_role_members.user_id)
        .join(Server_role_members, Server_role_members.role_id == Server_roles.id)
        .filter(Server_roles.server_id == server_id, Server_role_members.user_id.in_(user_ids))
        .order_by(Server_roles.position, Server_roles.id)
        .all()
    )
    out = {}
    for role, user_id in rows:
        packed = {
            "id": role.id,
            "name": role.name or "",
            "color": clean_role_color(getattr(role, "color", None)),
            "position": int(role.position or 0),
            "is_members": bool(role.is_members),
        }
        out.setdefault(user_id, []).append(packed)
    return out


@router.get("/admin/server/{server_id}/members")
def admin_server_members(
    server_id: str,
    offset: int = 0,
    limit: int = 25,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    server = database.query(Servers).filter(Servers.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found.")
    query = (
        database.query(Server_members)
        .filter(Server_members.server_id == server.id)
        .order_by(Server_members.joined_at.desc(), Server_members.id.desc())
    )
    rows, has_more = take_page(query, offset, limit)
    user_ids = [row.user_id for row in rows]
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(user_ids)).all() if user_ids else []
    account_lookup = {account.id: account for account in accounts}
    roles_map = pack_admin_member_roles(database, server.id, user_ids)
    name_map = name_color_roles_by_user(database, server.id, user_ids) if user_ids else {}
    join_map = join_methods_by_user(database, server.id, user_ids) if user_ids else {}
    last_seen = {}
    if user_ids:
        seen_rows = (
            database.query(Active_Sessions.account_id, func.max(Active_Sessions.last_active))
            .filter(Active_Sessions.account_id.in_(user_ids))
            .group_by(Active_Sessions.account_id)
            .all()
        )
        for account_id, stamp in seen_rows:
            last_seen[account_id] = iso_dt(stamp)
    members = []
    for row in rows:
        account = account_lookup.get(row.user_id)
        if not account:
            continue
        roles = roles_map.get(account.id) or []
        visible = [role for role in roles if not role.get("is_members")]
        highest = visible[0] if visible else None
        joined = join_map.get(account.id) or {}
        name_role = name_map.get(account.id)
        members.append({
            "id": account.id,
            "username": account.username or "",
            "display_name": public_display_name(account),
            "nickname": (getattr(row, "nickname", None) or "").strip(),
            "avatar": public_avatar(account),
            "presence": presence_status(account.id),
            "is_owner": account.id == server.owner_id,
            "joined_at": iso_dt(getattr(row, "joined_at", None)),
            "created_at": iso_dt(getattr(account, "created_at", None)),
            "last_active": last_seen.get(account.id),
            "join_method": "owner" if account.id == server.owner_id else (joined.get("join_method") or "invite"),
            "join_invite_code": joined.get("join_invite_code") or "",
            "roles": roles,
            "highest_role": highest,
            "name_role": name_role,
        })
    return {
        "server": {
            "id": server.id,
            "name": server.name or "",
            "icon_url": server_icon_url(server),
        },
        "members": members,
        "has_more": has_more,
    }
