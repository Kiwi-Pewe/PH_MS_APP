from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.models import Friend_request, Server_members, Dm_server_pref, UserInfo

def flag_on(user, name, default=True):
    value = getattr(user, name, None)
    if value is None:
        return default
    return bool(value)

def accepted_friend_ids(database: Session, user_id):
    rows = database.query(Friend_request).filter(
        or_(Friend_request.user_1 == user_id, Friend_request.user_2 == user_id),
        Friend_request.pending == False
    ).all()
    out = set()
    for row in rows:
        out.add(row.user_2 if row.user_1 == user_id else row.user_1)
    return out

def are_friends(database: Session, user_a, user_b):
    return user_b in accepted_friend_ids(database, user_a)

def shared_server_ids(database: Session, user_a, user_b):
    mine = {row.server_id for row in database.query(Server_members).filter(Server_members.user_id == user_a).all()}
    theirs = {row.server_id for row in database.query(Server_members).filter(Server_members.user_id == user_b).all()}
    return mine & theirs

def dms_allowed_on_server(database: Session, user: UserInfo, server_id):
    row = database.query(Dm_server_pref).filter(Dm_server_pref.user_id == user.id, Dm_server_pref.server_id == server_id).first()
    if row is not None:
        return bool(row.allow_dms)
    return flag_on(user, "allow_server_dms", True)

def can_send_dm(database: Session, sender_id, recipient: UserInfo):
    if are_friends(database, sender_id, recipient.id):
        return True
    for server_id in shared_server_ids(database, sender_id, recipient.id):
        if dms_allowed_on_server(database, recipient, server_id):
            return True
    return False

def can_send_friend_request(database: Session, sender_id, recipient: UserInfo):
    if flag_on(recipient, "friend_req_everyone", True):
        return True
    if flag_on(recipient, "friend_req_friends_of_friends", True):
        if accepted_friend_ids(database, sender_id) & accepted_friend_ids(database, recipient.id):
            return True
    if flag_on(recipient, "friend_req_server_members", True):
        for server_id in shared_server_ids(database, sender_id, recipient.id):
            if dms_allowed_on_server(database, recipient, server_id):
                return True
    return False
