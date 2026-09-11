from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Announcement_post, Announcement_comment
from app.schemas import Announcements, Comment_create
from app.database import get_db
from app.auth import get_current_user
from app.routers.realtime import server_broadcast

router = APIRouter()

@router.post("/post_announcement")
async def create_post(announcement: Announcements, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel_found = database.query(Server_channels).filter(Server_channels.id == announcement.channel_id).first()
    if not channel_found or not channel_found.channel_type == "announcements":
        raise HTTPException(status_code= 404, detail= "No channel found")

    category = database.query(Server_categories).filter(Server_categories.id == channel_found.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    if server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="user is not owner")

    new_post = Announcement_post(
        channel_id = announcement.channel_id,
        title = announcement.title,
        body = announcement.body,
        sender_id = current_user.id
    )
    database.add(new_post)
    database.commit()
    database.refresh(new_post)
    payload = {
        "type": "announcement_created",
        "server_id": server.id,
        "post": {"id": new_post.id, "channel_id": new_post.channel_id,"title": new_post.title, "body": new_post.body, "created_at": str(new_post.created_at), "sender_id": current_user.id, "username": current_user.username}
        }
    await server_broadcast(server_id= server.id, payload= payload, database= database, exclude_user_id= current_user.id)
    return {"channel_type": channel_found.channel_type, "name": channel_found.name, "id": new_post.id, "title": new_post.title, "body": new_post.body}

@router.get("/get_announcement/{channel_id}")
def get_announcement_posts(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user), before_id = None):
    correct_channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not correct_channel or not correct_channel.channel_type == "announcements":
        raise HTTPException(status_code=404, detail="Channel not found")

    category = database.query(Server_categories).filter(Server_categories.id == correct_channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.user_id == current_user.id, Server_members.server_id == server.id).first()

    if not is_member:
        raise HTTPException(status_code=404, detail="Membership not found")

    if before_id:
        post_history = database.query(Announcement_post).filter(Announcement_post.channel_id == channel_id, Announcement_post.id < before_id).order_by(Announcement_post.created_at.desc()).limit(25).all()
    else:
        post_history = database.query(Announcement_post).filter(Announcement_post.channel_id == channel_id).order_by(Announcement_post.created_at.desc()).limit(25).all()

    sender_ids = list({post.sender_id for post in post_history})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(sender_ids)).all()
    username_lookup = {account.id: account.username for account in accounts}

    recent_post = []
    for post in post_history:
        recent_post.append({
            "id": post.id,
            "sender_id": post.sender_id,
            "username": username_lookup[post.sender_id],
            "title": post.title,
            "body": post.body,
            "created_at": str(post.created_at),
            "comment_count": post.comment_count
        })

    recent_post.reverse()
    return {"server_name": server.name, "server_id": server.id, "channel_id": channel_id, "session_username": current_user.username, "posts": recent_post}

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

    new_comment = Announcement_comment(
        post_id = announcement.id,
        sender_id = current_user.id,
        content = comment.content
    )
    announcement.comment_count += 1
    database.add(new_comment)
    database.commit()
    database.refresh(new_comment)
    payload = {
        "type": "announcement_comment",
        "post_id": comment.post_id,
        "comment": {"id": new_comment.id, "post_id": new_comment.post_id, "sender_id": current_user.id, "username": current_user.username, "content": comment.content, "created_at": str(new_comment.created_at), "comment_count": announcement.comment_count}
    }
    await server_broadcast(server_id= server.id, payload= payload, database= database, exclude_user_id= current_user.id)
    return {"id": new_comment.id, "content": new_comment.content, "created_at": str(new_comment.created_at), "comment_count": announcement.comment_count}

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

    if after_id:
        comment_history = database.query(Announcement_comment).filter(Announcement_comment.post_id == post_id, Announcement_comment.id > after_id).order_by(Announcement_comment.id.asc()).limit(limit).all()
    else:
        comment_history = database.query(Announcement_comment).filter(Announcement_comment.post_id == post_id).order_by(Announcement_comment.id.asc()).limit(limit).all()
     
    sender_ids = list({user.sender_id for user in comment_history})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(sender_ids)).all()
    username_lookup = {account.id: account.username for account in accounts}

    picked_comments = []
    for user_comment in comment_history:
        picked_comments.append({
            "id": user_comment.id,
            "post_id": user_comment.post_id,
            "sender_id": user_comment.sender_id,
            "content": user_comment.content,
            "username": username_lookup[user_comment.sender_id],
            "created_at": str(user_comment.created_at)
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
    if  current_user.id != post_exist.sender_id and current_user.id != server.owner_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete post")

    all_comments = database.query(Announcement_comment).filter(Announcement_comment.post_id == post_id).all()

    for comment in all_comments:
        database.delete(comment)
    
    database.delete(post_exist)
    database.commit()
    payload = {
       "type": "announcement_deleted",
       "channel_id": channel.id,
       "post_id": post_id
    }

    await server_broadcast(server_id = server.id, payload=payload, database=database, exclude_user_id=current_user.id)
    return {"post_id": post_id}
