from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import UserInfo, Block_user, Server_members, Servers, Dm_server_pref
from app.schemas import Messaging_friend_prefs, Messaging_dms_pref, Notification_sound_prefs, Notification_reaction_pref
from app.database import get_db
from app.auth import get_current_user
from app.privacy import flag_on, dms_allowed_on_server

router = APIRouter()

def bool_flag(user, name):
    return flag_on(user, name, True)

@router.get("/messaging_settings")
def get_messaging_settings(current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    member_rows = database.query(Server_members).filter(Server_members.user_id == current_user.id).order_by(Server_members.position).all()
    servers = []
    for member in member_rows:
        server = database.query(Servers).filter(Servers.id == member.server_id).first()
        if not server:
            continue
        servers.append({
            "id": server.id,
            "name": server.name,
            "allow_dms": dms_allowed_on_server(database, current_user, server.id),
            "overridden": database.query(Dm_server_pref).filter(Dm_server_pref.user_id == current_user.id, Dm_server_pref.server_id == server.id).first() is not None,
        })
    blocked_rows = database.query(Block_user).filter(Block_user.initiated_by == current_user.id).all()
    blocked = []
    for row in blocked_rows:
        account = database.query(UserInfo).filter(UserInfo.id == row.blocked_user).first()
        if account:
            blocked.append({"id": account.id, "username": account.username, "display_name": account.display_name or account.username})
    return {
        "friend_req_everyone": bool_flag(current_user, "friend_req_everyone"),
        "friend_req_friends_of_friends": bool_flag(current_user, "friend_req_friends_of_friends"),
        "friend_req_server_members": bool_flag(current_user, "friend_req_server_members"),
        "allow_server_dms": bool_flag(current_user, "allow_server_dms"),
        "servers": servers,
        "blocked": blocked,
    }

@router.post("/messaging_friend_requests")
def update_messaging_friend_requests(prefs: Messaging_friend_prefs, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    current_user.friend_req_everyone = bool(prefs.everyone)
    current_user.friend_req_friends_of_friends = bool(prefs.friends_of_friends)
    current_user.friend_req_server_members = bool(prefs.server_members)
    database.commit()
    return {
        "friend_req_everyone": bool(current_user.friend_req_everyone),
        "friend_req_friends_of_friends": bool(current_user.friend_req_friends_of_friends),
        "friend_req_server_members": bool(current_user.friend_req_server_members),
    }

@router.post("/messaging_server_dms")
def update_messaging_server_dms(pref: Messaging_dms_pref, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    server_id = (pref.server_id or "").strip()
    if not server_id or server_id == "all":
        current_user.allow_server_dms = bool(pref.allow)
        database.commit()
        return {"server_id": "all", "allow": bool(current_user.allow_server_dms)}
    member = database.query(Server_members).filter(Server_members.user_id == current_user.id, Server_members.server_id == server_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Server not found.")
    row = database.query(Dm_server_pref).filter(Dm_server_pref.user_id == current_user.id, Dm_server_pref.server_id == server_id).first()
    if not row:
        row = Dm_server_pref(user_id=current_user.id, server_id=server_id, allow_dms=bool(pref.allow))
        database.add(row)
    else:
        row.allow_dms = bool(pref.allow)
    database.commit()
    return {"server_id": server_id, "allow": bool(row.allow_dms)}

REACTION_NOTIFY = ("all", "dms", "off")

def reaction_notify_value(user):
    value = (user.notify_reactions or "").strip()
    if value in REACTION_NOTIFY:
        return value
    return "all"

@router.get("/notification_settings")
def get_notification_settings(current_user: UserInfo = Depends(get_current_user)):
    return {
        "sound_message": flag_on(current_user, "notify_sound_message", True),
        "sound_current_channel": bool(current_user.notify_sound_current) if current_user.notify_sound_current is not None else False,
        "sound_incoming_ring": flag_on(current_user, "notify_sound_ring", True),
        "sound_mute_all": bool(current_user.notify_sound_mute_all) if current_user.notify_sound_mute_all is not None else False,
        "notify_reactions": reaction_notify_value(current_user),
    }

@router.post("/notification_sounds")
def update_notification_sounds(prefs: Notification_sound_prefs, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    current_user.notify_sound_message = bool(prefs.message)
    current_user.notify_sound_current = bool(prefs.current_channel)
    current_user.notify_sound_ring = bool(prefs.incoming_ring)
    current_user.notify_sound_mute_all = bool(prefs.mute_all)
    database.commit()
    return {
        "sound_message": bool(current_user.notify_sound_message),
        "sound_current_channel": bool(current_user.notify_sound_current),
        "sound_incoming_ring": bool(current_user.notify_sound_ring),
        "sound_mute_all": bool(current_user.notify_sound_mute_all),
    }

@router.post("/notification_reactions")
def update_notification_reactions(pref: Notification_reaction_pref, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    value = (pref.value or "").strip()
    if value not in REACTION_NOTIFY:
        raise HTTPException(status_code=400, detail="Pick a valid reaction notification option.")
    current_user.notify_reactions = value
    database.commit()
    return {"notify_reactions": value}
