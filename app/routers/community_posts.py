import json
import random
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Community_comment, Community_edge, Community_post, UserInfo
from app.privacy import blocked_user_ids, drop_blocked_rows
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
from app.schemas import Community_comment_create, Community_filter_entry, Community_post_create, Community_post_prefs

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
        "explicit": bool(row.explicit),
        "followers_only": bool(row.followers_only),
        "covered": False,
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
        "covered": False,
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


COMMUNITY_FILTER_KINDS = {"word": "mute_word", "topic": "mute_topic"}
COMMUNITY_FILTER_MAX = 100
COMMUNITY_FILTER_LEN = 40
COMMUNITY_PREF_KIND = "post_pref"
COMMUNITY_COMMENT_SORTS = ("oldest", "newest")


def clean_filter_label(value):
    word = " ".join(str(value or "").split()).lower()
    if len(word) > COMMUNITY_FILTER_LEN:
        word = word[:COMMUNITY_FILTER_LEN].rstrip()
    return word


def load_post_filters(database, user_id):
    found = {"words": [], "topics": [], "comment_sort": "oldest", "search_blacklist": False}
    if not user_id:
        return found
    rows = database.query(Community_edge).filter(
        Community_edge.user_id == user_id,
        Community_edge.kind.in_(("mute_word", "mute_topic", COMMUNITY_PREF_KIND)),
    ).order_by(Community_edge.created_at.asc(), Community_edge.id.asc()).all()
    for edge in rows:
        if edge.kind == "mute_word" and edge.label:
            found["words"].append(edge.label)
        elif edge.kind == "mute_topic" and edge.label:
            found["topics"].append(edge.label)
        elif edge.kind == COMMUNITY_PREF_KIND:
            if edge.label == "comment_sort" and edge.mode in COMMUNITY_COMMENT_SORTS:
                found["comment_sort"] = edge.mode
            elif edge.label == "search_blacklist":
                found["search_blacklist"] = edge.mode == "on"
    return found


def filter_word_hit(text, words):
    body = str(text or "")
    if not body or not words:
        return False
    for word in words:
        if re.search(r"(?<!\w)" + re.escape(word) + r"(?!\w)", body, flags=re.I):
            return True
    return False


def filter_topic_hit(raw_topics, topics):
    if not topics:
        return False
    wanted = set(topics)
    if isinstance(raw_topics, str):
        try:
            parsed = json.loads(raw_topics) if raw_topics else []
        except (TypeError, ValueError):
            parsed = []
    else:
        parsed = raw_topics or []
    if not isinstance(parsed, list):
        return False
    return any(" ".join(str(item or "").split()).lower() in wanted for item in parsed)


def post_row_blacklisted(row, viewer_id, filters):
    if not filters or row.author_id == viewer_id:
        return False
    return filter_word_hit(row.body, filters["words"]) or filter_topic_hit(row.topics, filters["topics"])


def cover_packed_post(packed, viewer_id, filters):
    if not filters:
        return packed
    if packed.get("author_id") != viewer_id:
        packed["covered"] = filter_word_hit(packed.get("body"), filters["words"]) or filter_topic_hit(packed.get("topics"), filters["topics"])
    for comment in packed.get("comments") or []:
        if comment.get("author_id") != viewer_id:
            comment["covered"] = filter_word_hit(comment.get("body"), filters["words"])
    return packed


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
    packed = pack_community_post(row, people, viewer_id, replies=len(children), comments=comments, vote=vote)
    return cover_packed_post(packed, viewer_id, load_post_filters(database, viewer_id))


COMMUNITY_SEARCH_HAS = ("image", "video", "sound", "file", "link")
COMMUNITY_LINK_RE = re.compile(r"https?://", re.I)


def community_search_has(raw):
    wanted = []
    for item in raw or []:
        kind = str(item or "").strip().lower()
        if kind in COMMUNITY_SEARCH_HAS and kind not in wanted:
            wanted.append(kind)
    return wanted


def community_search_account(database, name):
    handle = str(name or "").strip()
    if not handle:
        return None
    return database.query(UserInfo).filter(func.lower(UserInfo.username) == handle.lower()).first()


