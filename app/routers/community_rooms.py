import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Community_room, Community_room_member, UserInfo
from app.privacy import drop_blocked_rows
from app.schemas import Community_room_create

router = APIRouter()

COMMUNITY_ROOM_NAME_MAX = 80
COMMUNITY_ROOM_TOPIC_MAX = 3
COMMUNITY_ROOM_TOPIC_LEN = 40


def clean_room_name(value):
    name = " ".join(str(value or "").split())
    if not name:
        raise HTTPException(status_code=400, detail="Name the room.")
    if len(name) > COMMUNITY_ROOM_NAME_MAX:
        name = name[:COMMUNITY_ROOM_NAME_MAX].rstrip()
    if not name:
        raise HTTPException(status_code=400, detail="Name the room.")
    return name


def clean_room_topics(raw):
    topics = []
    seen = set()
    for item in raw or []:
        word = " ".join(str(item or "").split())
        if len(word) > COMMUNITY_ROOM_TOPIC_LEN:
            word = word[:COMMUNITY_ROOM_TOPIC_LEN].rstrip()
        if not word:
            continue
        key = word.lower()
        if key in seen:
            continue
        seen.add(key)
        topics.append(word)
        if len(topics) >= COMMUNITY_ROOM_TOPIC_MAX:
            break
    return topics


def room_topics(raw):
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item) for item in parsed if str(item or "").strip()]


def room_people(database, user_ids):
    ids = [item for item in set(user_ids) if item]
    if not ids:
        return {}
    rows = database.query(UserInfo).filter(UserInfo.id.in_(ids)).all()
    return {row.id: (row.username or "") for row in rows}


def member_counts(database, room_ids):
    ids = [item for item in room_ids if item]
    if not ids:
        return {}
    rows = (
        database.query(Community_room_member.room_id, func.count(Community_room_member.id))
        .filter(Community_room_member.room_id.in_(ids))
        .group_by(Community_room_member.room_id)
        .all()
    )
    return {room_id: count for room_id, count in rows}


def joined_room_ids(database, user_id, room_ids):
    ids = [item for item in room_ids if item]
    if not ids or not user_id:
        return set()
    rows = database.query(Community_room_member.room_id).filter(
        Community_room_member.user_id == user_id,
        Community_room_member.room_id.in_(ids),
    ).all()
    return {room_id for (room_id,) in rows}


def pack_community_room(row, viewer_id, people, counts, joined):
    return {
        "id": row.id,
        "name": row.name or "",
        "topics": room_topics(row.topics),
        "handle": people.get(row.owner_id) or "",
        "owned": row.owner_id == viewer_id,
        "joined": row.id in joined,
        "n": int(counts.get(row.id, 0)),
    }


def pack_community_rooms(database, rows, viewer_id):
    ids = [row.id for row in rows]
    people = room_people(database, [row.owner_id for row in rows])
    counts = member_counts(database, ids)
    joined = joined_room_ids(database, viewer_id, ids)
    return [pack_community_room(row, viewer_id, people, counts, joined) for row in rows]


@router.get("/community_rooms")
def list_community_rooms(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    rows = drop_blocked_rows(
        database,
        current_user.id,
        database.query(Community_room).order_by(Community_room.created_at.desc(), Community_room.id.desc()).all(),
        "owner_id",
    )
    return {"rooms": pack_community_rooms(database, rows, current_user.id)}


@router.post("/community_rooms")
def create_community_room(
    body: Community_room_create,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    owned = database.query(Community_room.id).filter(Community_room.owner_id == current_user.id).first()
    if owned:
        raise HTTPException(status_code=400, detail="You already have a room.")
    name = clean_room_name(body.name)
    topics = clean_room_topics(body.topics)
    row = Community_room(
        owner_id=current_user.id,
        name=name,
        topics=json.dumps(topics) if topics else None,
    )
    database.add(row)
    database.flush()
    database.add(Community_room_member(room_id=row.id, user_id=current_user.id))
    database.commit()
    database.refresh(row)
    return pack_community_rooms(database, [row], current_user.id)[0]
