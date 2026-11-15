from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.models import UserInfo, News_post, News_comment, News_seen, News_settings, News_broadcast
from app.schemas import News_create, News_edit, News_id, News_comment_id, News_event_edit, News_broadcast_in, Comment_create, Comment_edit
from app.database import get_db, SessionLocal
from app.auth import get_current_user
import asyncio
from app.r2 import delete_attachment, delete_r2_object, normalize_post_attachments, post_attachments_public, require_post_body, store_post_attachments
from app.routers.profile import public_avatar, public_display_name
from app.routers.realtime import active_connections, notify_user
from app.routers.reactions import clear_reactions, reactions_for_messages, reactions_for_one
from app.routers.feed import notify_activity_post_comment

NEWS_ALIGNS = ("left", "center", "right")
NEWS_EVENT_COLORS = ("red", "orange", "yellow", "green")
NEWS_BROADCAST_LEAD = timedelta(hours=48)
NEWS_BROADCAST_HOURS_MIN = 1
NEWS_BROADCAST_HOURS_MAX = 720
_news_broadcast_sig = None

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


def news_event_started(row):
    starts = row.event_starts if row else None
    if not starts:
        return False
    return starts <= datetime.utcnow()


def set_news_event(row, event):
    if not event:
        row.event_name = None
        row.event_starts = None
        row.event_ends = None
        row.event_description = None
        row.event_color = None
        return
    row.event_name = event["event_name"]
    row.event_starts = event["event_starts"]
    row.event_ends = event["event_ends"]
    row.event_description = event["event_description"]
    row.event_color = event["event_color"]


def replace_news_attachments(row, items, user):
    old_keys = [item.get("key") for item in post_attachments_public(row.attachment) if item.get("key")]
    packed = store_post_attachments(items, user)
    new_keys = [item.get("key") for item in post_attachments_public(packed) if item.get("key")]
    for key in old_keys:
        if key not in new_keys:
            delete_r2_object(key)
    row.attachment = packed


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


def pack_news_post(row, account, reactions=None):
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
        "reactions": reactions if reactions is not None else [],
    }


def pack_news_comment(row, account, reactions=None):
    return {
        "id": row.id,
        "post_id": row.post_id,
        "sender_id": row.sender_id,
        "content": row.content or "",
        "username": (account.username if account else "") or "",
        "display_name": public_display_name(account) if account else "",
        "avatar": public_avatar(account) if account else {},
        "created_at": str(row.created_at) if row.created_at else None,
        "edited": bool(row.edited),
        "reactions": reactions if reactions is not None else [],
        "chatKind": "news_comment",
    }


