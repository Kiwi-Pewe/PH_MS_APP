import json
import random
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Community_comment, Community_edge, Community_post, UserInfo
from app.privacy import drop_blocked_rows
from app.r2 import (
    ALLOWED_MIME,
    PROFILE_MUSIC_KEY_RE,
    delete_attachment,
    max_upload_bytes,
    normalize_mime,
    normalize_post_attachments,
    post_attachments_public,
    public_url_for,
    still_url_for,
    store_attachment,
)
from app.schemas import Community_comment_create, Community_post_create

router = APIRouter()

COMMUNITY_BODY_MAX = 1500
COMMUNITY_EMOJI_MAX = 50
COMMUNITY_TOPIC_MAX = 4
COMMUNITY_TOPIC_LEN = 40
COMMUNITY_POST_PAGE = 50
COMMUNITY_CODE_ALPHABET = "234679ACDEFGHJKLMNPQRTUVWXYZ"
COMMUNITY_LENSES = ("following", "timeline", "explore")


def community_emoji_count(text):
    count = 0
    for ch in text or "":
        code = ord(ch)
        if code in (0x200D, 0xFE0F) or 0x1F3FB <= code <= 0x1F3FF:
            continue
        if (
            0x1F300 <= code <= 0x1FAFF
            or 0x2600 <= code <= 0x27BF
            or 0x1F1E6 <= code <= 0x1F1FF
        ):
            count += 1
    return count


def clean_community_body(value):
    text = (value or "").replace("\r\n", "\n").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Write something first.")
    if len(text) > COMMUNITY_BODY_MAX:
        raise HTTPException(status_code=400, detail="Post is over 1500 characters.")
    if community_emoji_count(text) > COMMUNITY_EMOJI_MAX:
        raise HTTPException(status_code=400, detail="Post is over 50 emoji.")
    return text


def clean_community_topics(raw):
    topics = []
    seen = set()
    for item in raw or []:
        word = " ".join(str(item or "").split())
        if len(word) > COMMUNITY_TOPIC_LEN:
            word = word[:COMMUNITY_TOPIC_LEN].rstrip()
        if not word:
            continue
        key = word.lower()
        if key in seen:
            continue
        seen.add(key)
        topics.append(word)
        if len(topics) >= COMMUNITY_TOPIC_MAX:
            break
    return topics


def community_stamp(value):
    if not value:
        return datetime.utcnow()
    text = str(value).strip().replace("Z", "")
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        raise HTTPException(status_code=400, detail="Bad time.")


def new_community_code(database):
    for _ in range(24):
        code = "".join(random.choices(COMMUNITY_CODE_ALPHABET, k=10))
        taken = database.query(Community_post.id).filter(Community_post.code == code).first()
        if not taken:
            return code
    raise HTTPException(status_code=500, detail="Could not make a post code.")


def store_community_attachments(atts, user):
    items = normalize_post_attachments(atts)
    if not items:
        return None
    packed = []
    for att in items:
        mime = normalize_mime(att.mime)
        if mime not in ALLOWED_MIME:
            raise HTTPException(status_code=400, detail="File type not allowed.")
        kind = ALLOWED_MIME[mime][1]
        if kind == "audio":
            cap = max_upload_bytes(user, "profile", mime)
            if att.size < 1 or att.size > cap:
                raise HTTPException(status_code=400, detail="File too large.")
            if not PROFILE_MUSIC_KEY_RE.match(att.key) or not att.key.endswith(".mp3"):
                raise HTTPException(status_code=400, detail="Invalid upload key.")
            name = (att.name or "").replace("\\", "/").split("/")[-1][:200]
            packed.append({
                "key": att.key,
                "url": public_url_for(att.key),
                "kind": "audio",
                "mime": mime,
                "size": att.size,
                "name": name,
                "explicit": bool(getattr(att, "explicit", False)),
            })
            continue
        packed.append(json.loads(store_attachment(att, user)))
        if still_url_for(att.key) and "still_url" not in packed[-1]:
            packed[-1]["still_url"] = still_url_for(att.key)
    return json.dumps(packed)


