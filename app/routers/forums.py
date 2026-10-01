from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Forum_post, Forum_messages, Forum_tag
from app.schemas import Forum_message_create, Forum_post_create, Forum_toggle, Edit_forum, Forum_settings_save, Forum_tag_create, Forum_tag_update, Forum_tag_delete
from app.database import get_db
from app.auth import get_current_user
from app.r2 import attachment_public, delete_attachment, delete_r2_object, normalize_post_attachments, post_attachments_public, require_message_body, require_post_body, store_attachment, store_post_attachments
from app.routers.mentions import apply_server_text_mentions, decorate_ids, mention_user_map, mention_role_map, mentioned_user_ids, clear_mentions, accepted_reply_parent, reply_map_for, reply_to_payload
from app.routers.realtime import server_broadcast
from app.routers.profile import avatar_lookup, public_avatar
from app.routers.roles import effective_perms_for_user_in_channel, name_color_role_for_user, name_color_roles_by_user, require_channel_perm, require_channel_slowmode
from app.routers.deletion import write_audit_log
from app.routers.reactions import clear_reactions, reactions_for_messages, toggle_reaction_row
from app.routers.pins import clear_pins
from app.routers.feed import notify_activity_reply, notify_activity_post_comment
from app.privacy import drop_blocked_rows
from datetime import datetime

router = APIRouter()

FORUM_TAG_LIMIT = 20
FORUM_POST_TAG_LIMIT = 5


def require_read_forums(database, server, user_id, channel_id):
    return require_channel_perm(database, server, user_id, channel_id, "read_forums", "You do not have permission to read forums.")


def forum_is_sticky(post):
    return bool(getattr(post, "sticky", False))


def forum_is_locked(post):
    return bool(getattr(post, "locked", False))


def encode_tag_ids(tag_ids):
    ids = []
    seen = set()
    for raw in tag_ids or []:
        try:
            tid = int(raw)
        except (TypeError, ValueError):
            continue
        if tid <= 0 or tid in seen:
            continue
        seen.add(tid)
        ids.append(tid)
        if len(ids) >= FORUM_POST_TAG_LIMIT:
            break
    if not ids:
        return ""
    return "," + ",".join(str(i) for i in ids) + ","


def decode_tag_ids(raw):
    text = (raw or "").strip()
    if not text:
        return []
    out = []
    seen = set()
    for part in text.strip(",").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            tid = int(part)
        except ValueError:
            continue
        if tid in seen:
            continue
        seen.add(tid)
        out.append(tid)
    return out


def list_forum_tags(database, channel_id):
    rows = database.query(Forum_tag).filter(Forum_tag.channel_id == channel_id).order_by(Forum_tag.position, Forum_tag.id).all()
    return [{"id": row.id, "name": row.name or "", "emoji": row.emoji or "", "position": row.position or 100} for row in rows]


def resolve_post_tags(tag_ids, catalog):
    by_id = {item["id"]: item for item in catalog}
    out = []
    for tid in tag_ids:
        item = by_id.get(tid)
        if item:
            out.append(item)
    return out


def forum_channel_settings_payload(channel, database):
    return {
        "channel_id": channel.id,
        "guidelines": getattr(channel, "forum_guidelines", None) or "",
        "require_tags": bool(getattr(channel, "forum_require_tags", False)),
        "default_reaction": getattr(channel, "forum_default_reaction", None) or "",
        "tags": list_forum_tags(database, channel.id),
    }


def load_forum_channel_context(database, channel_id, current_user):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel or channel.channel_type != "forums":
        raise HTTPException(status_code=404, detail="channel not found")
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()
    if not is_member:
        raise HTTPException(status_code=404, detail="membership not found")
    return channel, category, server, is_member


def can_remove_forum_topic(database, server, user_id, author_id, channel_id):
    if author_id is None:
        return False
    if user_id == author_id:
        return True
    return bool(effective_perms_for_user_in_channel(database, server, user_id, channel_id).get("manage_topics"))


