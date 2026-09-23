from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import UserInfo, Feedback_report, Servers, Server_members
from app.database import get_db
from app.auth import get_current_user
from app.routers.account import public_display_name
from app.r2 import post_attachments_public

router = APIRouter()

LIST_CAP = 500

FEEDBACK_TYPE_LABELS = {
    "bug": "Bug Report",
    "feature": "Feature Request",
    "inquiry": "General Inquiries",
}


def require_oneira_admin(user):
    if (user.username or "").strip().lower() != "kiwi":
        raise HTTPException(status_code=403, detail="Admin Panel is not available.")
    return user


def pack_user(account, server_count):
    return {
        "id": account.id,
        "username": account.username,
        "display_name": public_display_name(account),
        "created_at": str(account.created_at) if account.created_at else None,
        "status": account.profile_status or "",
        "pronouns": account.profile_pronouns or "",
        "mfa_enabled": bool(account.mfa_enabled),
        "server_count": int(server_count),
    }


def pack_server(server, owner_names, owner_handles, member_count):
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


def find_users(database, text):
    if text.isdigit():
        found = database.query(UserInfo).filter(UserInfo.id == int(text)).first()
        if found:
            return [found]
    exact = database.query(UserInfo).filter(func.lower(UserInfo.username) == text.lower()).first()
    if exact:
        return [exact]
    return (
        database.query(UserInfo)
        .filter(UserInfo.username.ilike("%" + text + "%"))
        .order_by(UserInfo.id.asc())
        .limit(LIST_CAP)
        .all()
    )


def find_servers(database, text):
    found = database.query(Servers).filter(Servers.id == text).first()
    if found:
        return [found]
    slug = database.query(Servers).filter(func.lower(Servers.url_slug) == text.lower()).first()
    if slug:
        return [slug]
    return (
        database.query(Servers)
        .filter(Servers.name.ilike("%" + text + "%"))
        .order_by(Servers.id.asc())
        .limit(LIST_CAP)
        .all()
    )


@router.get("/admin/me")
def admin_me(current_user: UserInfo = Depends(get_current_user)):
    require_oneira_admin(current_user)
    return {
        "id": current_user.id,
        "username": current_user.username,
        "display_name": public_display_name(current_user),
    }


@router.get("/admin/feedback")
def admin_feedback(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    require_oneira_admin(current_user)
    rows = database.query(Feedback_report).order_by(Feedback_report.id.desc()).limit(LIST_CAP).all()
    out = []
    for row in rows:
        out.append({
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
        })
    return {"reports": out}


@router.get("/admin/user")
def admin_user(q: str = "", database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    require_oneira_admin(current_user)
    text = (q or "").strip()
    if text:
        accounts = find_users(database, text)
    else:
        accounts = database.query(UserInfo).order_by(UserInfo.id.asc()).limit(LIST_CAP).all()
    counts = user_server_counts(database, [account.id for account in accounts])
    return {"users": [pack_user(account, counts.get(account.id, 0)) for account in accounts]}


@router.get("/admin/server")
def admin_server(q: str = "", database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    require_oneira_admin(current_user)
    text = (q or "").strip()
    if text:
        matches = find_servers(database, text)
    else:
        matches = database.query(Servers).order_by(Servers.id.asc()).limit(LIST_CAP).all()
    owner_names, owner_handles = owner_maps(database, matches)
    counts = server_member_counts(database, [row.id for row in matches])
    return {
        "servers": [
            pack_server(server, owner_names, owner_handles, counts.get(server.id, 0))
            for server in matches
        ]
    }
