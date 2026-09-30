import html
import re
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Server_roles, Announcement_post, Announcement_comment, Channel_follow
from app.schemas import Announcements, Comment_create, Edit_announcement, Announcement_channel_settings, Channel_follow_body
from app.database import get_db
from app.auth import get_current_user
from app.r2 import delete_attachment, delete_r2_object, normalize_post_attachments, post_attachments_public, require_post_body, store_post_attachments
from app.routers.mentions import apply_server_text_mentions, decorate_ids, mention_user_map, mention_role_map, mentioned_user_ids, clear_mentions, write_mentions, server_allows_everyone
from app.routers.realtime import server_broadcast
from app.routers.profile import avatar_lookup, public_avatar
from app.routers.roles import effective_perms_for_user_in_channel, name_color_role_for_user, name_color_roles_by_user, require_channel_perm, require_channel_slowmode
from app.routers.deletion import write_audit_log
from app.routers.reactions import clear_reactions, reactions_for_messages
from app.routers.pins import clear_pins
from app.routers.feed import notify_activity_post_comment

router = APIRouter()


PUBLIC_MARKUP_RE = re.compile(r"<@((?:everyone|here|&\d+|\d+))>|<\#(\d+)>")


def blog_privacy_ok(server):
    mode = (getattr(server, "privacy_mode", None) or "private").strip().lower()
    return mode in ("default", "open")


def announcement_is_public(channel, server):
    return bool(
        getattr(channel, "announce_public", False)
        and getattr(channel, "blog_enabled", False)
        and blog_privacy_ok(server)
    )


def announcement_query(database, channel_id, q):
    base = database.query(Announcement_post).filter(Announcement_post.channel_id == channel_id)
    text = (q or "").strip()
    if not text:
        return base
    like = f"%{text}%"
    comment_ids = database.query(Announcement_comment.post_id).filter(Announcement_comment.content.ilike(like))
    return base.filter(or_(
        Announcement_post.title.ilike(like),
        Announcement_post.body.ilike(like),
        Announcement_post.id.in_(comment_ids),
    ))


def require_view_announcements(database, server, user_id, channel_id):
    return require_channel_perm(database, server, user_id, channel_id, "view_announcements", "You do not have permission to view announcements.")


def can_remove_announcement(database, server, user_id, sender_id, channel_id):
    perms = effective_perms_for_user_in_channel(database, server, user_id, channel_id)
    if perms.get("manage_announcements"):
        return True
    return user_id == sender_id and bool(perms.get("create_announcements"))


def can_edit_own_announcement(database, server, user_id, channel_id):
    perms = effective_perms_for_user_in_channel(database, server, user_id, channel_id)
    return bool(perms.get("create_announcements") or perms.get("manage_announcements"))


