from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.models import UserInfo, News_post, News_seen, News_settings
from app.schemas import News_create, News_broadcast
from app.database import get_db
from app.auth import get_current_user
from app.r2 import normalize_post_attachments, post_attachments_public, require_post_body, store_post_attachments
from app.routers.profile import public_avatar, public_display_name
from app.routers.realtime import active_connections, notify_user

NEWS_ALIGNS = ("left", "center", "right")
NEWS_EVENT_COLORS = ("red", "orange", "yellow", "green")

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


def news_align(value):
    text = (value or "left").strip().lower()
    return text if text in NEWS_ALIGNS else "left"


def news_event_color(value):
    text = (value or "").strip().lower()
    return text if text in NEWS_EVENT_COLORS else "orange"


def news_parse_when(raw, label):
    text = (raw or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail=label + " is required.")
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        when = datetime.fromisoformat(text)
    except ValueError:
        raise HTTPException(status_code=400, detail=label + " is invalid.")
    if when.tzinfo is not None:
        when = when.astimezone(timezone.utc).replace(tzinfo=None)
    return when


def parse_news_event(event):
    if event is None:
        return None
    name = (event.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Event name is required.")
    starts = news_parse_when(event.starts_at, "Event start")
    ends = news_parse_when(event.ends_at, "Event end")
    if ends <= starts:
        raise HTTPException(status_code=400, detail="Event end must be after start.")
    return {
        "event_name": name[:200],
        "event_starts": starts,
        "event_ends": ends,
        "event_description": (event.description or "").strip()[:2000] or None,
        "event_color": news_event_color(event.color),
    }


def pack_news_event(row):
    if not row or not row.event_starts:
        return None
    return {
        "id": row.id,
        "post_id": row.id,
        "name": row.event_name or "",
        "starts_at": str(row.event_starts) if row.event_starts else None,
        "ends_at": str(row.event_ends) if row.event_ends else None,
        "description": row.event_description or "",
        "color": news_event_color(row.event_color),
    }


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
        "title_align": news_align(row.title_align),
        "body_align": news_align(row.body_align),
        "event": pack_news_event(row),
        "reactions": [],
    }


async def fanout_news(payload, exclude_user_id=None):
    for user_id in list(active_connections.keys()):
        if exclude_user_id and user_id == exclude_user_id:
            continue
        await notify_user(user_id, payload)


def news_settings_row(database):
    row = database.query(News_settings).filter(News_settings.id == 1).first()
    if row:
        return row
    row = News_settings(id=1)
    database.add(row)
    database.commit()
    database.refresh(row)
    return row


def pack_news_broadcast(row):
    message = ((row.broadcast if row else "") or "").strip()
    return {"message": message}


@router.get("/news/broadcast")
def get_news_broadcast(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    return pack_news_broadcast(news_settings_row(database))


@router.post("/news/broadcast")
async def save_news_broadcast(
    body: News_broadcast,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    message = (body.message or "").strip()
    if len(message) > 500:
        raise HTTPException(status_code=400, detail="Broadcast is too long.")
    row = news_settings_row(database)
    row.broadcast = message or None
    database.commit()
    packed = pack_news_broadcast(row)
    await fanout_news({"type": "news_broadcast", "message": packed["message"]})
    return packed


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


@router.get("/news/events")
def list_news_events(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    rows = (
        database.query(News_post)
        .filter(News_post.event_starts.isnot(None))
        .order_by(News_post.event_starts.asc(), News_post.id.asc())
        .limit(200)
        .all()
    )
    return {"events": [pack_news_event(row) for row in rows if pack_news_event(row)]}


@router.post("/news/posts")
async def create_news_post(
    body: News_create,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    items = normalize_post_attachments(body.attachments)
    require_post_body(body.title, body.body, items)
    event = parse_news_event(body.event)
    row = News_post(
        title=(body.title or "").strip(),
        body=(body.body or "").strip(),
        sender_id=current_user.id,
        created_at=datetime.utcnow(),
        comments_open=bool(body.comments_open),
        attachment=store_post_attachments(items, current_user),
        title_align=news_align(body.title_align),
        body_align=news_align(body.body_align),
        event_name=event["event_name"] if event else None,
        event_starts=event["event_starts"] if event else None,
        event_ends=event["event_ends"] if event else None,
        event_description=event["event_description"] if event else None,
        event_color=event["event_color"] if event else None,
    )
    database.add(row)
    database.commit()
    database.refresh(row)
    packed = pack_news_post(row, current_user)
    await fanout_news({"type": "news_created", "post": packed}, exclude_user_id=current_user.id)
    return packed