def author_map(database, user_ids):
    from app.routers.profile import public_avatar, public_display_name
    ids = [item for item in set(user_ids) if item]
    if not ids:
        return {}
    rows = database.query(UserInfo).filter(UserInfo.id.in_(ids)).all()
    return {
        row.id: {
            "username": row.username or "",
            "display_name": public_display_name(row),
            "avatar": public_avatar(row),
        }
        for row in rows
    }


def pack_community_post(row, people, viewer_id, replies=0, comments=None, vote=None):
    person = people.get(row.author_id) or {}
    topics = []
    if row.topics:
        try:
            parsed = json.loads(row.topics)
        except (TypeError, ValueError):
            parsed = []
        if isinstance(parsed, list):
            topics = [str(item) for item in parsed if str(item or "").strip()]
    created = row.created_at.isoformat() if row.created_at else ""
    return {
        "code": row.code,
        "author_id": row.author_id,
        "username": person.get("username") or "",
        "display_name": person.get("display_name") or person.get("username") or "",
        "avatar": person.get("avatar"),
        "mine": row.author_id == viewer_id,
        "body": row.body or "",
        "topics": topics,
        "attachments": post_attachments_public(row.attachments),
        "created_at": created,
        "replies": int(replies or 0),
        "reposts": 0,
        "likes": int(row.likes or 0),
        "dislikes": int(row.dislikes or 0),
        "liked": bool(vote and vote.get("liked")),
        "disliked": bool(vote and vote.get("disliked")),
        "comments": comments or [],
    }


def comment_counts(database, post_ids):
    ids = [item for item in post_ids if item]
    if not ids:
        return {}
    rows = (
        database.query(Community_comment.post_id, func.count(Community_comment.id))
        .filter(Community_comment.post_id.in_(ids))
        .group_by(Community_comment.post_id)
        .all()
    )
    return {post_id: count for post_id, count in rows}


def pack_community_comment(row, people, viewer_id):
    person = people.get(row.author_id) or {}
    created = row.created_at.isoformat() if row.created_at else ""
    return {
        "author_id": row.author_id,
        "username": person.get("username") or "",
        "display_name": person.get("display_name") or person.get("username") or "",
        "avatar": person.get("avatar"),
        "mine": row.author_id == viewer_id,
        "body": row.body or "",
        "created_at": created,
    }


def root_by_code(database, code):
    text = (code or "").strip()
    if len(text) != 10 or any(ch not in COMMUNITY_CODE_ALPHABET for ch in text):
        raise HTTPException(status_code=404, detail="Post not found.")
    row = database.query(Community_post).filter(Community_post.code == text).first()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found.")
    return row


def votes_for(database, user_id, post_ids):
    ids = [item for item in post_ids if item]
    found = {item: {"liked": False, "disliked": False} for item in ids}
    if not ids or not user_id:
        return found
    rows = database.query(Community_edge).filter(
        Community_edge.user_id == user_id,
        Community_edge.target_id.in_(ids),
        Community_edge.kind.in_(("like", "dislike")),
    ).all()
    for edge in rows:
        slot = found.get(edge.target_id)
        if not slot:
            continue
        if edge.kind == "like":
            slot["liked"] = True
        elif edge.kind == "dislike":
            slot["disliked"] = True
    return found


def shift_community_vote(row, kind, delta):
    if kind == "like":
        row.likes = max(0, int(row.likes or 0) + delta)
    else:
        row.dislikes = max(0, int(row.dislikes or 0) + delta)


def apply_community_vote(database, row, user_id, kind):
    other = "dislike" if kind == "like" else "like"
    edges = database.query(Community_edge).filter(
        Community_edge.user_id == user_id,
        Community_edge.target_id == row.id,
        Community_edge.kind.in_(("like", "dislike")),
    ).all()
    have = {edge.kind: edge for edge in edges}
    if kind in have:
        database.delete(have[kind])
        shift_community_vote(row, kind, -1)
    else:
        if other in have:
            database.delete(have[other])
            shift_community_vote(row, other, -1)
        database.add(Community_edge(user_id=user_id, kind=kind, target_id=row.id, label=""))
        shift_community_vote(row, kind, 1)
    database.commit()
    database.refresh(row)