@router.post("/post_announcement")
async def create_post(announcement: Announcements, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel_found = database.query(Server_channels).filter(Server_channels.id == announcement.channel_id).first()
    if not channel_found or not channel_found.channel_type == "announcements":
        raise HTTPException(status_code= 404, detail= "No channel found")

    category = database.query(Server_categories).filter(Server_categories.id == channel_found.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    require_channel_perm(database, server, current_user.id, channel_found.id, "create_announcements", "You do not have permission to create announcements.")
    require_channel_slowmode(database, server, current_user.id, channel_found)

    items = normalize_post_attachments(announcement.attachments, announcement.attachment)
    require_post_body(announcement.title, announcement.body, items)
    attachment_json = store_post_attachments(items, current_user)

    new_post = Announcement_post(
        channel_id = announcement.channel_id,
        title = announcement.title.strip(),
        body = (announcement.body or "").strip(),
        sender_id = current_user.id,
        attachment = attachment_json,
    )
    database.add(new_post)
    database.flush()
    new_post.body = apply_server_text_mentions(database, new_post.body, "announcement", new_post.id, server, channel_found.id, seed= True, sender_id= current_user.id)
    new_post.is_public = announcement_is_public(channel_found, server)
    if announcement.notify_all:
        if not server_allows_everyone(database, server, current_user.id, channel_found.id):
            raise HTTPException(status_code=403, detail="You cannot notify all members.")
        member_ids = [row.user_id for row in database.query(Server_members).filter(Server_members.server_id == server.id).all()]
        targets = set(mentioned_user_ids(database, "announcement", new_post.id))
        targets.update(user_id for user_id in member_ids if user_id != current_user.id)
        write_mentions(database, "announcement", new_post.id, targets, server_id=server.id, channel_id=channel_found.id)
    database.commit()
    database.refresh(new_post)
    public_attachment = post_attachments_public(new_post.attachment)
    users_map = mention_user_map(database, new_post.body)
    roles_map = mention_role_map(database, new_post.body)
    pinged_ids = mentioned_user_ids(database, "announcement", new_post.id)
    payload = {
        "type": "announcement_created",
        "server_id": server.id,
        "post": {"id": new_post.id, "channel_id": new_post.channel_id,"title": new_post.title, "body": new_post.body, "attachment": public_attachment, "created_at": str(new_post.created_at), "sender_id": current_user.id, "username": current_user.username, "avatar": public_avatar(current_user), "reactions": [], "edited": False, "is_public": bool(new_post.is_public), "mention_users": users_map, "mention_roles": roles_map, "mentioned_ids": pinged_ids, "name_role": name_color_role_for_user(database, server.id, current_user.id)}
        }
    await server_broadcast(server_id= server.id, payload= payload, database= database, exclude_user_id= current_user.id)
    await fan_out_followed_announcement(database, new_post, current_user)
    return {"channel_type": channel_found.channel_type, "name": channel_found.name, "id": new_post.id, "title": new_post.title, "body": new_post.body, "attachment": public_attachment, "edited": False, "is_public": bool(new_post.is_public), "mention_users": users_map, "mention_roles": roles_map}

@router.get("/get_announcement/{channel_id}")
def get_announcement_posts(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user), before_id = None, around_id: int = None, q: str = None):
    correct_channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not correct_channel or not correct_channel.channel_type == "announcements":
        raise HTTPException(status_code=404, detail="Channel not found")

    category = database.query(Server_categories).filter(Server_categories.id == correct_channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.user_id == current_user.id, Server_members.server_id == server.id).first()

    if not is_member:
        raise HTTPException(status_code=404, detail="Membership not found")
    require_view_announcements(database, server, current_user.id, correct_channel.id)

    around_mode = False
    posts = announcement_query(database, channel_id, q)
    if around_id and not (q or "").strip():
        target = posts.filter(Announcement_post.id == around_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="Post not found")
        before = posts.filter(Announcement_post.id < around_id).order_by(Announcement_post.created_at.desc()).limit(12).all()
        after = posts.filter(Announcement_post.id > around_id).order_by(Announcement_post.created_at.asc()).limit(12).all()
        post_history = list(reversed(before)) + [target] + after
        around_mode = True
    elif before_id:
        post_history = posts.filter(Announcement_post.id < before_id).order_by(Announcement_post.created_at.desc()).limit(25).all()
    else:
        post_history = posts.order_by(Announcement_post.created_at.desc()).limit(25).all()

    sender_ids = list({post.sender_id for post in post_history})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(sender_ids)).all() if sender_ids else []
    username_lookup = {account.id: account.username for account in accounts}
    faces = avatar_lookup(accounts)
    reaction_map = reactions_for_messages(database, "announcement", [post.id for post in post_history], current_user.id)
    mention_meta = decorate_ids(database, "announcement", [post.id for post in post_history], [post.body for post in post_history], current_user.id)
    name_map = name_color_roles_by_user(database, server.id, sender_ids)

    recent_post = []
    for index, post in enumerate(post_history):
        recent_post.append({
            "id": post.id,
            "sender_id": post.sender_id,
            "username": username_lookup[post.sender_id],
            "avatar": faces.get(post.sender_id),
            "name_role": name_map.get(post.sender_id),
            "title": post.title,
            "body": post.body,
            "attachment": post_attachments_public(post.attachment),
            "created_at": str(post.created_at),
            "comment_count": post.comment_count,
            "reactions": reaction_map.get(post.id, []),
            "edited": bool(post.edited),
            "is_public": bool(getattr(post, "is_public", False)),
            "mentioned": mention_meta[index]["mentioned"],
            "mention_users": mention_meta[index]["mention_users"],
            "mention_roles": mention_meta[index]["mention_roles"],
        })

    if not around_mode:
        recent_post.reverse()
    return {"server_name": server.name, "server_id": server.id, "channel_id": channel_id, "session_username": current_user.username, "posts": recent_post}

