from datetime import datetime, timedelta
from fastapi import HTTPException
from sqlalchemy import func, or_
from app.models import (
    Account_warn, Active_Sessions, Admin_audit, Announcement_comment, Announcement_post,
    Audit_log, Block_user, Channel_last_viewed, Channel_messages, Conversations,
    Dm_server_pref, Doc_page, Forum_messages, Forum_post, Friend_request, Invite_model,
    Message, Message_mention, Party_members, Party_messages, Perma_ban, Profile_comment,
    Profile_comment_notice, Profile_comment_watch, Server_bans, Server_categories,
    Server_channels, Server_members, Server_role_members, Server_roles, Servers, Site_ban,
    User_notes, UserInfo,
)
from app.r2 import delete_attachment, delete_r2_object

SITE_BAN_DETAIL = "This account is banned from Oneira."
PERMABAN_NOTICE = "A user was banned from Oneira."
REASON_MAX = 500
SITE_BAN_SECONDS = (0, 3600, 86400, 604800, 2592000)
SITE_BAN_LABELS = {
    0: "Permanent",
    3600: "1 hour",
    86400: "1 day",
    604800: "1 week",
    2592000: "30 days",
}
PERM_UNTIL = datetime(9999, 12, 31, 23, 59, 59)


def is_protected_account(user):
    return bool(user) and (user.username or "").strip().lower() == "kiwi"


def refuse_moderate(actor, target):
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    if is_protected_account(target):
        raise HTTPException(status_code=403, detail="This account cannot be warned, banned, or deleted.")
    if actor and actor.id == target.id:
        raise HTTPException(status_code=403, detail="You cannot take this action on your own account.")
    return target


def clip_reason(text, required=False):
    value = (text or "").strip()
    if required and not value:
        raise HTTPException(status_code=400, detail="A reason is required.")
    if len(value) > REASON_MAX:
        raise HTTPException(status_code=400, detail="Reason is too long.")
    return value


def site_ban_active(user):
    until = getattr(user, "banned_until", None) if user else None
    return bool(until and until > datetime.utcnow())


def clear_expired_site_ban(user):
    until = getattr(user, "banned_until", None) if user else None
    if until and until <= datetime.utcnow():
        user.banned_until = None
        user.ban_reason = None
        return True
    return False


def refuse_if_site_banned(user):
    if clear_expired_site_ban(user):
        return user
    if site_ban_active(user):
        raise HTTPException(status_code=403, detail=SITE_BAN_DETAIL)
    return user


def permaban_by_username(database, username):
    key = (username or "").strip().lower()
    if not key:
        return None
    return database.query(Perma_ban).filter(func.lower(Perma_ban.username) == key).first()


def permaban_by_user_id(database, user_id):
    if not user_id:
        return None
    return database.query(Perma_ban).filter(Perma_ban.user_id == user_id).first()


def username_reserved(database, username):
    return bool(permaban_by_username(database, username))


def refuse_if_permabanned_name(database, username):
    if permaban_by_username(database, username):
        raise HTTPException(status_code=403, detail=SITE_BAN_DETAIL)


def permaban_id_set(database, ids):
    clean = [uid for uid in set(ids or []) if uid]
    if not clean:
        return set()
    rows = database.query(Perma_ban.user_id).filter(Perma_ban.user_id.in_(clean)).all()
    return {row[0] for row in rows}


def apply_permaban_payload(payload):
    payload["permaban"] = True
    payload["content"] = PERMABAN_NOTICE
    payload["username"] = ""
    payload["avatar"] = None
    payload["attachment"] = None
    payload["edited"] = False
    payload["reply_to"] = None
    payload["reactions"] = []
    payload["mentioned"] = False
    return payload


def mask_message_payloads(database, payloads, sender_key="sender_id"):
    banned = permaban_id_set(database, [row.get(sender_key) for row in payloads])
    for row in payloads:
        if row.get(sender_key) in banned:
            apply_permaban_payload(row)
        else:
            row.setdefault("permaban", False)
    return payloads


def write_admin_audit(database, actor, action, target=None, target_username="", detail=""):
    database.add(Admin_audit(
        actor_id=actor.id if actor else None,
        actor_username=(actor.username if actor else "") or "",
        action=action,
        target_user_id=target.id if target else None,
        target_username=(target.username if target else target_username) or "",
        detail=detail or "",
    ))