def community_attachment_kinds(raw):
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return []
    if isinstance(parsed, dict):
        parsed = [parsed]
    if not isinstance(parsed, list):
        return []
    kinds = []
    for item in parsed:
        if isinstance(item, dict) and item.get("kind"):
            kinds.append(str(item.get("kind")))
    return kinds


def community_has_match(texts, raws, kinds):
    if not kinds:
        return True
    stored = []
    for raw in raws or []:
        stored.extend(community_attachment_kinds(raw))
    blob = "\n".join(str(text or "") for text in (texts or []))
    for kind in kinds:
        if kind == "link":
            if not COMMUNITY_LINK_RE.search(blob):
                return False
        elif kind == "file":
            if not stored:
                return False
        elif kind == "sound":
            if "audio" not in stored:
                return False
        elif kind not in stored:
            return False
    return True


def community_mention_hit(text, account):
    body = str(text or "")
    token = "<@" + str(int(account.id)) + ">"
    if token in body:
        return True
    pattern = r"@" + re.escape(account.username or "") + r"\b"
    return bool(re.search(pattern, body, flags=re.I))


def community_mentions_any(texts, account):
    if account is None:
        return True
    return any(community_mention_hit(text, account) for text in (texts or []))


def community_topic_hit(raw, topic):
    want = str(topic or "").strip().lower()
    if not want:
        return True
    try:
        parsed = json.loads(raw) if raw else []
    except (TypeError, ValueError):
        parsed = []
    if not isinstance(parsed, list):
        return False
    return any(str(item or "").strip().lower() == want for item in parsed)


def community_post_text_hit(row, account, needle):
    from app.routers.profile import public_display_name
    query = str(needle or "").strip().lower()
    if not query:
        return True
    fields = [row.body or "", account.username or "", public_display_name(account) or ""]
    try:
        parsed = json.loads(row.topics) if row.topics else []
    except (TypeError, ValueError):
        parsed = []
    if isinstance(parsed, list):
        fields.extend(str(item or "") for item in parsed)
    return any(query in str(field).lower() for field in fields)


def community_search_on(q, author, mentions, topic, kinds):
    return bool(str(q or "").strip() or str(author or "").strip() or str(mentions or "").strip() or str(topic or "").strip() or kinds)


