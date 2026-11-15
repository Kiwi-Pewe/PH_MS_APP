from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Community_policy, UserInfo
from app.schemas import Community_policy_in

router = APIRouter()

DEFAULTS = {
    "post_body_max": 1500,
    "post_emoji_max": 50,
    "post_topic_max": 4,
    "post_topic_len": 40,
    "room_name_max": 15,
    "room_about_max": 500,
    "room_topic_max": 3,
    "room_own_max": 3,
    "room_join_max": 5,
    "room_cap": 15,
    "phone_find_minutes": 5,
    "phone_idle_minutes": 15,
    "listing_tag_max": 5,
}
BOUNDS = {
    "post_body_max": (10, 5000),
    "post_emoji_max": (1, 200),
    "post_topic_max": (1, 12),
    "post_topic_len": (4, 80),
    "room_name_max": (3, 40),
    "room_about_max": (20, 2000),
    "room_topic_max": (1, 12),
    "room_own_max": (1, 20),
    "room_join_max": (1, 50),
    "room_cap": (2, 50),
    "phone_find_minutes": (1, 60),
    "phone_idle_minutes": (1, 180),
    "listing_tag_max": (1, 20),
}


def require_oneira_admin(user):
    if (user.username or "").strip().lower() != "kiwi":
        raise HTTPException(status_code=403, detail="Admin Panel is not available.")
    return user


def clamp_policy_int(key, value):
    low, high = BOUNDS[key]
    try:
        number = int(value)
    except (TypeError, ValueError):
        return DEFAULTS[key]
    if number < low:
        return low
    if number > high:
        return high
    return number


def pack_policy(row):
    packed = dict(DEFAULTS)
    if not row:
        return packed
    for key in DEFAULTS:
        packed[key] = clamp_policy_int(key, getattr(row, key, DEFAULTS[key]))
    return packed


def policy_row(database):
    row = database.query(Community_policy).filter(Community_policy.id == 1).first()
    if row:
        return row
    row = Community_policy(id=1, **DEFAULTS)
    database.add(row)
    database.commit()
    database.refresh(row)
    return row


def load_policy(database):
    return pack_policy(policy_row(database))


def minutes_label(value):
    number = int(value)
    return str(number) + (" minute" if number == 1 else " minutes")


def phone_find_fail(minutes):
    return "User finder failed, no user found within " + minutes_label(minutes) + "."


def phone_idle_end(minutes):
    return "No activity within last " + minutes_label(minutes) + "."


def room_join_full(join_max):
    return "You can only be in " + str(int(join_max)) + " rooms at once."


@router.get("/community_policy")
def community_policy_get(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    return load_policy(database)


@router.get("/admin/community_policy")
def admin_community_policy_get(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    return load_policy(database)


@router.post("/admin/community_policy")
def admin_community_policy_save(
    body: Community_policy_in,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    row = policy_row(database)
    payload = body.model_dump(exclude_unset=True)
    for key in DEFAULTS:
        if key in payload and payload[key] is not None:
            setattr(row, key, clamp_policy_int(key, payload[key]))
    database.commit()
    database.refresh(row)
    return pack_policy(row)