def drop_user_sessions(database, user_id):
    database.query(Active_Sessions).filter(Active_Sessions.account_id == user_id).delete(synchronize_session=False)


def account_warn_count(database, user_id):
    if not user_id:
        return 0
    return int(database.query(func.count(Account_warn.id)).filter(Account_warn.user_id == user_id).scalar() or 0)


def site_ban_count(database, user_id):
    if not user_id:
        return 0
    return int(database.query(func.count(Site_ban.id)).filter(Site_ban.user_id == user_id).scalar() or 0)


def server_ban_count(database, user_id):
    if not user_id:
        return 0
    return int(database.query(func.count(Server_bans.id)).filter(Server_bans.user_id == user_id).scalar() or 0)


def friend_count(database, user_id):
    if not user_id:
        return 0
    return int(
        database.query(func.count(Friend_request.id))
        .filter(
            or_(Friend_request.user_1 == user_id, Friend_request.user_2 == user_id),
            Friend_request.pending == False,
        )
        .scalar() or 0
    )


def wipe_message_row(row):
    if getattr(row, "attachment", None):
        delete_attachment(row.attachment)
    row.content = ""
    row.attachment = None
    if hasattr(row, "edited"):
        row.edited = False


def wipe_user_chat(database, user_id):
    for model, column in (
        (Message, Message.sender_id),
        (Party_messages, Party_messages.sender_id),
        (Channel_messages, Channel_messages.sender_id),
        (Forum_messages, Forum_messages.author_id),
    ):
        rows = database.query(model).filter(column == user_id).all()
        for row in rows:
            wipe_message_row(row)


def wipe_owned_server(database, server):
    cats = database.query(Server_categories).filter(Server_categories.server_id == server.id).all()
    cat_ids = [row.id for row in cats]
    chans = database.query(Server_channels).filter(Server_channels.category_id.in_(cat_ids)).all() if cat_ids else []
    chan_ids = [row.id for row in chans]
    if chan_ids:
        for row in database.query(Channel_messages).filter(Channel_messages.channel_id.in_(chan_ids)).all():
            wipe_message_row(row)
            database.delete(row)
        posts = database.query(Announcement_post).filter(Announcement_post.channel_id.in_(chan_ids)).all()
        for post in posts:
            delete_attachment(post.attachment)
            database.query(Announcement_comment).filter(Announcement_comment.post_id == post.id).delete(synchronize_session=False)
            database.delete(post)
        topics = database.query(Forum_post).filter(Forum_post.channel_id.in_(chan_ids)).all()
        for topic in topics:
            delete_attachment(topic.attachment)
            for row in database.query(Forum_messages).filter(Forum_messages.post_id == topic.id).all():
                wipe_message_row(row)
                database.delete(row)
            database.delete(topic)
        database.query(Doc_page).filter(Doc_page.channel_id.in_(chan_ids)).delete(synchronize_session=False)
        database.query(Channel_last_viewed).filter(Channel_last_viewed.channel_id.in_(chan_ids)).delete(synchronize_session=False)
        database.query(Message_mention).filter(Message_mention.channel_id.in_(chan_ids)).delete(synchronize_session=False)
        for row in chans:
            database.delete(row)
    for row in cats:
        database.delete(row)
    roles = database.query(Server_roles).filter(Server_roles.server_id == server.id).all()
    role_ids = [row.id for row in roles]
    if role_ids:
        database.query(Server_role_members).filter(Server_role_members.role_id.in_(role_ids)).delete(synchronize_session=False)
    for row in roles:
        database.delete(row)
    database.query(Server_members).filter(Server_members.server_id == server.id).delete(synchronize_session=False)
    database.query(Server_bans).filter(Server_bans.server_id == server.id).delete(synchronize_session=False)
    database.query(Invite_model).filter(Invite_model.server_id == server.id).delete(synchronize_session=False)
    database.query(Audit_log).filter(Audit_log.server_id == server.id).delete(synchronize_session=False)
    database.query(Dm_server_pref).filter(Dm_server_pref.server_id == server.id).delete(synchronize_session=False)
    database.query(Message_mention).filter(Message_mention.server_id == server.id).delete(synchronize_session=False)
    if server.icon_key:
        delete_r2_object(server.icon_key)
    if server.banner_key:
        delete_r2_object(server.banner_key)
    database.delete(server)