def require_topic_unlocked(post):
    if forum_is_locked(post):
        raise HTTPException(status_code=403, detail="This topic is locked.")


@router.post("/create_forum")
async def create_forum_post(create_forum: Forum_post_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel_exist, category, server, is_member = load_forum_channel_context(database, create_forum.channel_id, current_user)
    require_channel_perm(database, server, current_user.id, channel_exist.id, "create_topics", "You do not have permission to create forum topics.")
    from app.routers.moderation import require_not_timed_out
    require_not_timed_out(is_member)
    require_channel_slowmode(database, server, current_user.id, channel_exist)

    items = normalize_post_attachments(create_forum.attachments, create_forum.attachment)
    require_post_body(create_forum.title, create_forum.body, items)
    attachment_json = store_post_attachments(items, current_user)

    catalog = list_forum_tags(database, channel_exist.id)
    catalog_ids = {item["id"] for item in catalog}
    chosen = [tid for tid in (create_forum.tag_ids or []) if int(tid) in catalog_ids][:FORUM_POST_TAG_LIMIT]
    if bool(getattr(channel_exist, "forum_require_tags", False)) and catalog and not chosen:
        raise HTTPException(status_code=400, detail="Pick at least one tag for this post.")
    tags_raw = encode_tag_ids(chosen)

    new_post = Forum_post(
        channel_id = channel_exist.id,
        author_id = current_user.id,
        title = create_forum.title.strip(),
        body = (create_forum.body or "").strip(),
        tags = tags_raw,
        attachment = attachment_json,
    )
    database.add(new_post)
    database.flush()
    new_post.body = apply_server_text_mentions(database, new_post.body, "forum_post", new_post.id, server, channel_exist.id, seed= True, sender_id= current_user.id)
    default_reaction = (getattr(channel_exist, "forum_default_reaction", None) or "").strip()
    if default_reaction and len(default_reaction) <= 16:
        toggle_reaction_row(database, "forum_post", new_post.id, current_user.id, default_reaction)
    database.commit()
    database.refresh(new_post)
    public_attachment = post_attachments_public(new_post.attachment)
    users_map = mention_user_map(database, new_post.body)
    roles_map = mention_role_map(database, new_post.body)
    pinged_ids = mentioned_user_ids(database, "forum_post", new_post.id)
    tag_objs = resolve_post_tags(decode_tag_ids(new_post.tags), catalog)
    reactions = reactions_for_messages(database, "forum_post", [new_post.id], current_user.id).get(new_post.id, [])
    payload = {
        "type": "post_forum",
        "post_id": new_post.id,
        "server_id": server.id,
        "channel_id": channel_exist.id,
        "content": {"id": new_post.id, "channel_id": new_post.channel_id, "author": new_post.author_id, "username": current_user.username, "avatar": public_avatar(current_user), "title": new_post.title, "body": new_post.body, "attachment": public_attachment, "tags": tag_objs, "message_count": new_post.message_count, "last_activity": str(new_post.last_activity_at), "edited": False, "sticky": False, "locked": False, "reactions": reactions_for_messages(database, "forum_post", [new_post.id], None).get(new_post.id, []), "mention_users": users_map, "mention_roles": roles_map, "mentioned_ids": pinged_ids, "name_role": name_color_role_for_user(database, server.id, current_user.id)}
    }
    await server_broadcast(server_id=server.id, payload=payload, database=database, exclude_user_id=current_user.id)
    return {"id": new_post.id, "title": new_post.title, "body": new_post.body, "attachment": public_attachment, "tags": tag_objs, "message_count": new_post.message_count, "last_activity": str(new_post.last_activity_at), "edited": False, "sticky": False, "locked": False, "reactions": reactions, "mention_users": users_map, "mention_roles": roles_map}

@router.get("/get_forum_post/{channel_id}")
async def get_forum_post(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user), before_activity: datetime = None, before_id: int = None, q: str = None, tag_id: int = None):
    channel, category, server, is_member = load_forum_channel_context(database, channel_id, current_user)
    require_read_forums(database, server, current_user.id, channel.id)

    catalog = list_forum_tags(database, channel.id)
    query_text = (q or "").strip()
    base = database.query(Forum_post).filter(Forum_post.channel_id == channel.id)
    if query_text:
        base = base.filter(Forum_post.title.ilike(f"%{query_text}%"))
    if tag_id is not None:
        base = base.filter(Forum_post.tags.like(f"%,{int(tag_id)},%"))

    if before_activity:
        post_list = base.filter(
            Forum_post.sticky != True,
            or_(
                Forum_post.last_activity_at < before_activity,
                and_(Forum_post.last_activity_at == before_activity, Forum_post.id < before_id)
            )
        ).order_by(Forum_post.last_activity_at.desc(), Forum_post.id.desc()).limit(10).all()
        has_more = len(post_list) >= 10
    else:
        stickies = base.filter(Forum_post.sticky == True).order_by(Forum_post.last_activity_at.desc(), Forum_post.id.desc()).all()
        normals = base.filter(Forum_post.sticky != True).order_by(Forum_post.last_activity_at.desc(), Forum_post.id.desc()).limit(10).all()
        post_list = stickies + normals
        has_more = len(normals) >= 10

    author_ids = list({post.author_id for post in post_list})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(author_ids)).all() if author_ids else []
    username_lookup = {account.id: account.username for account in accounts}
    faces = avatar_lookup(accounts)
    reaction_map = reactions_for_messages(database, "forum_post", [post.id for post in post_list], current_user.id)
    mention_meta = decorate_ids(database, "forum_post", [post.id for post in post_list], [post.body for post in post_list], current_user.id)
    name_map = name_color_roles_by_user(database, server.id, author_ids)

    picked_posts = []
    for index, post in enumerate(post_list):
        picked_posts.append({
            "id": post.id,
            "author_id": post.author_id,
            "author_username": username_lookup.get(post.author_id, ""),
            "avatar": faces.get(post.author_id),
            "name_role": name_map.get(post.author_id),
            "title": post.title,
            "body": post.body,
            "attachment": post_attachments_public(post.attachment),
            "tags": resolve_post_tags(decode_tag_ids(post.tags), catalog),
            "message_count": post.message_count,
            "last_activity": str(post.last_activity_at),
            "edited": bool(post.edited),
            "sticky": forum_is_sticky(post),
            "locked": forum_is_locked(post),
            "reactions": reaction_map.get(post.id, []),
            "mentioned": mention_meta[index]["mentioned"],
            "mention_users": mention_meta[index]["mention_users"],
            "mention_roles": mention_meta[index]["mention_roles"],
        })
    return {
        "channel_id": channel.id,
        "forum_posts": picked_posts,
        "has_more": has_more,
        "settings": forum_channel_settings_payload(channel, database),
    }

