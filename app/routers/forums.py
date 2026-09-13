from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Forum_post, Forum_messages
from app.schemas import Forum_message_create, Forum_post_create
from app.database import get_db
from app.auth import get_current_user
from app.r2 import attachment_public, require_message_body, store_attachment
from app.routers.realtime import server_broadcast
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

    new_post = Forum_post(
        channel_id = channel_exist.id,
        author_id = current_user.id,
        title = create_forum.title,
        body = create_forum.body,
        tags = ""
    )
    database.add(new_post)
    database.commit()
    database.refresh(new_post)
    payload = {
        "type": "post_forum",
        "post_id": new_post.id,
        "content": {"id": new_post.id, "channel_id": new_post.channel_id, "author": new_post.author_id, "username": current_user.username, "title": new_post.title, "body": new_post.body, "tags": new_post.tags, "message_count": new_post.message_count, "last_activity": str(new_post.last_activity_at)}
    }
    await server_broadcast(server_id=server.id, payload=payload, database=database, exclude_user_id=current_user.id)
    return {"id": new_post.id, "title": new_post.title, "body": new_post.body, "tags": new_post.tags, "message_count": new_post.message_count, "last_activity": str(new_post.last_activity_at)}

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

    picked_posts = []
    for post in post_list:
        picked_posts.append({
            "id": post.id,
            "author_id": post.author_id,
            "author_username": username_lookup[post.author_id],
            "title": post.title,
            "body": post.body,
            "tags": post.tags,
            "message_count": post.message_count,
            "last_activity": str(post.last_activity_at)
        })
    return {"channel_id": channel.id, "forum_posts": picked_posts}

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

    require_message_body(forum_message.content, forum_message.attachment)
    new_message = Forum_messages(
        post_id = forum_message.post_id,
        author_id = current_user.id,
        content = forum_message.content,
        attachment = store_attachment(forum_message.attachment, current_user),
    )
    database.add(new_message)

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
        "content": new_message.content,
        "attachment": attachment_public(new_message.attachment),
        "timestamp": str(new_message.created_at)
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

    forum_messages = []
    for message in message_list:
        forum_messages.append({
            "id": message.id,
            "post_id": message.post_id,
            "author_id": message.author_id,
            "username": username_lookup[message.author_id], 
            "content": message.content,
            "attachment": attachment_public(message.attachment),
            "timestamp": str(message.created_at)
        })

    forum_messages.reverse()
    return {"forum_post_messages": forum_messages}