@router.get("/server_overview/{server_id}")
def server_overview(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = database.query(Servers).filter(Servers.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Server not found")
    from app.routers.roles import channel_type_visible
    is_owner = server.owner_id == current_user.id
    channel_names = {}
    categories = database.query(Server_categories).filter(Server_categories.server_id == server.id).all()
    for category in categories:
        if category.is_private and not is_owner:
            continue
        channels = database.query(Server_channels).filter(
            Server_channels.category_id == category.id,
            Server_channels.channel_type == "announcements",
        ).all()
        for channel in channels:
            if channel.is_private and not is_owner:
                continue
            perms = effective_perms_for_user_in_channel(database, server, current_user.id, channel.id)
            if not channel_type_visible(perms, channel.channel_type):
                continue
            channel_names[channel.id] = channel.name or "announcements"
    if not channel_names:
        return {"server_name": server.name, "posts": []}
    rows = database.query(Announcement_post).filter(
        Announcement_post.channel_id.in_(list(channel_names.keys()))
    ).order_by(Announcement_post.created_at.desc(), Announcement_post.id.desc()).limit(25).all()
    sender_ids = list({row.sender_id for row in rows if row.sender_id})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(sender_ids)).all() if sender_ids else []
    names = {account.id: account.username for account in accounts}
    faces = avatar_lookup(accounts)
    posts = []
    for row in rows:
        posts.append({
            "id": row.id,
            "channel_id": row.channel_id,
            "channel_name": channel_names.get(row.channel_id, ""),
            "title": row.title or "",
            "body": row.body or "",
            "sender_id": row.sender_id,
            "username": names.get(row.sender_id, ""),
            "avatar": faces.get(row.sender_id),
            "created_at": str(row.created_at) if row.created_at else None,
        })
    return {"server_name": server.name, "posts": posts}


@router.post("/post_comment")
async def post_comment(comment: Comment_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    announcement = database.query(Announcement_post).filter(Announcement_post.id == comment.post_id).first()
    if not announcement:
        raise HTTPException(status_code=404, detail="post not found")

    channel = database.query(Server_channels).filter(Server_channels.id == announcement.channel_id).first()
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()

    if not is_member:
        raise HTTPException(status_code=404, detail="membership not found")
    require_view_announcements(database, server, current_user.id, channel.id)
    from app.routers.moderation import require_not_timed_out
    require_not_timed_out(is_member)

    new_comment = Announcement_comment(
        post_id = announcement.id,
        sender_id = current_user.id,
        content = comment.content
    )
    announcement.comment_count += 1
    database.add(new_comment)
    database.flush()
    new_comment.content = apply_server_text_mentions(database, new_comment.content, "comment", new_comment.id, server, channel.id, seed= True, sender_id= current_user.id)
    database.commit()
    database.refresh(new_comment)
    users_map = mention_user_map(database, new_comment.content)
    roles_map = mention_role_map(database, new_comment.content)
    pinged_ids = mentioned_user_ids(database, "comment", new_comment.id)
    payload = {
        "type": "announcement_comment",
        "post_id": comment.post_id,
        "channel_id": channel.id,
        "server_id": server.id,
        "comment": {"id": new_comment.id, "post_id": new_comment.post_id, "sender_id": current_user.id, "username": current_user.username, "avatar": public_avatar(current_user), "content": new_comment.content, "created_at": str(new_comment.created_at), "comment_count": announcement.comment_count, "reactions": [], "mention_users": users_map, "mention_roles": roles_map, "mentioned_ids": pinged_ids, "name_role": name_color_role_for_user(database, server.id, current_user.id)}
    }
    await server_broadcast(server_id= server.id, payload= payload, database= database, exclude_user_id= current_user.id)
    if announcement.sender_id:
        await notify_activity_post_comment(
            database,
            receiver_id=announcement.sender_id,
            actor_id=current_user.id,
            post_kind="announcement",
            post_id=announcement.id,
            server_id=server.id,
        )
    return {"id": new_comment.id, "content": new_comment.content, "created_at": str(new_comment.created_at), "comment_count": announcement.comment_count, "reactions": [], "mention_users": users_map, "mention_roles": roles_map}

@router.get("/get_post_comment/{post_id}")
def get_post_comments(post_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user), after_id: int = None, limit: int = 3):
    comment = database.query(Announcement_post).filter(Announcement_post.id == post_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Post not found")

    channel = database.query(Server_channels).filter(Server_channels.id == comment.channel_id).first()
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()

    if not is_member:
        raise HTTPException(status_code=404, detail="membership not found")
    require_view_announcements(database, server, current_user.id, channel.id)

    if after_id:
        comment_history = database.query(Announcement_comment).filter(Announcement_comment.post_id == post_id, Announcement_comment.id > after_id).order_by(Announcement_comment.id.asc()).limit(limit).all()
    else:
        comment_history = database.query(Announcement_comment).filter(Announcement_comment.post_id == post_id).order_by(Announcement_comment.id.asc()).limit(limit).all()
     
    sender_ids = list({user.sender_id for user in comment_history})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(sender_ids)).all()
    username_lookup = {account.id: account.username for account in accounts}
    faces = avatar_lookup(accounts)
    reaction_map = reactions_for_messages(database, "comment", [user_comment.id for user_comment in comment_history], current_user.id)
    mention_meta = decorate_ids(database, "comment", [user_comment.id for user_comment in comment_history], [user_comment.content for user_comment in comment_history], current_user.id)
    name_map = name_color_roles_by_user(database, server.id, sender_ids)

    picked_comments = []
    for index, user_comment in enumerate(comment_history):
        picked_comments.append({
            "id": user_comment.id,
            "post_id": user_comment.post_id,
            "sender_id": user_comment.sender_id,
            "content": user_comment.content,
            "username": username_lookup[user_comment.sender_id],
            "avatar": faces.get(user_comment.sender_id),
            "name_role": name_map.get(user_comment.sender_id),
            "created_at": str(user_comment.created_at),
            "reactions": reaction_map.get(user_comment.id, []),
            "mentioned": mention_meta[index]["mentioned"],
            "mention_users": mention_meta[index]["mention_users"],
            "mention_roles": mention_meta[index]["mention_roles"],
        })

    return {"post_id": post_id, "comments": picked_comments}

@router.post("/delete_comment/{comment_id}")
async def delete_comment(comment_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    comment_exist = database.query(Announcement_comment).filter(Announcement_comment.id == comment_id).first()
    if not comment_exist:
        raise HTTPException(status_code=404, detail="comment doesn't exist")

    post = database.query(Announcement_post).filter(Announcement_post.id == comment_exist.post_id).first()
    channel = database.query(Server_channels).filter(Server_channels.id == post.channel_id).first()
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()

    if not is_member:
        raise HTTPException(status_code=404, detail="User is not a member")
    if current_user.id != comment_exist.sender_id and current_user.id != server.owner_id:
        raise HTTPException(status_code= 403, detail="Not authorized to delete comment")

    author = database.query(UserInfo).filter(UserInfo.id == comment_exist.sender_id).first()
    write_audit_log(database, server.id, current_user.id, "delete_comment", "announcement_comment", comment_exist.id, {
        "content": comment_exist.content,
        "author_id": comment_exist.sender_id,
        "author_username": author.username if author else None,
        "post_id": post.id
    })
    clear_reactions(database, "comment", comment_exist.id)
    clear_pins(database, "comment", comment_exist.id)
    clear_mentions(database, "comment", comment_exist.id)
    database.delete(comment_exist)
    post.comment_count -= 1
    database.commit()

    payload = {
        "type": "comment_deleted",
        "post_id": post.id,
        "comment_id": comment_exist.id,
        "comment_count": post.comment_count
    }

    await server_broadcast(server_id=server.id, payload= payload, database=database, exclude_user_id=current_user.id)
    return {"comment_id": comment_exist.id, "comment_count": post.comment_count}

@router.post("/delete_post/{post_id}")
async def delete_post(post_id: int,database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    post_exist = database.query(Announcement_post).filter(Announcement_post.id == post_id).first()
    if not post_exist:
        raise HTTPException(status_code=404, detail="Post not found")

    channel = database.query(Server_channels).filter(Server_channels.id == post_exist.channel_id).first()
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.user_id == current_user.id, Server_members.server_id == server.id).first()

    if not is_member:
        raise HTTPException(status_code=404, detail="User is not a member")
    if not can_remove_announcement(database, server, current_user.id, post_exist.sender_id, channel.id):
        raise HTTPException(status_code=403, detail="You do not have permission to delete this announcement.")

    author = database.query(UserInfo).filter(UserInfo.id == post_exist.sender_id).first()
    write_audit_log(database, server.id, current_user.id, "delete_post", "announcement_post", post_exist.id, {
        "title": post_exist.title,
        "body": post_exist.body,
        "author_id": post_exist.sender_id,
        "author_username": author.username if author else None,
        "channel_id": channel.id
    })
    all_comments = database.query(Announcement_comment).filter(Announcement_comment.post_id == post_id).all()

    for comment in all_comments:
        clear_reactions(database, "comment", comment.id)
        clear_pins(database, "comment", comment.id)
        clear_mentions(database, "comment", comment.id)
        database.delete(comment)

    clear_reactions(database, "announcement", post_id)
    clear_pins(database, "announcement", post_id)
    clear_mentions(database, "announcement", post_id)
    delete_attachment(post_exist.attachment)
    database.delete(post_exist)
    database.commit()
    payload = {
       "type": "announcement_deleted",
       "channel_id": channel.id,
       "post_id": post_id
    }

    await server_broadcast(server_id = server.id, payload=payload, database=database, exclude_user_id=current_user.id)
    return {"post_id": post_id}

@router.post("/edit_announcement")
async def edit_announcement(edit: Edit_announcement, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    post = database.query(Announcement_post).filter(Announcement_post.id == edit.post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    channel = database.query(Server_channels).filter(Server_channels.id == post.channel_id).first()
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.user_id == current_user.id, Server_members.server_id == server.id).first()
    if not is_member:
        raise HTTPException(status_code=404, detail="User is not a member")
    if current_user.id != post.sender_id:
        raise HTTPException(status_code=403, detail="Not authorized to edit post")
    if not can_edit_own_announcement(database, server, current_user.id, channel.id):
        raise HTTPException(status_code=403, detail="You do not have permission to edit this announcement.")

    title = edit.title.strip()
    body = (edit.body or "").strip()
    items = normalize_post_attachments(edit.attachments, None)
    require_post_body(title, body, items)

    old_keys = [item.get("key") for item in post_attachments_public(post.attachment) if item.get("key")]
    new_keys = [item.key for item in items]
    tokenized = apply_server_text_mentions(database, body, "announcement", post.id, server, post.channel_id)
    same = (post.title or "") == title and (post.body or "") == tokenized and old_keys == new_keys
    if same:
        database.commit()
        return {"id": post.id, "title": post.title, "body": post.body, "attachment": post_attachments_public(post.attachment), "edited": bool(post.edited), "unchanged": True, "mention_users": mention_user_map(database, post.body), "mention_roles": mention_role_map(database, post.body)}

    for key in set(old_keys) - set(new_keys):
        delete_r2_object(key)

    post.title = title
    post.body = tokenized
    post.attachment = store_post_attachments(items, current_user)
    post.edited = True
    database.commit()
    public_attachment = post_attachments_public(post.attachment)
    users_map = mention_user_map(database, post.body)
    roles_map = mention_role_map(database, post.body)
    payload = {
        "type": "announcement_edited",
        "channel_id": post.channel_id,
        "post_id": post.id,
        "title": post.title,
        "body": post.body,
        "attachment": public_attachment,
        "edited": True,
        "mention_users": users_map,
        "mention_roles": roles_map
    }
    await server_broadcast(server_id= server.id, payload= payload, database= database, exclude_user_id= current_user.id)
    return {"id": post.id, "title": post.title, "body": post.body, "attachment": public_attachment, "edited": True, "unchanged": False, "mention_users": users_map, "mention_roles": roles_map}


def load_joined_announcement(database, channel_id, user_id, perm=None):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel or channel.channel_type != "announcements":
        raise HTTPException(status_code=404, detail="Channel not found")
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first() if category else None
    if not server:
        raise HTTPException(status_code=404, detail="Channel not found")
    member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == user_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Channel not found")
    is_owner = server.owner_id == user_id
    if (category.is_private or channel.is_private) and not is_owner:
        raise HTTPException(status_code=404, detail="Channel not found")
    if perm:
        require_channel_perm(database, server, user_id, channel.id, perm, "You do not have permission to manage this channel.")
    else:
        require_view_announcements(database, server, user_id, channel.id)
    return channel, server


def visible_follow_sources(database, user):
    from app.routers.roles import channel_type_visible
    found = []
    memberships = database.query(Server_members).filter(Server_members.user_id == user.id).all()
    for member in memberships:
        server = database.query(Servers).filter(Servers.id == member.server_id).first()
        if not server:
            continue
        is_owner = server.owner_id == user.id
        categories = database.query(Server_categories).filter(Server_categories.server_id == server.id).all()
        for category in categories:
            if category.is_private and not is_owner:
                continue
            channels = database.query(Server_channels).filter(
                Server_channels.category_id == category.id,
                Server_channels.channel_type == "announcements",
            ).all()
            for channel in channels:
                if channel.is_private and not is_owner:
                    continue
                perms = effective_perms_for_user_in_channel(database, server, user.id, channel.id)
                if not channel_type_visible(perms, "announcements"):
                    continue
                found.append({
                    "channel_id": channel.id,
                    "channel_name": channel.name or "announcements",
                    "server_name": server.name or "Server",
                })
    found.sort(key=lambda row: ((row["server_name"] or "").lower(), (row["channel_name"] or "").lower(), row["channel_id"]))
    return found


async def fan_out_followed_announcement(database, source_post, author):
    follows = database.query(Channel_follow).filter(Channel_follow.source_channel_id == source_post.channel_id).all()
    copies = []
    for follow in follows:
        dest = database.query(Server_channels).filter(Server_channels.id == follow.dest_channel_id).first()
        if not dest or dest.channel_type != "announcements":
            continue
        category = database.query(Server_categories).filter(Server_categories.id == dest.category_id).first()
        dest_server = database.query(Servers).filter(Servers.id == category.server_id).first() if category else None
        if not dest_server:
            continue
        copy = Announcement_post(
            channel_id=dest.id,
            title=source_post.title,
            body=source_post.body,
            sender_id=source_post.sender_id,
            attachment=source_post.attachment,
            followed_from_id=source_post.id,
            is_public=False,
        )
        database.add(copy)
        copies.append((copy, dest, dest_server))
    if not copies:
        return
    database.commit()
    users_map = mention_user_map(database, source_post.body)
    roles_map = mention_role_map(database, source_post.body)
    public_attachment = post_attachments_public(source_post.attachment)
    for copy, dest, dest_server in copies:
        database.refresh(copy)
        await server_broadcast(server_id=dest_server.id, payload={
            "type": "announcement_created",
            "server_id": dest_server.id,
            "post": {
                "id": copy.id,
                "channel_id": dest.id,
                "title": copy.title,
                "body": copy.body,
                "attachment": public_attachment,
                "created_at": str(copy.created_at),
                "sender_id": author.id,
                "username": author.username,
                "avatar": public_avatar(author),
                "reactions": [],
                "edited": False,
                "is_public": False,
                "followed": True,
                "mention_users": users_map,
                "mention_roles": roles_map,
                "mentioned_ids": [],
                "name_role": None,
            },
        }, database=database)


def public_plain(database, text):
    def repl(match):
        token = match.group(1)
        channel_id = match.group(2)
        if channel_id:
            channel = database.query(Server_channels).filter(Server_channels.id == int(channel_id)).first()
            return "#" + (channel.name if channel and channel.name else "channel")
        if token in ("everyone", "here"):
            return "@" + token
        if token.startswith("&") and token[1:].isdigit():
            role = database.query(Server_roles).filter(Server_roles.id == int(token[1:])).first()
            return "@" + (role.name if role and role.name else "role")
        if token.isdigit():
            account = database.query(UserInfo).filter(UserInfo.id == int(token)).first()
            return "@" + (account.username if account and account.username else "user")
        return ""
    return PUBLIC_MARKUP_RE.sub(repl, text or "")


def public_body_html(database, text):
    escaped = html.escape(public_plain(database, text))
    escaped = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped, flags=re.S)
    escaped = re.sub(r"__(.+?)__", r"<u>\1</u>", escaped, flags=re.S)
    escaped = re.sub(r"\*(.+?)\*", r"<em>\1</em>", escaped, flags=re.S)
    return escaped


@router.post("/announcement_channel_settings")
def save_announcement_channel_settings(body: Announcement_channel_settings, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, server = load_joined_announcement(database, body.channel_id, current_user.id, "manage_channels")
    announce_public = bool(body.announce_public)
    blog_enabled = bool(body.blog_enabled) and announce_public
    if (announce_public or blog_enabled) and not blog_privacy_ok(server):
        raise HTTPException(status_code=400, detail="Blogs are available on Default and Open entry servers.")
    channel.announce_public = announce_public
    channel.blog_enabled = blog_enabled
    database.commit()
    return {"channel_id": channel.id, "announce_public": bool(channel.announce_public), "blog_enabled": bool(channel.blog_enabled)}


@router.get("/channel_follows/{channel_id}")
def list_channel_follows(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    dest, _server = load_joined_announcement(database, channel_id, current_user.id, "manage_channels")
    follows = database.query(Channel_follow).filter(Channel_follow.dest_channel_id == dest.id).all()
    listed = []
    followed_ids = set()
    for follow in follows:
        source = database.query(Server_channels).filter(Server_channels.id == follow.source_channel_id).first()
        if not source:
            continue
        category = database.query(Server_categories).filter(Server_categories.id == source.category_id).first()
        source_server = database.query(Servers).filter(Servers.id == category.server_id).first() if category else None
        followed_ids.add(source.id)
        listed.append({
            "source_channel_id": source.id,
            "channel_name": source.name or "announcements",
            "server_name": source_server.name if source_server and source_server.name else "Server",
        })
    sources = [
        row for row in visible_follow_sources(database, current_user)
        if row["channel_id"] != dest.id and row["channel_id"] not in followed_ids
    ]
    return {"follows": listed, "sources": sources}


@router.post("/channel_follows")
def add_channel_follow(body: Channel_follow_body, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    if body.dest_channel_id == body.source_channel_id:
        raise HTTPException(status_code=400, detail="A channel cannot follow itself.")
    dest, _dest_server = load_joined_announcement(database, body.dest_channel_id, current_user.id, "manage_channels")
    source, source_server = load_joined_announcement(database, body.source_channel_id, current_user.id)
    database.add(Channel_follow(source_channel_id=source.id, dest_channel_id=dest.id, created_by=current_user.id))
    try:
        database.commit()
    except IntegrityError:
        database.rollback()
        raise HTTPException(status_code=400, detail="This channel is already following that one.")
    return {
        "source_channel_id": source.id,
        "channel_name": source.name or "announcements",
        "server_name": source_server.name or "Server",
    }


@router.post("/channel_follows/remove")
def remove_channel_follow(body: Channel_follow_body, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    dest, _server = load_joined_announcement(database, body.dest_channel_id, current_user.id, "manage_channels")
    row = database.query(Channel_follow).filter(
        Channel_follow.dest_channel_id == dest.id,
        Channel_follow.source_channel_id == body.source_channel_id,
    ).first()
    if row:
        database.delete(row)
        database.commit()
    return {"ok": True}


@router.get("/blog/{post_id}", response_class=HTMLResponse)
def public_announcement(post_id: int, database: Session = Depends(get_db)):
    post = database.query(Announcement_post).filter(Announcement_post.id == post_id).first()
    if not post or not getattr(post, "is_public", False):
        raise HTTPException(status_code=404, detail="Post not found")
    channel = database.query(Server_channels).filter(Server_channels.id == post.channel_id).first()
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first() if channel else None
    server = database.query(Servers).filter(Servers.id == category.server_id).first() if category else None
    if not server:
        raise HTTPException(status_code=404, detail="Post not found")
    author = database.query(UserInfo).filter(UserInfo.id == post.sender_id).first()
    mode = (getattr(server, "privacy_mode", None) or "private").strip().lower()
    action = ""
    if mode == "open":
        action = "<button type=\"button\" disabled>Join</button>"
    elif mode == "default":
        action = "<button type=\"button\" disabled>Apply</button>"
    title = html.escape(post.title or "Announcement")
    server_name = html.escape(server.name or "Server")
    author_name = html.escape(author.username if author and author.username else "Someone")
    when = html.escape(str(post.created_at or ""))
    body = public_body_html(database, post.body or "")
    media = ""
    for item in post_attachments_public(post.attachment):
        url = item.get("url") or ""
        if not url:
            continue
        safe = html.escape(url, quote=True)
        mime = item.get("mime") or ""
        if str(mime).startswith("video/"):
            media += f"<video src=\"{safe}\" controls></video>"
        elif str(mime).startswith("image/"):
            media += f"<img src=\"{safe}\" alt=\"\">"
        else:
            name = html.escape(item.get("name") or "Attachment")
            media += f"<p><a href=\"{safe}\">{name}</a></p>"
    page = (
        "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
        f"<title>{title}</title><style>"
        "body{margin:0;background:#1e1f22;color:#f2f3f5;font:16px/1.5 Segoe UI,sans-serif}"
        "main{max-width:720px;margin:0 auto;padding:40px 20px 80px}"
        ".server{color:#b5bac1;font-size:14px}h1{font-size:28px;margin:8px 0}"
        ".meta{color:#b5bac1;font-size:14px;margin-bottom:20px}.body{white-space:pre-wrap}"
        "img,video{max-width:100%;margin-top:16px;border-radius:8px}"
        "button{margin-top:28px;background:#5865f2;color:#fff;border:0;border-radius:4px;padding:10px 16px;font:inherit;opacity:.55}"
        f"</style></head><body><main><div class=\"server\">{server_name}</div><h1>{title}</h1>"
        f"<div class=\"meta\">{author_name} · {when}</div><div class=\"body\">{body}</div>{media}{action}"
        "</main></body></html>"
    )
    return HTMLResponse(page)