@router.post("/edit_forum")
async def edit_forum_post(edit: Edit_forum, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    post = database.query(Forum_post).filter(Forum_post.id == edit.post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    channel = database.query(Server_channels).filter(Server_channels.id == post.channel_id).first()
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.user_id == current_user.id, Server_members.server_id == server.id).first()
    if not is_member:
        raise HTTPException(status_code=404, detail="User is not a member")
    if current_user.id != post.author_id:
        raise HTTPException(status_code=403, detail="Not authorized to edit post")
    require_topic_unlocked(post)

    title = edit.title.strip()
    body = (edit.body or "").strip()
    items = normalize_post_attachments(edit.attachments, None)
    require_post_body(title, body, items)

    old_keys = [item.get("key") for item in post_attachments_public(post.attachment) if item.get("key")]
    new_keys = [item.key for item in items]
    tokenized = apply_server_text_mentions(database, body, "forum_post", post.id, server, post.channel_id)
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
        "type": "forum_post_edited",
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

@router.post("/delete_forum/{post_id}")
async def delete_forum_post(post_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    post = database.query(Forum_post).filter(Forum_post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    channel = database.query(Server_channels).filter(Server_channels.id == post.channel_id).first()
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.user_id == current_user.id, Server_members.server_id == server.id).first()
    if not is_member:
        raise HTTPException(status_code=404, detail="User is not a member")
    if not can_remove_forum_topic(database, server, current_user.id, post.author_id, channel.id):
        raise HTTPException(status_code=403, detail="You do not have permission to delete this topic.")

    author = database.query(UserInfo).filter(UserInfo.id == post.author_id).first()
    write_audit_log(database, server.id, current_user.id, "delete_post", "forum_post", post.id, {
        "title": post.title,
        "body": post.body,
        "author_id": post.author_id,
        "author_username": author.username if author else None,
        "channel_id": channel.id
    })
    thread_messages = database.query(Forum_messages).filter(Forum_messages.post_id == post_id).all()
    for msg in thread_messages:
        clear_reactions(database, "forum", msg.id)
        clear_pins(database, "forum", msg.id)
        clear_mentions(database, "forum", msg.id)
        delete_attachment(msg.attachment)
        database.delete(msg)

    clear_reactions(database, "forum_post", post_id)
    clear_pins(database, "forum_post", post_id)
    clear_mentions(database, "forum_post", post_id)
    delete_attachment(post.attachment)
    database.delete(post)
    database.commit()
    payload = {
        "type": "forum_post_deleted",
        "channel_id": channel.id,
        "post_id": post_id
    }
    await server_broadcast(server_id= server.id, payload= payload, database= database, exclude_user_id= current_user.id)
    return {"post_id": post_id}

@router.post("/send_forum_message")
async def send_forum_message(forum_message: Forum_message_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    post_exist = database.query(Forum_post).filter(Forum_post.id == forum_message.post_id).first()
    if not post_exist:
        raise HTTPException(status_code=404, detail="Post not found")

    channel = database.query(Server_channels).filter(Server_channels.id == post_exist.channel_id).first()
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.user_id == current_user.id, Server_members.server_id == server.id).first()

    if not is_member:
        raise HTTPException(status_code= 404, detail="Membership not found")
    require_channel_perm(database, server, current_user.id, channel.id, "create_topic_replies", "You do not have permission to create topic replies.")
    require_topic_unlocked(post_exist)
    from app.routers.moderation import require_not_timed_out
    require_not_timed_out(is_member)
    require_channel_slowmode(database, server, current_user.id, channel)

    require_message_body(forum_message.content, forum_message.attachment)
    parent = None
    if forum_message.reply_to_id:
        candidate = database.query(Forum_messages).filter(Forum_messages.id == forum_message.reply_to_id, Forum_messages.post_id == forum_message.post_id).first()
        parent = accepted_reply_parent(candidate, author_attr= "author_id")
    new_message = Forum_messages(
        post_id = forum_message.post_id,
        author_id = current_user.id,
        content = forum_message.content,
        attachment = store_attachment(forum_message.attachment, current_user),
        reply_to_id = parent.id if parent else None,
    )
    database.add(new_message)
    database.flush()
    new_message.content = apply_server_text_mentions(database, new_message.content, "forum", new_message.id, server, channel.id, seed= True, sender_id= current_user.id, reply_author_id= parent.author_id if parent else None)

    post_exist.message_count = (post_exist.message_count or 0) + 1
    post_exist.last_activity_at = datetime.utcnow()

    database.commit()
    database.refresh(new_message)

    payload = {
        "type": "forum_post_updated",
        "channel_id": post_exist.channel_id,
        "post_id": post_exist.id,
        "message_count": post_exist.message_count,
        "last_activity": str(post_exist.last_activity_at)
    }

    await server_broadcast(server_id=server.id, payload=payload, database=database)

    if parent and parent.author_id:
        await notify_activity_reply(
            database,
            receiver_id=parent.author_id,
            actor_id=current_user.id,
            message_kind="forum",
            message_id=new_message.id,
            server_id=server.id,
            channel_id=channel.id,
        )
    if post_exist.author_id and (not parent or post_exist.author_id != parent.author_id):
        await notify_activity_post_comment(
            database,
            receiver_id=post_exist.author_id,
            actor_id=current_user.id,
            post_kind="forum_post",
            post_id=post_exist.id,
            server_id=server.id,
            channel_id=channel.id,
        )

    return {
        "id": new_message.id,
        "post_id": new_message.post_id,
        "author_id": new_message.author_id,
        "username": current_user.username,
        "avatar": public_avatar(current_user),
        "name_role": name_color_role_for_user(database, server.id, current_user.id),
        "content": new_message.content,
        "attachment": attachment_public(new_message.attachment),
        "timestamp": str(new_message.created_at),
        "mention_users": mention_user_map(database, new_message.content),
        "mention_roles": mention_role_map(database, new_message.content),
        "reply_to": reply_to_payload(database, parent, author_attr= "author_id")
    }

@router.get("/get_forum_messages/{post_id}")
def get_forum_messages(post_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user), before_id: int = None, around_id: int = None):
    post_exist = database.query(Forum_post).filter(Forum_post.id == post_id).first()
    if not post_exist:
        raise HTTPException(status_code=404, detail="Post does not exist")

    channel = database.query(Server_channels).filter(Server_channels.id == post_exist.channel_id).first()
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.user_id == current_user.id, Server_members.server_id == server.id).first()

    if not is_member:
        raise HTTPException(status_code=404, detail="Membership not found")
    require_read_forums(database, server, current_user.id, channel.id)

    base = database.query(Forum_messages).filter(Forum_messages.post_id == post_id)
    around_mode = False
    if around_id:
        target = base.filter(Forum_messages.id == around_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="No message found")
        before = base.filter(Forum_messages.id < around_id).order_by(Forum_messages.created_at.desc()).limit(12).all()
        after = base.filter(Forum_messages.id > around_id).order_by(Forum_messages.created_at.asc()).limit(12).all()
        message_list = list(reversed(before)) + [target] + after
        around_mode = True
    elif before_id:
        message_list = base.filter(Forum_messages.id < before_id).order_by(Forum_messages.created_at.desc()).limit(25).all()
    else:
        message_list = base.order_by(Forum_messages.created_at.desc()).limit(25).all()

    message_list = drop_blocked_rows(database, current_user.id, message_list, sender_attr="author_id")

    author_ids = list({message.author_id for message in message_list})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(author_ids)).all()
    username_lookup = {account.id: account.username for account in accounts}
    faces = avatar_lookup(accounts)
    mention_meta = decorate_ids(database, "forum", [message.id for message in message_list], [message.content for message in message_list], current_user.id)
    reaction_map = reactions_for_messages(database, "forum", [message.id for message in message_list], current_user.id)
    reply_map = reply_map_for(database, Forum_messages, message_list, author_attr= "author_id")
    name_map = name_color_roles_by_user(database, server.id, author_ids)

    forum_messages = []
    for index, message in enumerate(message_list):
        forum_messages.append({
            "id": message.id,
            "post_id": message.post_id,
            "author_id": message.author_id,
            "username": username_lookup.get(message.author_id, ""),
            "avatar": faces.get(message.author_id),
            "name_role": name_map.get(message.author_id),
            "content": message.content,
            "attachment": attachment_public(message.attachment),
            "timestamp": str(message.created_at),
            "edited": bool(message.edited),
            "reactions": reaction_map.get(message.id, []),
            "mentioned": mention_meta[index]["mentioned"],
            "mention_users": mention_meta[index]["mention_users"],
            "mention_roles": mention_meta[index]["mention_roles"],
            "reply_to": reply_map.get(message.reply_to_id) if message.reply_to_id else None,
        })

    if not around_mode:
        forum_messages.reverse()
    from app.site_moderation import mask_message_payloads
    mask_message_payloads(database, forum_messages, sender_key="author_id")
    author = database.query(UserInfo).filter(UserInfo.id == post_exist.author_id).first()
    catalog = list_forum_tags(database, channel.id)
    post_reactions = reactions_for_messages(database, "forum_post", [post_exist.id], current_user.id).get(post_exist.id, [])
    post_mentions = decorate_ids(database, "forum_post", [post_exist.id], [post_exist.body or ""], current_user.id)[0]
    return {
        "forum_post_messages": forum_messages,
        "locked": forum_is_locked(post_exist),
        "sticky": forum_is_sticky(post_exist),
        "post": {
            "id": post_exist.id,
            "author_id": post_exist.author_id,
            "author_username": author.username if author else "",
            "avatar": public_avatar(author) if author else None,
            "name_role": name_color_role_for_user(database, server.id, post_exist.author_id),
            "title": post_exist.title,
            "body": post_exist.body or "",
            "attachment": post_attachments_public(post_exist.attachment),
            "tags": resolve_post_tags(decode_tag_ids(post_exist.tags), catalog),
            "edited": bool(post_exist.edited),
            "sticky": forum_is_sticky(post_exist),
            "locked": forum_is_locked(post_exist),
            "reactions": post_reactions,
            "mention_users": post_mentions.get("mention_users") or {},
            "mention_roles": post_mentions.get("mention_roles") or {},
        },
    }