def remove_user_memberships(database, user_id):
    owned = database.query(Servers).filter(Servers.owner_id == user_id).all()
    for server in owned:
        wipe_owned_server(database, server)
    database.query(Server_members).filter(Server_members.user_id == user_id).delete(synchronize_session=False)
    database.query(Server_role_members).filter(Server_role_members.user_id == user_id).delete(synchronize_session=False)
    database.query(Server_bans).filter(or_(Server_bans.user_id == user_id, Server_bans.actor_id == user_id)).delete(synchronize_session=False)
    database.query(Party_members).filter(Party_members.user_id == user_id).delete(synchronize_session=False)
    database.query(Friend_request).filter(or_(Friend_request.user_1 == user_id, Friend_request.user_2 == user_id)).delete(synchronize_session=False)
    database.query(Block_user).filter(or_(Block_user.initiated_by == user_id, Block_user.blocked_user == user_id)).delete(synchronize_session=False)
    database.query(User_notes).filter(or_(User_notes.author_id == user_id, User_notes.subject_id == user_id)).delete(synchronize_session=False)
    database.query(Dm_server_pref).filter(Dm_server_pref.user_id == user_id).delete(synchronize_session=False)
    database.query(Channel_last_viewed).filter(Channel_last_viewed.user_id == user_id).delete(synchronize_session=False)
    database.query(Message_mention).filter(Message_mention.user_id == user_id).delete(synchronize_session=False)
    database.query(Profile_comment_watch).filter(or_(Profile_comment_watch.owner_id == user_id, Profile_comment_watch.user_id == user_id)).delete(synchronize_session=False)
    database.query(Profile_comment_notice).filter(or_(Profile_comment_notice.user_id == user_id, Profile_comment_notice.owner_id == user_id)).delete(synchronize_session=False)
    database.query(Profile_comment).filter(or_(Profile_comment.owner_id == user_id, Profile_comment.sender_id == user_id)).delete(synchronize_session=False)
    drop_user_sessions(database, user_id)


def delete_account_to_permaban(database, actor, target, reason):
    refuse_moderate(actor, target)
    row = Perma_ban(
        user_id=target.id,
        username=target.username,
        display_name=target.display_name,
        reason=reason or "",
        actor_id=actor.id,
        actor_username=actor.username,
        created_at=datetime.utcnow(),
    )
    database.add(row)
    database.flush()
    wipe_user_chat(database, target.id)
    remove_user_memberships(database, target.id)
    write_admin_audit(database, actor, "delete", target, detail=reason or "")
    database.delete(target)


def warn_account(database, actor, target, reason):
    refuse_moderate(actor, target)
    text = clip_reason(reason, required=True)
    database.add(Account_warn(
        user_id=target.id,
        actor_id=actor.id,
        actor_username=actor.username or "",
        reason=text,
        created_at=datetime.utcnow(),
    ))
    write_admin_audit(database, actor, "warn", target, detail=text)
    return text


def ban_account(database, actor, target, seconds, reason):
    refuse_moderate(actor, target)
    try:
        secs = int(seconds)
    except (TypeError, ValueError):
        secs = -1
    if secs not in SITE_BAN_SECONDS:
        raise HTTPException(status_code=400, detail="Pick a valid ban length.")
    text = clip_reason(reason, required=False)
    if secs == 0:
        until = PERM_UNTIL
        expires_at = None
    else:
        until = datetime.utcnow() + timedelta(seconds=secs)
        expires_at = until
    target.banned_until = until
    target.ban_reason = text or None
    database.add(Site_ban(
        user_id=target.id,
        actor_id=actor.id,
        actor_username=actor.username or "",
        reason=text or "",
        created_at=datetime.utcnow(),
        expires_at=expires_at,
    ))
    drop_user_sessions(database, target.id)
    label = SITE_BAN_LABELS.get(secs, "ban")
    detail = label + ((" — " + text) if text else "")
    write_admin_audit(database, actor, "ban", target, detail=detail)
    return until, expires_at