@router.get("/community_posts")
def list_community_posts(
    lens: str = "explore",
    before: str = "",
    q: str = "",
    author: str = "",
    mentions: str = "",
    topic: str = "",
    has: list[str] = Query(default=[]),
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    kind = (lens or "").strip().lower()
    if kind not in COMMUNITY_LENSES:
        kind = "explore"
    as_of = community_stamp(before)
    if kind == "timeline":
        return {"posts": [], "as_of": as_of.isoformat()}
    kinds = community_search_has(has)
    searching = community_search_on(q, author, mentions, topic, kinds)
    filters = load_post_filters(database, current_user.id)
    if searching:
        author_name = str(author or "").strip()
        mention_name = str(mentions or "").strip()
        author_account = community_search_account(database, author_name) if author_name else None
        mention_account = community_search_account(database, mention_name) if mention_name else None
        if (author_name and author_account is None) or (mention_name and mention_account is None):
            return {"posts": [], "as_of": as_of.isoformat()}
        query = database.query(Community_post, UserInfo).join(UserInfo, UserInfo.id == Community_post.author_id)
        query = query.filter(Community_post.created_at <= as_of)
        if kind == "following":
            query = query.filter(Community_post.author_id == current_user.id)
        else:
            query = query.filter(Community_post.followers_only.is_(False))
        if author_account is not None:
            query = query.filter(Community_post.author_id == author_account.id)
        blocked = blocked_user_ids(database, current_user.id)
        rows = []
        for row, account in query.order_by(Community_post.created_at.desc(), Community_post.id.desc()).yield_per(40):
            if row.author_id in blocked:
                continue
            if not filters["search_blacklist"] and post_row_blacklisted(row, current_user.id, filters):
                continue
            if not community_topic_hit(row.topics, topic):
                continue
            if not community_has_match([row.body], [row.attachments], kinds):
                continue
            if not community_mentions_any([row.body], mention_account):
                continue
            if not community_post_text_hit(row, account, q):
                continue
            rows.append(row)
            if len(rows) >= COMMUNITY_POST_PAGE:
                break
    else:
        query = database.query(Community_post).filter(Community_post.created_at <= as_of)
        if kind == "following":
            query = query.filter(Community_post.author_id == current_user.id)
        else:
            query = query.filter(Community_post.followers_only.is_(False))
        rows = drop_blocked_rows(
            database,
            current_user.id,
            query.order_by(Community_post.created_at.desc(), Community_post.id.desc()).limit(COMMUNITY_POST_PAGE).all(),
            "author_id",
        )
    counts = comment_counts(database, [row.id for row in rows])
    people = author_map(database, [row.author_id for row in rows])
    votes = votes_for(database, current_user.id, [row.id for row in rows])
    posts = [
        cover_packed_post(pack_community_post(row, people, current_user.id, counts.get(row.id, 0), vote=votes.get(row.id)), current_user.id, filters)
        for row in rows
    ]
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
        explicit=bool(body.explicit),
        followers_only=bool(body.followers_only),
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


def filter_edge_kind(kind):
    edge_kind = COMMUNITY_FILTER_KINDS.get(str(kind or "").strip().lower())
    if not edge_kind:
        raise HTTPException(status_code=400, detail="Unknown list.")
    return edge_kind


@router.get("/community_post_settings")
def get_community_post_settings(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    return load_post_filters(database, current_user.id)


@router.post("/community_post_settings/filters")
def add_community_post_filter(
    body: Community_filter_entry,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    edge_kind = filter_edge_kind(body.kind)
    label = clean_filter_label(body.label)
    if not label:
        raise HTTPException(status_code=400, detail="Type something first.")
    existing = database.query(Community_edge).filter(
        Community_edge.user_id == current_user.id,
        Community_edge.kind == edge_kind,
        Community_edge.target_id == 0,
        Community_edge.label == label,
    ).first()
    if not existing:
        count = database.query(func.count(Community_edge.id)).filter(
            Community_edge.user_id == current_user.id,
            Community_edge.kind == edge_kind,
        ).scalar() or 0
        if count >= COMMUNITY_FILTER_MAX:
            raise HTTPException(status_code=400, detail="This list is full.")
        database.add(Community_edge(user_id=current_user.id, kind=edge_kind, target_id=0, label=label))
        database.commit()
    return load_post_filters(database, current_user.id)


@router.delete("/community_post_settings/filters")
def remove_community_post_filter(
    body: Community_filter_entry,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    edge_kind = filter_edge_kind(body.kind)
    label = clean_filter_label(body.label)
    database.query(Community_edge).filter(
        Community_edge.user_id == current_user.id,
        Community_edge.kind == edge_kind,
        Community_edge.target_id == 0,
        Community_edge.label == label,
    ).delete(synchronize_session=False)
    database.commit()
    return load_post_filters(database, current_user.id)


def save_post_pref(database, user_id, label, mode):
    edge = database.query(Community_edge).filter(
        Community_edge.user_id == user_id,
        Community_edge.kind == COMMUNITY_PREF_KIND,
        Community_edge.target_id == 0,
        Community_edge.label == label,
    ).first()
    if edge:
        edge.mode = mode
    else:
        database.add(Community_edge(user_id=user_id, kind=COMMUNITY_PREF_KIND, target_id=0, label=label, mode=mode))


@router.patch("/community_post_settings")
def update_community_post_settings(
    body: Community_post_prefs,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    if body.comment_sort is not None:
        sort = str(body.comment_sort).strip().lower()
        if sort not in COMMUNITY_COMMENT_SORTS:
            raise HTTPException(status_code=400, detail="Unknown sort.")
        save_post_pref(database, current_user.id, "comment_sort", sort)
    if body.search_blacklist is not None:
        save_post_pref(database, current_user.id, "search_blacklist", "on" if body.search_blacklist else "off")
    database.commit()
    return load_post_filters(database, current_user.id)