def pack_with_comments(database, row, viewer_id):
    children = drop_blocked_rows(
        database,
        viewer_id,
        database.query(Community_comment).filter(Community_comment.post_id == row.id).order_by(Community_comment.created_at.asc(), Community_comment.id.asc()).all(),
        "author_id",
    )
    people = author_map(database, [row.author_id] + [child.author_id for child in children])
    comments = [pack_community_comment(child, people, viewer_id) for child in children]
    vote = votes_for(database, viewer_id, [row.id]).get(row.id)
    return pack_community_post(row, people, viewer_id, replies=len(children), comments=comments, vote=vote)


@router.get("/community_posts")
def list_community_posts(
    lens: str = "explore",
    before: str = "",
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    kind = (lens or "").strip().lower()
    if kind not in COMMUNITY_LENSES:
        kind = "explore"
    as_of = community_stamp(before)
    if kind == "timeline":
        return {"posts": [], "as_of": as_of.isoformat()}
    query = database.query(Community_post).filter(Community_post.created_at <= as_of)
    if kind == "following":
        query = query.filter(Community_post.author_id == current_user.id)
    rows = drop_blocked_rows(
        database,
        current_user.id,
        query.order_by(Community_post.created_at.desc(), Community_post.id.desc()).limit(COMMUNITY_POST_PAGE).all(),
        "author_id",
    )
    counts = comment_counts(database, [row.id for row in rows])
    people = author_map(database, [row.author_id for row in rows])
    votes = votes_for(database, current_user.id, [row.id for row in rows])
    posts = [pack_community_post(row, people, current_user.id, counts.get(row.id, 0), vote=votes.get(row.id)) for row in rows]
    return {"posts": posts, "as_of": as_of.isoformat()}


@router.get("/community_posts/{code}")
def get_community_post(
    code: str,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    row = root_by_code(database, code)
    hidden = drop_blocked_rows(database, current_user.id, [row], "author_id")
    if not hidden:
        raise HTTPException(status_code=404, detail="Post not found.")
    return pack_with_comments(database, row, current_user.id)


@router.post("/community_posts")
def create_community_post(
    body: Community_post_create,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    text = clean_community_body(body.body)
    topics = clean_community_topics(body.topics)
    attachments = store_community_attachments(body.attachments, current_user)
    row = Community_post(
        code=new_community_code(database),
        author_id=current_user.id,
        body=text,
        topics=json.dumps(topics) if topics else None,
        attachments=attachments,
    )
    database.add(row)
    database.commit()
    database.refresh(row)
    return pack_with_comments(database, row, current_user.id)


@router.post("/community_posts/{code}/comments")
def create_community_comment(
    code: str,
    body: Community_comment_create,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    parent = root_by_code(database, code)
    hidden = drop_blocked_rows(database, current_user.id, [parent], "author_id")
    if not hidden:
        raise HTTPException(status_code=404, detail="Post not found.")
    text = clean_community_body(body.body)
    row = Community_comment(
        post_id=parent.id,
        author_id=current_user.id,
        body=text,
    )
    database.add(row)
    database.commit()
    return pack_with_comments(database, parent, current_user.id)


@router.delete("/community_posts/{code}")
def delete_community_post(
    code: str,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    row = root_by_code(database, code)
    if row.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own post.")
    children = database.query(Community_comment).filter(Community_comment.post_id == row.id).all()
    for child in children:
        database.delete(child)
    database.query(Community_edge).filter(
        Community_edge.target_id == row.id,
        Community_edge.kind.in_(("like", "dislike")),
    ).delete(synchronize_session=False)
    delete_attachment(row.attachments)
    database.delete(row)
    database.commit()
    return {"ok": True}


def cast_community_vote(code, kind, database, current_user):
    row = root_by_code(database, code)
    hidden = drop_blocked_rows(database, current_user.id, [row], "author_id")
    if not hidden:
        raise HTTPException(status_code=404, detail="Post not found.")
    apply_community_vote(database, row, current_user.id, kind)
    return pack_with_comments(database, row, current_user.id)


@router.post("/community_posts/{code}/like")
def like_community_post(
    code: str,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    return cast_community_vote(code, "like", database, current_user)


@router.post("/community_posts/{code}/dislike")
def dislike_community_post(
    code: str,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    return cast_community_vote(code, "dislike", database, current_user)
