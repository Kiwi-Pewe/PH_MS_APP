from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import UserInfo, User_notes, Servers, Server_members
from app.schemas import Mini_profile_note_in
from app.database import get_db
from app.auth import get_current_user
from app.routers.profile import STATUS_MAX, clip_text, ensure_layout, normalize_identity, public_display_name
from app.routers.realtime import presence_status
from app.routers.roles import assigned_roles_for_user, highest_role_for_user, list_server_roles, seed_server_roles

router = APIRouter()

NOTE_MAX = 256
DEFAULT_BANNER = "#1e6b8a"


def layout_banner_and_about(layout):
    banner = ""
    about = ""
    for page in (layout or {}).get("pages") or []:
        for tile in page.get("tiles") or []:
            props = tile.get("props") or {}
            if tile.get("type") == "banner" and not banner:
                banner = (props.get("color") or "").strip()
            if tile.get("type") == "bio" and not about:
                about = clip_text(props.get("text"), 300).strip()
    store = (layout or {}).get("mini_profile") if isinstance((layout or {}).get("mini_profile"), dict) else {}
    if not about:
        about = clip_text(store.get("text"), 300).strip()
    return banner or DEFAULT_BANNER, about


def load_note(database, author_id, subject_id):
    row = database.query(User_notes).filter(
        User_notes.author_id == author_id,
        User_notes.subject_id == subject_id,
    ).first()
    return clip_text(row.text, NOTE_MAX) if row else ""


@router.get("/mini_profile/{user_id}")
def get_mini_profile(user_id: int, server_id: str | None = None, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    owner = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    if not owner:
        raise HTTPException(status_code=404, detail="User not found.")
    layout = ensure_layout(owner, database)
    banner, about = layout_banner_and_about(layout)
    is_self = current_user.id == owner.id
    payload = {
        "user": {
            "id": owner.id,
            "username": owner.username,
            "display_name": public_display_name(owner),
            "status": clip_text(owner.profile_status, STATUS_MAX),
            "pronouns": clip_text(owner.profile_pronouns, 32),
        },
        "banner_color": banner,
        "about": about,
        "identity": normalize_identity((layout or {}).get("identity")),
        "presence": presence_status(owner.id),
        "is_self": is_self,
        "note": "" if is_self else load_note(database, current_user.id, owner.id),
        "in_server": False,
        "can_assign": False,
        "highest_role": None,
        "roles": [],
        "assignable": [],
    }
    if not server_id:
        return payload

    server = database.query(Servers).filter(Servers.id == server_id).first()
    if not server:
        return payload
    viewer_in = database.query(Server_members).filter(
        Server_members.server_id == server.id,
        Server_members.user_id == current_user.id,
    ).first()
    target_in = database.query(Server_members).filter(
        Server_members.server_id == server.id,
        Server_members.user_id == owner.id,
    ).first()
    if not viewer_in or not target_in:
        return payload

    seed_server_roles(database, server.id)
    database.commit()
    assigned = assigned_roles_for_user(database, server.id, owner.id)
    assigned_ids = {role["id"] for role in assigned}
    can_assign = server.owner_id == current_user.id
    assignable = []
    if can_assign:
        for role in list_server_roles(database, server.id):
            if role.get("is_members"):
                continue
            if role["id"] in assigned_ids:
                continue
            assignable.append(role)
    payload.update({
        "in_server": True,
        "can_assign": can_assign,
        "highest_role": highest_role_for_user(database, server.id, owner.id),
        "roles": assigned,
        "assignable": assignable,
    })
    return payload


@router.post("/mini_profile_note")
def save_mini_profile_note(body: Mini_profile_note_in, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    if body.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot note yourself.")
    subject = database.query(UserInfo).filter(UserInfo.id == body.user_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="User not found.")
    text = clip_text(body.text, NOTE_MAX).strip()
    row = database.query(User_notes).filter(
        User_notes.author_id == current_user.id,
        User_notes.subject_id == subject.id,
    ).first()
    if not text:
        if row:
            database.delete(row)
            database.commit()
        return {"ok": True, "note": ""}
    if row:
        row.text = text
    else:
        database.add(User_notes(author_id=current_user.id, subject_id=subject.id, text=text))
    database.commit()
    return {"ok": True, "note": text}