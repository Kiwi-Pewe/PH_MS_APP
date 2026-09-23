from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import UserInfo, Feedback_report, Servers, Server_members
from app.database import get_db
from app.auth import get_current_user
from app.routers.account import public_display_name
from app.r2 import post_attachments_public

router = APIRouter()

FEEDBACK_TYPE_LABELS = {
    "bug": "Bug Report",
    "feature": "Feature Request",
    "inquiry": "General Inquiries",
}


def require_oneira_admin(user):
    if (user.username or "").strip().lower() != "kiwi":
        raise HTTPException(status_code=403, detail="Admin Panel is not available.")
    return user


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
    rows = database.query(Feedback_report).order_by(Feedback_report.id.desc()).limit(50).all()
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
    if not text:
        raise HTTPException(status_code=400, detail="Enter a username or id.")
    matches = []
    if text.isdigit():
        found = database.query(UserInfo).filter(UserInfo.id == int(text)).first()
        if found:
            matches.append(found)
    if not matches:
        exact = database.query(UserInfo).filter(func.lower(UserInfo.username) == text.lower()).first()
        if exact:
            matches.append(exact)
    if not matches:
        matches = database.query(UserInfo).filter(UserInfo.username.ilike("%" + text + "%")).order_by(UserInfo.id.asc()).limit(10).all()
    if not matches:
        raise HTTPException(status_code=404, detail="No account found.")
    out = []
    for account in matches:
        server_count = database.query(func.count(Server_members.id)).filter(Server_members.user_id == account.id).scalar() or 0
        out.append({
            "id": account.id,
            "username": account.username,
            "display_name": public_display_name(account),
            "created_at": str(account.created_at) if account.created_at else None,
            "status": account.profile_status or "",
            "pronouns": account.profile_pronouns or "",
            "mfa_enabled": bool(account.mfa_enabled),
            "server_count": int(server_count),
        })
    return {"users": out}


@router.get("/admin/server")
def admin_server(q: str = "", database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    require_oneira_admin(current_user)
    text = (q or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Enter a server name or id.")
    matches = []
    found = database.query(Servers).filter(Servers.id == text).first()
    if found:
        matches.append(found)
    if not matches:
        slug = database.query(Servers).filter(func.lower(Servers.url_slug) == text.lower()).first()
        if slug:
            matches.append(slug)
    if not matches:
        matches = database.query(Servers).filter(Servers.name.ilike("%" + text + "%")).order_by(Servers.name.asc()).limit(10).all()
    if not matches:
        raise HTTPException(status_code=404, detail="No server found.")
    owner_ids = [row.owner_id for row in matches if row.owner_id]
    owners = database.query(UserInfo).filter(UserInfo.id.in_(owner_ids)).all() if owner_ids else []
    owner_names = {account.id: public_display_name(account) for account in owners}
    owner_handles = {account.id: account.username for account in owners}
    out = []
    for server in matches:
        member_count = database.query(func.count(Server_members.id)).filter(Server_members.server_id == server.id).scalar() or 0
        out.append({
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
        })
    return {"servers": out}
