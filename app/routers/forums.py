from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Forum_post, Forum_messages
from app.schemas import Forum_message_create, Forum_post_create, Edit_forum
from app.database import get_db
from app.auth import get_current_user
from app.r2 import attachment_public, delete_attachment, delete_r2_object, normalize_post_attachments, post_attachments_public, require_message_body, require_post_body, store_attachment, store_post_attachments
from app.routers.mentions import apply_server_text_mentions, decorate_ids, mention_user_map, mention_role_map, mentioned_user_ids, clear_mentions, accepted_reply_parent, reply_map_for, reply_to_payload
from app.routers.realtime import server_broadcast
from app.routers.profile import avatar_lookup, public_avatar
from app.routers.roles import name_color_role_for_user, name_color_roles_by_user
from app.routers.deletion import write_audit_log
from app.routers.reactions import clear_reactions, reactions_for_messages
from datetime import datetime

router = APIRouter()

@router.post("/create_forum")
async def create_forum_post(create_forum: Forum_post_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel_exist = database.query(Server_channels).filter(Server_channels.id == create_forum.channel_id).first()
    if not channel_exist or channel_exist.channel_type != "forums":
        raise HTTPException(status_code=404, detail="channel not found")

    category = database.query(Server_categories).filter(Server_categories.id == channel_exist.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()

    if not is_member:
        raise HTTPException(status_code=404, detail="membership not found")
    from app.routers.moderation import require_not_timed_out
    require_not_timed_out(is_member)

    items = normalize_post_attachments(create_forum.attachments, create_forum.attachment)
    require_post_body(create_forum.title, create_forum.body, items)
    attachment_json = store_post_attachments(items, current_user)

    new_post = Forum_post(
        channel_id = channel_exist.id,
        author_id = current_user.id,
        title = create_forum.title.strip(),
        body = (create_forum.body or "").strip(),
        tags = "",
        attachment = attachment_json,
    )
    database.add(new_post)
    database.flush()
    new_post.body = apply_server_text_mentions(database, new_post.body, "forum_post", new_post.id, server, channel_exist.id, seed= True, sender_id= current_user.id)
    database.commit()
    database.refresh(new_post)
    public_attachment = post_attachments_public(new_post.attachment)
    users_map = mention_user_map(database, new_post.body)
    roles_map = mention_role_map(database, new_post.body)
    pinged_ids = mentioned_user_ids(database, "forum_post", new_post.id)
    payload = {
        "type": "post_forum",
        "post_id": new_post.id,
        "server_id": server.id,
        "channel_id": channel_exist.id,
        "content": {"id": new_post.id, "channel_id": new_post.channel_id, "author": new_post.author_id, "username": current_user.username, "avatar": public_avatar(current_user), "title": new_post.title, "body": new_post.body, "attachment": public_attachment, "tags": new_post.tags, "message_count": new_post.message_count, "last_activity": str(new_post.last_activity_at), "edited": False, "mention_users": users_map, "mention_roles": roles_map, "mentioned_ids": pinged_ids, "name_role": name_color_role_for_user(database, server.id, current_user.id)}
    }
    await server_broadcast(server_id=server.id, payload=payload, database=database, exclude_user_id=current_user.id)
    return {"id": new_post.id, "title": new_post.title, "body": new_post.body, "attachment": public_attachment, "tags": new_post.tags, "message_count": new_post.message_count, "last_activity": str(new_post.last_activity_at), "edited": False, "mention_users": users_map, "mention_roles": roles_map}

@router.get("/get_forum_post/{channel_id}")
async def get_forum_post(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user), before_activity: datetime = None, before_id: int = None):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel or channel.channel_type != "forums":
        raise HTTPException(status_code=404, detail="channel not found")

    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()
    if not is_member:
        raise HTTPException(status_code=404, detail="User is not a member of server")

    if before_activity:
        post_list = database.query(Forum_post).filter(
            Forum_post.channel_id == channel.id,
            or_(
                Forum_post.last_activity_at < before_activity,
                and_(Forum_post.last_activity_at == before_activity, Forum_post.id < before_id)
            )
        ).order_by(Forum_post.last_activity_at.desc(), Forum_post.id.desc()).limit(10).all()
    else:
        post_list = database.query(Forum_post).filter(Forum_post.channel_id == channel.id).order_by(Forum_post.last_activity_at.desc(), Forum_post.id.desc()).limit(10).all()

    author_ids = list({post.author_id for post in post_list})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(author_ids)).all()
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
            "author_username": username_lookup[post.author_id],
            "avatar": faces.get(post.author_id),
            "name_role": name_map.get(post.author_id),
            "title": post.title,
            "body": post.body,
            "attachment": post_attachments_public(post.attachment),
            "tags": post.tags,
            "message_count": post.message_count,
            "last_activity": str(post.last_activity_at),
            "edited": bool(post.edited),
            "reactions": reaction_map.get(post.id, []),
            "mentioned": mention_meta[index]["mentioned"],
            "mention_users": mention_meta[index]["mention_users"],
            "mention_roles": mention_meta[index]["mention_roles"],
        })
    return {"channel_id": channel.id, "forum_posts": picked_posts}

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
    if current_user.id != post.author_id and current_user.id != server.owner_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete post")

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
        clear_mentions(database, "forum", msg.id)
        delete_attachment(msg.attachment)
        database.delete(msg)

    clear_reactions(database, "forum_post", post_id)
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
    from app.routers.moderation import require_not_timed_out
    require_not_timed_out(is_member)

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
def get_forum_messages(post_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user), before_id: int = None):
    post_exist = database.query(Forum_post).filter(Forum_post.id == post_id).first()
    if not post_exist:
        raise HTTPException(status_code=404, detail="Post does not exist")

    channel = database.query(Server_channels).filter(Server_channels.id == post_exist.channel_id).first()
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.user_id == current_user.id, Server_members.server_id == server.id).first()

    if not is_member:
        raise HTTPException(status_code=404, detail="Membership not found")

    if before_id:
        message_list = database.query(Forum_messages).filter(Forum_messages.post_id == post_id, Forum_messages.id < before_id).order_by(Forum_messages.created_at.desc()).limit(25).all()
    else:
        message_list = database.query(Forum_messages).filter(Forum_messages.post_id == post_id).order_by(Forum_messages.created_at.desc()).limit(25).all()

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
            "username": username_lookup[message.author_id],
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

    forum_messages.reverse()
    return {"forum_post_messages": forum_messages}

