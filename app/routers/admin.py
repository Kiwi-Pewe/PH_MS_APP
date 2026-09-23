from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, cast, String
from app.models import UserInfo, Feedback_report, Servers, Server_members
from app.database import get_db
from app.auth import get_current_user
from app.routers.account import public_display_name
from app.routers.profile import public_identity
from app.routers.mini_profiles import layout_banner_and_about
from app.routers.servers import server_banner_fields, server_icon_url
from app.r2 import post_attachments_public
import json

router = APIRouter()

PAGE_SIZE = 10

FEEDBACK_TYPE_LABELS = {
    "bug": "Bug Report",
    "feature": "Feature Request",
    "inquiry": "General Inquiries",
}


def require_oneira_admin(user):
    if (user.username or "").strip().lower() != "kiwi":
        raise HTTPException(status_code=403, detail="Admin Panel is not available.")
    return user


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


def pack_user(account, server_count):
    avatar, banner, banner_color = user_visuals(account)
    return {
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
    }


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


def pack_feedback(row, avatar):
    return {
        "id": row.id,
        "user_id": row.user_id,
        "username": row.username,
        "display_name": row.display_name,
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
        "avatar": avatar or {},
    }


@router.get("/admin/me")
def admin_me(current_user: UserInfo = Depends(get_current_user)):
    require_oneira_admin(current_user)
    return {
        "id": current_user.id,
        "username": current_user.username,
        "display_name": public_display_name(current_user),
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
    faces = {account.id: public_identity(account).get("avatar") or {} for account in accounts}
    return {
        "reports": [pack_feedback(row, faces.get(row.user_id)) for row in rows],
        "has_more": has_more,
    }


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
        "users": [pack_user(account, counts.get(account.id, 0)) for account in accounts],
        "has_more": has_more,
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
