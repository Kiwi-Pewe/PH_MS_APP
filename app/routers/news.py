from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.models import UserInfo, News_post, News_seen
from app.schemas import News_create
from app.database import get_db
from app.auth import get_current_user
from app.r2 import post_attachments_public, require_post_body
from app.routers.profile import public_avatar, public_display_name
from app.routers.realtime import active_connections, notify_user

router = APIRouter()


def require_oneira_admin(user):
    if (user.username or "").strip().lower() != "kiwi":
        raise HTTPException(status_code=403, detail="Admin Panel is not available.")
    return user


def news_unread_count(database, user_id):
    seen = database.query(News_seen).filter(News_seen.user_id == user_id).first()
    query = database.query(News_post)
    if seen and seen.seen_at:
        query = query.filter(News_post.created_at > seen.seen_at)
    return int(query.count() or 0)


def pack_news_post(row, account):
    return {
        "id": row.id,
        "title": row.title or "",
        "body": row.body or "",
        "attachment": post_attachments_public(row.attachment),
        "created_at": str(row.created_at) if row.created_at else None,
        "sender_id": row.sender_id,
        "username": (account.username if account else "") or "",
        "display_name": public_display_name(account) if account else "",
        "avatar": public_avatar(account) if account else {},
        "comment_count": int(row.comment_count or 0),
        "comments_open": bool(row.comments_open),
        "edited": bool(row.edited),
        "reactions": [],
    }


async def fanout_news(payload, exclude_user_id=None):
    for user_id in list(active_connections.keys()):
        if exclude_user_id and user_id == exclude_user_id:
            continue
        await notify_user(user_id, payload)


@router.get("/news/posts")
def list_news_posts(
    q: str = "",
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    query = database.query(News_post)
    text = (q or "").strip()
    if text:
        like = "%" + text + "%"
        query = query.filter(or_(News_post.title.ilike(like), News_post.body.ilike(like)))
    rows = query.order_by(News_post.created_at.desc(), News_post.id.desc()).limit(80).all()
    ids = list({row.sender_id for row in rows if row.sender_id})
    accounts = {account.id: account for account in database.query(UserInfo).filter(UserInfo.id.in_(ids)).all()} if ids else {}
    return {"posts": [pack_news_post(row, accounts.get(row.sender_id)) for row in rows]}


@router.get("/news/badge")
def news_badge(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    return {"unread": news_unread_count(database, current_user.id)}


@router.post("/news/seen")
def mark_news_seen(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    row = database.query(News_seen).filter(News_seen.user_id == current_user.id).first()
    if not row:
        row = News_seen(user_id=current_user.id, seen_at=datetime.utcnow())
        database.add(row)
    else:
        row.seen_at = datetime.utcnow()
    database.commit()
    return {"unread": 0}


@router.post("/news/posts")
async def create_news_post(
    body: News_create,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    require_post_body(body.title, body.body, [])
    row = News_post(
        title=(body.title or "").strip(),
        body=(body.body or "").strip(),
        sender_id=current_user.id,
        created_at=datetime.utcnow(),
        comments_open=bool(body.comments_open),
    )
    database.add(row)
    database.commit()
    database.refresh(row)
    packed = pack_news_post(row, current_user)
    await fanout_news({"type": "news_created", "post": packed}, exclude_user_id=current_user.id)
    return packed