@router.post("/sticky_forum/{post_id}")
async def sticky_forum(post_id: int, body: Forum_toggle, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    post = database.query(Forum_post).filter(Forum_post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    channel = database.query(Server_channels).filter(Server_channels.id == post.channel_id).first()
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.user_id == current_user.id, Server_members.server_id == server.id).first()
    if not is_member:
        raise HTTPException(status_code=404, detail="User is not a member")
    require_channel_perm(database, server, current_user.id, channel.id, "sticky_topics", "You do not have permission to sticky topics.")
    post.sticky = bool(body.on)
    database.commit()
    payload = {
        "type": "forum_post_flags",
        "channel_id": post.channel_id,
        "post_id": post.id,
        "sticky": forum_is_sticky(post),
        "locked": forum_is_locked(post)
    }
    await server_broadcast(server_id=server.id, payload=payload, database=database, exclude_user_id=current_user.id)
    return {"post_id": post.id, "sticky": forum_is_sticky(post), "locked": forum_is_locked(post)}


@router.post("/lock_forum/{post_id}")
async def lock_forum(post_id: int, body: Forum_toggle, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    post = database.query(Forum_post).filter(Forum_post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    channel = database.query(Server_channels).filter(Server_channels.id == post.channel_id).first()
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.user_id == current_user.id, Server_members.server_id == server.id).first()
    if not is_member:
        raise HTTPException(status_code=404, detail="User is not a member")
    require_channel_perm(database, server, current_user.id, channel.id, "lock_topics", "You do not have permission to lock topics.")
    post.locked = bool(body.on)
    database.commit()
    payload = {
        "type": "forum_post_flags",
        "channel_id": post.channel_id,
        "post_id": post.id,
        "sticky": forum_is_sticky(post),
        "locked": forum_is_locked(post)
    }
    await server_broadcast(server_id=server.id, payload=payload, database=database, exclude_user_id=current_user.id)
    return {"post_id": post.id, "sticky": forum_is_sticky(post), "locked": forum_is_locked(post)}


@router.get("/get_forum_settings/{channel_id}")
def get_forum_settings(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, category, server, is_member = load_forum_channel_context(database, channel_id, current_user)
    require_read_forums(database, server, current_user.id, channel.id)
    return forum_channel_settings_payload(channel, database)


@router.post("/save_forum_settings")
async def save_forum_settings(body: Forum_settings_save, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, category, server, is_member = load_forum_channel_context(database, body.channel_id, current_user)
    require_channel_perm(database, server, current_user.id, channel.id, "manage_channels", "You do not have permission to manage this channel.")
    if body.guidelines is not None:
        text = (body.guidelines or "").strip()
        if len(text) > 4096:
            text = text[:4096]
        channel.forum_guidelines = text or None
    if body.require_tags is not None:
        channel.forum_require_tags = bool(body.require_tags)
    if body.default_reaction is not None:
        emoji = (body.default_reaction or "").strip()
        if len(emoji) > 16:
            raise HTTPException(status_code=400, detail="Invalid reaction")
        channel.forum_default_reaction = emoji or None
    database.commit()
    payload = {
        "type": "forum_settings_updated",
        "channel_id": channel.id,
        "settings": forum_channel_settings_payload(channel, database),
    }
    await server_broadcast(server_id=server.id, payload=payload, database=database, exclude_user_id=current_user.id)
    return payload["settings"]


@router.post("/create_forum_tag")
async def create_forum_tag(body: Forum_tag_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, category, server, is_member = load_forum_channel_context(database, body.channel_id, current_user)
    require_channel_perm(database, server, current_user.id, channel.id, "manage_channels", "You do not have permission to manage this channel.")
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tag name required")
    if len(name) > 40:
        name = name[:40]
    count = database.query(Forum_tag).filter(Forum_tag.channel_id == channel.id).count()
    if count >= FORUM_TAG_LIMIT:
        raise HTTPException(status_code=400, detail="This channel already has the maximum number of tags.")
    highest = database.query(func.max(Forum_tag.position)).filter(Forum_tag.channel_id == channel.id).scalar()
    emoji = (body.emoji or "").strip()
    if len(emoji) > 16:
        emoji = emoji[:16]
    row = Forum_tag(
        channel_id=channel.id,
        name=name,
        emoji=emoji or None,
        position=(highest or 0) + 100,
    )
    database.add(row)
    database.commit()
    database.refresh(row)
    settings = forum_channel_settings_payload(channel, database)
    await server_broadcast(server_id=server.id, payload={"type": "forum_settings_updated", "channel_id": channel.id, "settings": settings}, database=database, exclude_user_id=current_user.id)
    return {"id": row.id, "name": row.name, "emoji": row.emoji or "", "position": row.position, "settings": settings}


@router.post("/update_forum_tag")
async def update_forum_tag(body: Forum_tag_update, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    row = database.query(Forum_tag).filter(Forum_tag.id == body.tag_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Tag not found")
    channel, category, server, is_member = load_forum_channel_context(database, row.channel_id, current_user)
    require_channel_perm(database, server, current_user.id, channel.id, "manage_channels", "You do not have permission to manage this channel.")
    if body.name is not None:
        name = (body.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Tag name required")
        if len(name) > 40:
            name = name[:40]
        row.name = name
    if body.emoji is not None:
        emoji = (body.emoji or "").strip()
        if len(emoji) > 16:
            emoji = emoji[:16]
        row.emoji = emoji or None
    database.commit()
    settings = forum_channel_settings_payload(channel, database)
    await server_broadcast(server_id=server.id, payload={"type": "forum_settings_updated", "channel_id": channel.id, "settings": settings}, database=database, exclude_user_id=current_user.id)
    return {"id": row.id, "name": row.name, "emoji": row.emoji or "", "position": row.position, "settings": settings}


@router.post("/delete_forum_tag")
async def delete_forum_tag(body: Forum_tag_delete, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    row = database.query(Forum_tag).filter(Forum_tag.id == body.tag_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Tag not found")
    channel, category, server, is_member = load_forum_channel_context(database, row.channel_id, current_user)
    require_channel_perm(database, server, current_user.id, channel.id, "manage_channels", "You do not have permission to manage this channel.")
    tag_id = row.id
    database.delete(row)
    posts = database.query(Forum_post).filter(Forum_post.channel_id == channel.id, Forum_post.tags.like(f"%,{tag_id},%")).all()
    for post in posts:
        ids = [tid for tid in decode_tag_ids(post.tags) if tid != tag_id]
        post.tags = encode_tag_ids(ids)
    database.commit()
    settings = forum_channel_settings_payload(channel, database)
    await server_broadcast(server_id=server.id, payload={"type": "forum_settings_updated", "channel_id": channel.id, "settings": settings}, database=database, exclude_user_id=current_user.id)
    return {"ok": True, "settings": settings}

