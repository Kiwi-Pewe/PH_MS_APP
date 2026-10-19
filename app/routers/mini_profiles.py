from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import UserInfo, User_notes, Servers, Server_members, Account_connection
from app.schemas import Mini_profile_note_in
from app.database import get_db
from app.auth import get_current_user
from app.privacy import accepted_friend_ids
from app.r2 import public_url_for
from app.routers.connections import connection_public, load_steam_playing
from app.routers.profile import (
    STATUS_MAX,
    clip_text,
    ensure_layout,
    member_since_iso,
    normalize_identity,
    public_avatar,
    public_display_name,
)
from app.routers.realtime import presence_status
from app.routers.roles import (
    actor_highest_role,
    assigned_roles_for_user,
    can_manage_target_role,
    can_moderate_target,
    effective_perms_for_user,
    highest_role_for_user,
    list_server_roles,
    seed_server_roles,
)

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
    widgets = store.get("widgets") if isinstance(store.get("widgets"), list) else []
    for tile in widgets:
        if not isinstance(tile, dict) or tile.get("type") != "body":
            continue
        props = tile.get("props") if isinstance(tile.get("props"), dict) else {}
        about = clip_text(props.get("text"), 200).strip()
        if about:
            break
    if not widgets and not about:
        about = clip_text(store.get("text"), 200).strip()
    return banner or DEFAULT_BANNER, about


def mini_person(user):
    if not user:
        return None
    return {
        "id": user.id,
        "username": user.username,
        "display_name": public_display_name(user),
        "avatar": public_avatar(user),
    }


def mini_mutuals(database, owner_id, viewer_id):
    if owner_id == viewer_id:
        return []
    shared = accepted_friend_ids(database, owner_id) & accepted_friend_ids(database, viewer_id)
    if not shared:
        return []
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(list(shared))).all()
    people = [mini_person(row) for row in accounts if row]
    people.sort(key=lambda row: (str(row.get("display_name") or "").lower(), str(row.get("username") or "").lower()))
    return people


def mini_featured_friend(database, owner_id, user_id):
    try:
        other_id = int(user_id or 0)
    except (TypeError, ValueError):
        other_id = 0
    if other_id <= 0 or other_id == owner_id:
        return None
    if other_id not in accepted_friend_ids(database, owner_id):
        return None
    other = database.query(UserInfo).filter(UserInfo.id == other_id).first()
    return mini_person(other)


def mini_featured_server(database, owner_id, server_id):
    code = str(server_id or "").strip().upper()
    if not code:
        return None
    member = database.query(Server_members).filter(
        Server_members.user_id == owner_id,
        Server_members.server_id == code,
    ).first()
    if not member:
        return None
    server = database.query(Servers).filter(Servers.id == code).first()
    if not server:
        return None
    return {
        "id": server.id,
        "name": server.name or "Server",
        "icon_url": public_url_for(server.icon_key) if getattr(server, "icon_key", None) else "",
    }


def mini_connection(database, owner_id, provider):
    slug = str(provider or "").strip().lower()
    if not slug:
        return None
    row = database.query(Account_connection).filter(
        Account_connection.user_id == owner_id,
        Account_connection.provider == slug,
    ).first()
    if not row:
        return None
    return connection_public(row)


def mini_widgets_payload(database, owner, viewer_id, layout):
    store = (layout or {}).get("mini_profile") if isinstance((layout or {}).get("mini_profile"), dict) else {}
    widgets = store.get("widgets") if isinstance(store.get("widgets"), list) else []
    out = []
    steam_playing = None
    mutuals = None
    for tile in widgets:
        if not isinstance(tile, dict):
            continue
        kind = str(tile.get("type") or "")
        props = tile.get("props") if isinstance(tile.get("props"), dict) else {}
        live = None
        if kind == "steam_playing_now":
            if steam_playing is None:
                steam_playing = load_steam_playing(database, owner.id)
            live = steam_playing
        elif kind == "mutuals":
            if mutuals is None:
                mutuals = mini_mutuals(database, owner.id, viewer_id)
            live = {"people": mutuals, "total": len(mutuals)}
        elif kind == "featured_friend":
            live = mini_featured_friend(database, owner.id, props.get("user_id"))
        elif kind == "featured_server":
            live = mini_featured_server(database, owner.id, props.get("server_id"))
        elif kind == "connections":
            live = mini_connection(database, owner.id, props.get("provider"))
        elif kind == "member_since":
            live = {"member_since": member_since_iso(owner)}
        out.append({
            "id": tile.get("id"),
            "type": kind,
            "props": props,
            "live": live,
        })
        if len(out) >= 3:
            break
    return out


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
    banner, _about = layout_banner_and_about(layout)
    is_self = current_user.id == owner.id
    payload = {
        "user": {
            "id": owner.id,
            "username": owner.username,
            "display_name": public_display_name(owner),
            "status": clip_text(owner.profile_status, STATUS_MAX),
            "pronouns": clip_text(owner.profile_pronouns, 32),
            "member_since": member_since_iso(owner),
        },
        "banner_color": banner,
        "identity": normalize_identity((layout or {}).get("identity")),
        "presence": presence_status(owner.id),
        "is_self": is_self,
        "note": "" if is_self else load_note(database, current_user.id, owner.id),
        "widgets": mini_widgets_payload(database, owner, current_user.id, layout),
        "in_server": False,
        "can_assign": False,
        "highest_role": None,
        "roles": [],
        "assignable": [],
        "removable_ids": [],
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
    is_owner = server.owner_id == current_user.id
    is_self = current_user.id == owner.id
    manage_roles = False
    if not is_owner:
        manage_roles = bool(effective_perms_for_user(database, server, current_user.id).get("manage_roles"))
    actor_highest = actor_highest_role(database, server, current_user.id)
    assignable = []
    removable_ids = []
    for role in list_server_roles(database, server.id):
        if role.get("is_members"):
            continue
        if is_owner:
            can_touch = True
        elif manage_roles and not is_self and can_moderate_target(database, server, current_user.id, owner.id):
            can_touch = can_manage_target_role(False, actor_highest, role)
        else:
            can_touch = is_self and role.get("self_assignable")
        if not can_touch:
            continue
        if role["id"] in assigned_ids:
            removable_ids.append(role["id"])
        else:
            assignable.append(role)
    payload.update({
        "in_server": True,
        "can_assign": bool(assignable),
        "highest_role": highest_role_for_user(database, server.id, owner.id),
        "roles": assigned,
        "assignable": assignable,
        "removable_ids": removable_ids,
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