def news_comment_text(raw):
    text = (raw or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Write a comment first.")
    return text[:4000]


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


def news_broadcast_is_open(row, now):
    if not row or row.cleared_at:
        return False
    if row.starts_at and row.starts_at > now:
        return False
    if row.ends_at and row.ends_at <= now:
        return False
    return True


def pack_live_news_broadcast(row):
    if not row:
        return {
            "id": None,
            "message": "",
            "color": "",
            "kind": None,
            "ends_at": None,
            "event_name": None,
        }
    return {
        "id": row.id,
        "message": (row.message or "").strip(),
        "color": news_event_color(row.color) if row.color else "orange",
        "kind": row.kind,
        "ends_at": str(row.ends_at) if row.ends_at else None,
        "event_name": row.event_name or None,
    }


def pack_news_broadcast_row(row, now):
    live = news_broadcast_is_open(row, now)
    return {
        "id": row.id,
        "kind": row.kind,
        "message": (row.message or "").strip(),
        "color": news_event_color(row.color) if row.color else "orange",
        "event_name": row.event_name or None,
        "starts_at": str(row.starts_at) if row.starts_at else None,
        "ends_at": str(row.ends_at) if row.ends_at else None,
        "cleared_at": str(row.cleared_at) if row.cleared_at else None,
        "live": live,
    }


def pick_live_news_broadcast(database, now=None):
    now = now or datetime.utcnow()
    rows = [row for row in database.query(News_broadcast).filter(News_broadcast.cleared_at.is_(None)).all() if news_broadcast_is_open(row, now)]
    manuals = [row for row in rows if row.kind == "manual"]
    if manuals:
        manuals.sort(key=lambda row: (row.starts_at or now, row.id or 0), reverse=True)
        return manuals[0]
    autos = [row for row in rows if row.kind == "automatic"]
    if not autos:
        return None
    running = [row for row in autos if row.event_starts and row.event_starts <= now]
    if running:
        running.sort(key=lambda row: (row.event_starts, row.id or 0), reverse=True)
        return running[0]
    autos.sort(key=lambda row: (row.event_starts or row.starts_at or now, row.id or 0))
    return autos[0]


def close_open_news_broadcast(row, now):
    if not news_broadcast_is_open(row, now):
        return False
    row.cleared_at = now
    if not row.ends_at or row.ends_at > now:
        row.ends_at = now
    return True


def migrate_legacy_news_broadcast(database):
    settings = news_settings_row(database)
    text = ((settings.broadcast if settings else "") or "").strip()
    if not text:
        return False
    if database.query(News_broadcast).first():
        settings.broadcast = None
        return True
    now = datetime.utcnow()
    database.add(News_broadcast(
        kind="manual",
        message=text[:500],
        color="orange",
        starts_at=now,
        created_at=now,
    ))
    settings.broadcast = None
    return True


def sync_auto_news_broadcasts(database):
    now = datetime.utcnow()
    changed = False
    posts = database.query(News_post).filter(News_post.event_starts.isnot(None)).all()
    autos = database.query(News_broadcast).filter(News_broadcast.kind == "automatic").all()
    open_by_post = {}
    cleared_posts = set()
    for row in autos:
        if not row.event_post_id:
            continue
        if row.cleared_at:
            cleared_posts.add(row.event_post_id)
            continue
        open_by_post.setdefault(row.event_post_id, []).append(row)
    seen = set()
    for post in posts:
        seen.add(post.id)
        desc = (post.event_description or "").strip()[:2000]
        color = news_event_color(post.event_color)
        name = (post.event_name or "").strip()[:200] or None
        window_start = post.event_starts - NEWS_BROADCAST_LEAD if post.event_starts else None
        window_end = post.event_ends
        in_window = bool(desc and window_start and window_end and window_start <= now < window_end)
        rows = open_by_post.get(post.id) or []
        row = max(rows, key=lambda item: item.id or 0) if rows else None
        for extra in rows:
            if extra is not row and news_broadcast_is_open(extra, now):
                extra.ends_at = now
                changed = True
        if post.id in cleared_posts:
            if row and news_broadcast_is_open(row, now):
                row.ends_at = now
                changed = True
            continue
        if in_window:
            if not row:
                database.add(News_broadcast(
                    kind="automatic",
                    message=desc,
                    color=color,
                    event_post_id=post.id,
                    event_name=name,
                    event_starts=post.event_starts,
                    starts_at=window_start,
                    ends_at=window_end,
                    created_at=now,
                ))
                changed = True
            elif (
                row.message != desc
                or row.color != color
                or row.event_name != name
                or row.event_starts != post.event_starts
                or row.starts_at != window_start
                or row.ends_at != window_end
            ):
                row.message = desc
                row.color = color
                row.event_name = name
                row.event_starts = post.event_starts
                row.starts_at = window_start
                row.ends_at = window_end
                changed = True
        elif row and news_broadcast_is_open(row, now):
            row.ends_at = now
            changed = True
    for post_id, rows in open_by_post.items():
        if post_id in seen:
            continue
        for row in rows:
            if news_broadcast_is_open(row, now):
                row.ends_at = now
                changed = True
    return changed


def store_live_news_broadcast(database, packed):
    settings = news_settings_row(database)
    message = (packed.get("message") or "").strip() or None
    if settings.broadcast == message:
        return False
    settings.broadcast = message
    return True


def news_broadcast_sig(packed):
    return (
        packed.get("id"),
        packed.get("message") or "",
        packed.get("color") or "",
        packed.get("kind") or "",
        packed.get("ends_at") or "",
    )


def prepare_news_broadcast(database):
    changed = migrate_legacy_news_broadcast(database)
    if sync_auto_news_broadcasts(database):
        changed = True
    live = pick_live_news_broadcast(database)
    packed = pack_live_news_broadcast(live)
    if store_live_news_broadcast(database, packed):
        changed = True
    if changed:
        database.commit()
        live = pick_live_news_broadcast(database)
        packed = pack_live_news_broadcast(live)
    return packed


async def publish_news_broadcast(database):
    global _news_broadcast_sig
    packed = prepare_news_broadcast(database)
    sig = news_broadcast_sig(packed)
    _news_broadcast_sig = sig
    await fanout_news({"type": "news_broadcast", **packed})
    return packed


async def sweep_news_broadcasts():
    global _news_broadcast_sig
    while True:
        await asyncio.sleep(30)
        database = SessionLocal()
        try:
            packed = prepare_news_broadcast(database)
            sig = news_broadcast_sig(packed)
            if sig != _news_broadcast_sig:
                _news_broadcast_sig = sig
                await fanout_news({"type": "news_broadcast", **packed})
        except Exception:
            database.rollback()
        finally:
            database.close()


@router.get("/news/broadcast")
def get_news_broadcast(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    return prepare_news_broadcast(database)


@router.get("/news/broadcasts")
def list_news_broadcasts(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    now = datetime.utcnow()
    prepare_news_broadcast(database)
    rows = (
        database.query(News_broadcast)
        .order_by(News_broadcast.starts_at.desc(), News_broadcast.id.desc())
        .limit(80)
        .all()
    )
    return {
        "live": pack_live_news_broadcast(pick_live_news_broadcast(database, now)),
        "broadcasts": [pack_news_broadcast_row(row, now) for row in rows if not row.starts_at or row.starts_at <= now],
    }


@router.post("/news/broadcast")
async def save_news_broadcast(
    body: News_broadcast_in,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    message = (body.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Broadcast is empty.")
    if len(message) > 500:
        raise HTTPException(status_code=400, detail="Broadcast is too long.")
    hours = int(body.duration_hours or 0)
    if hours < NEWS_BROADCAST_HOURS_MIN or hours > NEWS_BROADCAST_HOURS_MAX:
        raise HTTPException(status_code=400, detail="Duration must be between 1 and 720 hours.")
    now = datetime.utcnow()
    prepare_news_broadcast(database)
    for row in database.query(News_broadcast).filter(News_broadcast.kind == "manual", News_broadcast.cleared_at.is_(None)).all():
        close_open_news_broadcast(row, now)
    database.add(News_broadcast(
        kind="manual",
        message=message,
        color=news_event_color(body.color),
        starts_at=now,
        ends_at=now + timedelta(hours=hours),
        created_at=now,
        created_by=current_user.id,
    ))
    database.commit()
    packed = await publish_news_broadcast(database)
    return packed


@router.post("/news/broadcast/clear")
async def clear_news_broadcast(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    now = datetime.utcnow()
    prepare_news_broadcast(database)
    live = pick_live_news_broadcast(database, now)
    if live:
        close_open_news_broadcast(live, now)
        database.commit()
    packed = await publish_news_broadcast(database)
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
    reaction_map = reactions_for_messages(database, "news", [row.id for row in rows], current_user.id)
    return {"posts": [pack_news_post(row, accounts.get(row.sender_id), reaction_map.get(row.id, [])) for row in rows]}


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
    packed = pack_news_post(row, current_user, [])
    await fanout_news({"type": "news_created", "post": packed}, exclude_user_id=current_user.id)
    await publish_news_broadcast(database)
    return packed


@router.post("/news/posts/edit")
async def edit_news_post(
    body: News_edit,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    row = database.query(News_post).filter(News_post.id == body.post_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")
    items = normalize_post_attachments(body.attachments)
    require_post_body(body.title, body.body, items)
    fields = getattr(body, "model_fields_set", None) or getattr(body, "__fields_set__", set())
    if "event" in fields and body.event is not None and news_event_started(row):
        raise HTTPException(status_code=400, detail="This event has already started.")
    row.title = (body.title or "").strip()
    row.body = (body.body or "").strip()
    row.comments_open = bool(body.comments_open)
    row.title_align = news_align(body.title_align)
    row.body_align = news_align(body.body_align)
    row.edited = True
    replace_news_attachments(row, items, current_user)
    if "event" in fields:
        set_news_event(row, parse_news_event(body.event) if body.event else None)
    database.commit()
    database.refresh(row)
    packed = pack_news_post(row, current_user, reactions_for_one(database, "news", row.id, current_user.id))
    await fanout_news({"type": "news_updated", "post": packed}, exclude_user_id=current_user.id)
    await publish_news_broadcast(database)
    return packed


@router.post("/news/posts/delete")
async def delete_news_post(
    body: News_id,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    row = database.query(News_post).filter(News_post.id == body.post_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")
    post_id = row.id
    comments = database.query(News_comment).filter(News_comment.post_id == row.id).all()
    for comment in comments:
        clear_reactions(database, "news_comment", comment.id)
        database.delete(comment)
    clear_reactions(database, "news", row.id)
    delete_attachment(row.attachment)
    now = datetime.utcnow()
    for item in database.query(News_broadcast).filter(News_broadcast.kind == "automatic", News_broadcast.event_post_id == post_id, News_broadcast.cleared_at.is_(None)).all():
        if news_broadcast_is_open(item, now):
            item.ends_at = now
    database.delete(row)
    database.commit()
    await fanout_news({"type": "news_deleted", "post_id": post_id}, exclude_user_id=current_user.id)
    await publish_news_broadcast(database)
    return {"post_id": post_id}


@router.post("/news/events/edit")
async def edit_news_event(
    body: News_event_edit,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    row = database.query(News_post).filter(News_post.id == body.post_id).first()
    if not row or not row.event_starts:
        raise HTTPException(status_code=404, detail="Event not found")
    if news_event_started(row):
        raise HTTPException(status_code=400, detail="This event has already started.")
    event = parse_news_event(body)
    set_news_event(row, event)
    database.commit()
    database.refresh(row)
    packed = pack_news_post(row, current_user, reactions_for_one(database, "news", row.id, current_user.id))
    await fanout_news({"type": "news_updated", "post": packed}, exclude_user_id=current_user.id)
    await publish_news_broadcast(database)
    return packed


@router.get("/news/comments/{post_id}")
def list_news_comments(
    post_id: int,
    after_id: int = None,
    limit: int = 25,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    post = database.query(News_post).filter(News_post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    size = max(1, min(int(limit or 25), 50))
    query = database.query(News_comment).filter(News_comment.post_id == post_id)
    if after_id:
        query = query.filter(News_comment.id > after_id)
    rows = query.order_by(News_comment.id.asc()).limit(size).all()
    ids = list({row.sender_id for row in rows if row.sender_id})
    accounts = {account.id: account for account in database.query(UserInfo).filter(UserInfo.id.in_(ids)).all()} if ids else {}
    reaction_map = reactions_for_messages(database, "news_comment", [row.id for row in rows], current_user.id)
    return {
        "post_id": post_id,
        "comments": [pack_news_comment(row, accounts.get(row.sender_id), reaction_map.get(row.id, [])) for row in rows],
    }


@router.post("/news/comments")
async def create_news_comment(
    body: Comment_create,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    post = database.query(News_post).filter(News_post.id == body.post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if not post.comments_open:
        raise HTTPException(status_code=400, detail="Comments are turned off for this post.")
    content = news_comment_text(body.content)
    row = News_comment(post_id=post.id, sender_id=current_user.id, content=content)
    post.comment_count = int(post.comment_count or 0) + 1
    database.add(row)
    database.commit()
    database.refresh(row)
    packed = pack_news_comment(row, current_user, [])
    packed["comment_count"] = int(post.comment_count or 0)
    await fanout_news({"type": "news_comment", "post_id": post.id, "comment": packed}, exclude_user_id=current_user.id)
    if post.sender_id:
        await notify_activity_post_comment(
            database,
            receiver_id=post.sender_id,
            actor_id=current_user.id,
            post_kind="news",
            post_id=post.id,
        )
    return packed


@router.post("/news/comments/edit")
async def edit_news_comment(
    body: Comment_edit,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    row = database.query(News_comment).filter(News_comment.id == body.comment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Comment not found")
    if row.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit comment")
    content = news_comment_text(body.content)
    if (row.content or "") == content:
        return {"id": row.id, "content": row.content, "edited": bool(row.edited), "unchanged": True}
    row.content = content
    row.edited = True
    database.commit()
    await fanout_news({
        "type": "news_comment_edited",
        "post_id": row.post_id,
        "comment_id": row.id,
        "content": row.content,
        "edited": True,
    }, exclude_user_id=current_user.id)
    return {"id": row.id, "content": row.content, "edited": True, "unchanged": False}


@router.post("/news/comments/delete")
async def delete_news_comment(
    body: News_comment_id,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    row = database.query(News_comment).filter(News_comment.id == body.comment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Comment not found")
    post = database.query(News_post).filter(News_post.id == row.post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Comment not found")
    is_admin = (current_user.username or "").strip().lower() == "kiwi"
    if row.sender_id != current_user.id and not is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to delete comment")
    comment_id = row.id
    post_id = post.id
    clear_reactions(database, "news_comment", comment_id)
    database.delete(row)
    post.comment_count = max(0, int(post.comment_count or 0) - 1)
    database.commit()
    await fanout_news({
        "type": "news_comment_deleted",
        "post_id": post_id,
        "comment_id": comment_id,
        "comment_count": int(post.comment_count or 0),
    }, exclude_user_id=current_user.id)
    return {"comment_id": comment_id, "comment_count": int(post.comment_count or 0)}
