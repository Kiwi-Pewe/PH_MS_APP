from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, cast, String
from app.models import (
    UserInfo, Feedback_report, Servers, Server_members, Server_bans, Friend_request,
    Account_warn, Site_ban, Active_Sessions, Message, Channel_messages, Server_channels,
    Server_categories, Community_post, Community_room_message,
)
from app.database import get_db, SessionLocal
from app.auth import get_current_user
from app.schemas import Feedback_status, Admin_warn, Admin_ban, Admin_delete
from app.routers.account import public_display_name
from app.routers.profile import public_identity, public_avatar, ensure_layout
from app.routers.mini_profiles import layout_banner_and_about
from app.routers.servers import server_banner_fields, server_icon_url
from app.routers.feed import notify_feed_alert
from app.routers.realtime import active_connections
from app.r2 import delete_attachment, post_attachments_public
from app.site_moderation import (
    SITE_BAN_LABELS,
    SITE_BAN_SECONDS,
    account_warn_count,
    ban_account,
    delete_account_to_permaban,
    friend_count,
    is_protected_account,
    refuse_moderate,
    server_ban_count,
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
    "report": "User/Server Report",
}

FEEDBACK_STATUSES = ("new", "viewed", "review", "completed")
FEEDBACK_CHANGE_STATUSES = ("viewed", "review")
FEEDBACK_COMPLETE_DAYS = 30
FEEDBACK_STATUS_LABELS = {
    "new": "New",
    "viewed": "Viewed",
    "review": "In review",
    "completed": "Completed",
}


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
    return pack_user(account, count, database)


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
    }


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
        "report": row.report,
        "attachments": post_attachments_public(row.attachments),
        "status": row.status or "new",
        "context_view": row.context_view,
        "server_id": row.server_id,
        "server_name": row.server_name,
        "channel_id": row.channel_id,
        "channel_name": row.channel_name,
        "channel_type": row.channel_type,
        "created_at": str(row.created_at) if row.created_at else None,
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


def apply_feedback_status(row, status):
    key = (status or "").strip().lower()
    if key == "completed":
        row.status = "completed"
        if not getattr(row, "delete_after", None):
            row.delete_after = datetime.utcnow() + timedelta(days=FEEDBACK_COMPLETE_DAYS)
        return row
    if key not in FEEDBACK_CHANGE_STATUSES:
        raise HTTPException(status_code=400, detail="That status cannot be set.")
    row.status = key
    row.delete_after = None
    return row


async def sweep_completed_feedback():
    while True:
        await asyncio.sleep(1800)
        database = SessionLocal()
        try:
            now = datetime.utcnow()
            rows = (
                database.query(Feedback_report)
                .filter(
                    Feedback_report.status == "completed",
                    Feedback_report.delete_after != None,
                    Feedback_report.delete_after <= now,
                )
                .all()
            )
            for row in rows:
                delete_attachment(row.attachments)
                database.delete(row)
            database.commit()
        finally:
            database.close()


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
    recent_reports = [{
        "id": row.id,
        "username": row.username or "",
        "display_name": row.display_name or row.username or "",
        "feedback_type": row.feedback_type or "",
        "status": row.status or "new",
        "created_at": str(row.created_at) if row.created_at else None,
    } for row in recent_report_rows]
    servers_total = int(database.query(func.count()).select_from(Servers).scalar() or 0)
    servers_24h = count_rows(database, Servers, Servers.created_at, ago_1)
    servers_prev = count_rows(database, Servers, Servers.created_at, ago_2, ago_1)
    servers_today = count_rows(database, Servers, Servers.created_at, day)
    servers_active = active_server_count(database, ago_1)
    posts_24h = count_rows(database, Community_post, Community_post.created_at, ago_1)
    posts_prev = count_rows(database, Community_post, Community_post.created_at, ago_2, ago_1)
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
            "recent": recent_reports,
        },
        "servers": {
            "total": servers_total,
            "created_24h": servers_24h,
            "created_prev_24h": servers_prev,
            "created_today": servers_today,
            "active_24h": servers_active,
        },
        "community": {
            "posts_24h": posts_24h,
            "posts_prev_24h": posts_prev,
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
    sort: str = "id",
    order: str = "desc",
    offset: int = 0,
    limit: int = PAGE_SIZE,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    query = database.query(Feedback_report)
    text = (q or "").strip()
    if text:
        needle = like_text(text)
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
    database.commit()
    database.refresh(row)
    await notify_feedback_ticket_alert(database, row, current_user, previous)
    return {"report": load_feedback_row(database, row.id)}


@router.get("/admin/user")
def admin_user(
    q: str = "",
    sort: str = "id",
    order: str = "asc",
    offset: int = 0,
    limit: int = PAGE_SIZE,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    query = database.query(UserInfo)
    text = (q or "").strip()
    if text:
        needle = like_text(text)
        query = query.filter(or_(
            UserInfo.username.ilike(needle),
            UserInfo.display_name.ilike(needle),
            UserInfo.profile_status.ilike(needle),
            UserInfo.profile_pronouns.ilike(needle),
            cast(UserInfo.id, String).ilike(needle),
        ))
    server_count_col = (
        database.query(func.count(Server_members.id))
        .filter(Server_members.user_id == UserInfo.id)
        .correlate(UserInfo)
        .as_scalar()
    )
    columns = {
        "id": UserInfo.id,
        "username": UserInfo.username,
        "display_name": UserInfo.display_name,
        "created_at": UserInfo.created_at,
        "status": UserInfo.profile_status,
        "pronouns": UserInfo.profile_pronouns,
        "mfa_enabled": UserInfo.mfa_enabled,
        "server_count": server_count_col,
    }
    query = query.order_by(*sort_keys(columns.get(sort, UserInfo.id), order, UserInfo.id))
    accounts, has_more = take_page(query, offset, limit)
    counts = user_server_counts(database, [account.id for account in accounts])
    return {
        "users": [pack_user(account, counts.get(account.id, 0), database) for account in accounts],
        "has_more": has_more,
    }


@router.get("/admin/user/{user_id}")
def admin_user_detail(user_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    require_oneira_admin(current_user)
    return {"user": load_admin_user(database, user_id)}


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
    return {
        "user": {
            "id": account.id,
            "username": account.username,
            "display_name": public_display_name(account),
            "status": account.profile_status or "",
            "pronouns": account.profile_pronouns or "",
            "member_since": str(account.created_at) if account.created_at else None,
        },
        "layout": layout,
        "identity": public_identity(account),
    }


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
    sort: str = "id",
    order: str = "asc",
    offset: int = 0,
    limit: int = PAGE_SIZE,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    query = database.query(Servers)
    text = (q or "").strip()
    if text:
        needle = like_text(text)
        query = query.filter(or_(
            Servers.id.ilike(needle),
            Servers.name.ilike(needle),
            Servers.url_slug.ilike(needle),
            Servers.about.ilike(needle),
            Servers.server_type.ilike(needle),
        ))
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
    return {
        "servers": [
            pack_server(server, owner_names, owner_handles, counts.get(server.id, 0))
            for server in matches
        ],
        "has_more": has_more,
    }
