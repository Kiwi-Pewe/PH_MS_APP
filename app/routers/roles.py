import json
import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import UserInfo, Servers, Server_members, Server_roles, Server_role_members, Server_channels, Server_categories, Server_channel_role_perms, Channel_messages, Announcement_post, Forum_post, Forum_messages
from app.schemas import Server_role_member_in, Server_roles_save, Channel_role_perms_save
from app.database import get_db
from app.auth import get_current_user
from app.routers.deletion import write_audit_log
from app.routers.realtime import server_broadcast

router = APIRouter()

ROLE_NAME_MAX = 25
ROLE_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
MEMBERS_POSITION = 10000
DEFAULT_ROLE_COLOR = "#99aab5"

LIVE_ROLE_PERMS = (
    "update_server", "manage_roles", "invite_members", "kick_members",
    "ban_members", "timeout_members", "manage_channels", "mention_everyone", "bypass_slowmode",
    "view_announcements", "create_announcements", "manage_announcements",
    "read_messages", "send_messages", "upload_chat_media", "manage_messages", "pin_messages",
    "read_forums", "create_topics", "create_topic_replies", "manage_topics",
    "sticky_topics", "lock_topics",
    "view_wallpaper", "create_wallpaper", "manage_wallpaper", "remove_wallpaper",
    "view_docs", "create_docs", "manage_docs", "remove_docs",
    "see_media", "create_media", "manage_media", "remove_media",
    "view_events", "create_events", "manage_events", "remove_events", "edit_rsvps",
    "view_schedules", "create_schedule", "delete_schedule",
    "manage_emoji",
)

MEMBERS_DEFAULT_PERMS = (
    "invite_members", "mention_everyone",
    "read_messages", "send_messages", "upload_chat_media", "pin_messages",
    "view_announcements",
    "read_forums", "create_topics", "create_topic_replies",
    "view_wallpaper",
    "view_docs",
    "see_media",
    "view_events",
    "view_schedules", "create_schedule",
)

LIVE_CHANNEL_OVERRIDE_PERMS = (
    "manage_channels",
    "mention_everyone",
    "bypass_slowmode",
    "read_messages",
    "send_messages",
    "upload_chat_media",
    "manage_messages",
    "pin_messages",
    "view_announcements",
    "create_announcements",
    "manage_announcements",
    "read_forums",
    "create_topics",
    "create_topic_replies",
    "manage_topics",
    "sticky_topics",
    "lock_topics",
    "view_wallpaper",
    "create_wallpaper",
    "manage_wallpaper",
    "remove_wallpaper",
    "view_docs",
    "create_docs",
    "manage_docs",
    "remove_docs",
    "see_media",
    "create_media",
    "manage_media",
    "remove_media",
    "view_events",
    "create_events",
    "manage_events",
    "remove_events",
    "edit_rsvps",
    "view_schedules",
    "create_schedule",
    "delete_schedule",
)

CHANNEL_OVERRIDE_DEFAULTS = {
    "mention_everyone": True,
    "read_messages": True,
    "send_messages": True,
    "upload_chat_media": True,
    "pin_messages": True,
    "view_announcements": True,
    "read_forums": True,
    "create_topics": True,
    "create_topic_replies": True,
    "view_wallpaper": True,
    "view_docs": True,
    "see_media": True,
    "view_events": True,
    "view_schedules": True,
    "create_schedule": True,
}


def empty_role_perms():
    return {key: False for key in LIVE_ROLE_PERMS}


def members_default_perms():
    perms = empty_role_perms()
    for key in MEMBERS_DEFAULT_PERMS:
        perms[key] = True
    return perms


def clean_role_color(value):
    text = (value or "").strip()
    if ROLE_COLOR_RE.fullmatch(text):
        return text.lower()
    return DEFAULT_ROLE_COLOR


def clean_role_name(value, fallback="New Role"):
    name = (value or "").strip()
    if not name:
        name = fallback
    if len(name) > ROLE_NAME_MAX:
        name = name[:ROLE_NAME_MAX]
    return name


def lift_legacy_wallpaper_perms(raw):
    if not isinstance(raw, dict):
        return raw
    pairs = (
        ("view_docs", "view_wallpaper"),
        ("create_docs", "create_wallpaper"),
        ("manage_docs", "manage_wallpaper"),
        ("remove_docs", "remove_wallpaper"),
    )
    if any(new in raw for _old, new in pairs):
        return raw
    if not any(old in raw for old, _new in pairs):
        return raw
    lifted = dict(raw)
    for old, new in pairs:
        if old in lifted:
            lifted[new] = lifted.pop(old)
    return lifted


def clean_role_perms(raw):
    raw = lift_legacy_wallpaper_perms(raw)
    perms = empty_role_perms()
    if not isinstance(raw, dict):
        return perms
    for key in LIVE_ROLE_PERMS:
        perms[key] = bool(raw.get(key))
    return perms


def parse_role_perms(row):
    raw = getattr(row, "permissions", None) or ""
    try:
        data = json.loads(raw) if raw else {}
    except (TypeError, ValueError):
        data = {}
    data = lift_legacy_wallpaper_perms(data if isinstance(data, dict) else {})
    perms = clean_role_perms(data)
    if not isinstance(data, dict) or "view_events" not in data:
        perms["view_events"] = True
    if "view_wallpaper" not in data:
        perms["view_wallpaper"] = True
    if "view_docs" not in data:
        perms["view_docs"] = True
    if "see_media" not in data:
        perms["see_media"] = True
    if isinstance(data, dict) and "view_schedules" not in data:
        perms["view_schedules"] = True
    if isinstance(data, dict) and "create_schedule" not in data:
        perms["create_schedule"] = True
    return perms


def serialize_role(row):
    return {
        "id": row.id,
        "name": row.name or "",
        "color": clean_role_color(getattr(row, "color", None)),
        "position": int(row.position or 0),
        "mentionable": bool(row.mentionable),
        "hoist": bool(row.hoist),
        "name_color": bool(row.name_color),
        "self_assignable": bool(getattr(row, "self_assignable", False)),
        "is_members": bool(row.is_members),
        "permissions": parse_role_perms(row),
    }


def list_server_roles(database, server_id):
    rows = database.query(Server_roles).filter(Server_roles.server_id == server_id).order_by(Server_roles.position, Server_roles.id).all()
    return [serialize_role(row) for row in rows]


def ensure_members_role(database, server_id):
    row = database.query(Server_roles).filter(Server_roles.server_id == server_id, Server_roles.is_members == True).first()
    if not row:
        row = Server_roles(
            server_id=server_id,
            name="Members",
            color=DEFAULT_ROLE_COLOR,
            position=MEMBERS_POSITION,
            mentionable=False,
            hoist=False,
            name_color=False,
            self_assignable=False,
            is_members=True,
            permissions=json.dumps(members_default_perms()),
        )
        database.add(row)
        database.flush()
    return row


def assign_members_role(database, server_id, user_id):
    role = ensure_members_role(database, server_id)
    existing = database.query(Server_role_members).filter(
        Server_role_members.role_id == role.id,
        Server_role_members.user_id == user_id,
    ).first()
    if existing:
        return
    database.add(Server_role_members(role_id=role.id, user_id=user_id))


def seed_server_roles(database, server_id):
    role = ensure_members_role(database, server_id)
    members = database.query(Server_members).filter(Server_members.server_id == server_id).all()
    for member in members:
        assign_members_role(database, server_id, member.user_id)
    return role


def serialize_hoist_role(row):
    return {
        "id": row.id,
        "name": row.name or "Role",
        "color": clean_role_color(getattr(row, "color", None)),
        "position": int(row.position or 0),
    }


def hoist_roles_by_user(database, server_id, user_ids=None):
    hoisted = database.query(Server_roles).filter(
        Server_roles.server_id == server_id,
        Server_roles.hoist == True,
    ).all()
    if not hoisted:
        return {}
    hoisted_ids = [row.id for row in hoisted]
    by_id = {row.id: row for row in hoisted}
    query = database.query(Server_role_members).filter(Server_role_members.role_id.in_(hoisted_ids))
    if user_ids is not None:
        query = query.filter(Server_role_members.user_id.in_(list(user_ids)))
    best = {}
    for row in query.all():
        role = by_id.get(row.role_id)
        if not role:
            continue
        current = best.get(row.user_id)
        if current is None or (int(role.position or 0), role.id) < (int(current.position or 0), current.id):
            best[row.user_id] = role
    return {user_id: serialize_hoist_role(role) for user_id, role in best.items()}


def hoist_role_for_user(database, server_id, user_id):
    return hoist_roles_by_user(database, server_id, [user_id]).get(user_id)


def name_color_roles_by_user(database, server_id, user_ids=None):
    colored = database.query(Server_roles).filter(
        Server_roles.server_id == server_id,
        Server_roles.name_color == True,
    ).all()
    if not colored:
        return {}
    colored_ids = [row.id for row in colored]
    by_id = {row.id: row for row in colored}
    query = database.query(Server_role_members).filter(Server_role_members.role_id.in_(colored_ids))
    if user_ids is not None:
        query = query.filter(Server_role_members.user_id.in_(list(user_ids)))
    best = {}
    for row in query.all():
        role = by_id.get(row.role_id)
        if not role:
            continue
        current = best.get(row.user_id)
        if current is None or (int(role.position or 0), role.id) < (int(current.position or 0), current.id):
            best[row.user_id] = role
    return {user_id: serialize_hoist_role(role) for user_id, role in best.items()}


def name_color_role_for_user(database, server_id, user_id):
    return name_color_roles_by_user(database, server_id, [user_id]).get(user_id)


def assigned_roles_for_user(database, server_id, user_id):
    rows = (
        database.query(Server_roles)
        .join(Server_role_members, Server_role_members.role_id == Server_roles.id)
        .filter(Server_roles.server_id == server_id, Server_role_members.user_id == user_id)
        .order_by(Server_roles.position, Server_roles.id)
        .all()
    )
    return [serialize_role(row) for row in rows]


def highest_role_for_user(database, server_id, user_id):
    roles = assigned_roles_for_user(database, server_id, user_id)
    if not roles:
        return None
    return min(roles, key=lambda role: (int(role.get("position") or 0), int(role.get("id") or 0)))


def highest_roles_by_user(database, server_id, user_ids=None):
    rows = (
        database.query(Server_roles, Server_role_members.user_id)
        .join(Server_role_members, Server_role_members.role_id == Server_roles.id)
        .filter(Server_roles.server_id == server_id)
    )
    if user_ids is not None:
        rows = rows.filter(Server_role_members.user_id.in_(list(user_ids)))
    best = {}
    for role, user_id in rows.all():
        current = best.get(user_id)
        if current is None or (int(role.position or 0), role.id) < (int(current["position"] or 0), int(current["id"] or 0)):
            best[user_id] = {
                "id": role.id,
                "position": int(role.position or 0),
                "is_members": bool(role.is_members),
            }
    return best


def can_open_server_roster(database, server, user_id):
    if server.owner_id == user_id:
        return True
    perms = effective_perms_for_user(database, server, user_id)
    return any(perms.get(key) for key in (
        "kick_members", "ban_members", "timeout_members", "manage_roles", "update_server",
    ))


def require_server_roster(database, server, user_id):
    if not can_open_server_roster(database, server, user_id):
        raise HTTPException(status_code=403, detail="You do not have permission to manage members.")
    return True


def can_moderate_target(database, server, actor_id, target_id):
    if actor_id == target_id:
        return False
    if server.owner_id == target_id:
        return False
    if server.owner_id == actor_id:
        return True
    actor_highest = highest_role_for_user(database, server.id, actor_id)
    target_highest = highest_role_for_user(database, server.id, target_id)
    if not actor_highest:
        return False
    if not target_highest:
        return True
    return role_sort_key(actor_highest) < role_sort_key(target_highest)


def owner_role_perms():
    return {key: True for key in LIVE_ROLE_PERMS}


def effective_perms_for_user(database, server, user_id):
    # Any assigned role that says yes wins. Highest role does not veto
    # a lower one. Highest still wins for name color, hoist, and
    # hierarchy (who you can manage / later kick, ban, timeout).
    if server.owner_id == user_id:
        return owner_role_perms()
    seed_server_roles(database, server.id)
    merged = empty_role_perms()
    for role in assigned_roles_for_user(database, server.id, user_id):
        perms = role.get("permissions") or {}
        for key in LIVE_ROLE_PERMS:
            if perms.get(key):
                merged[key] = True
    return merged


def require_server_perm(database, server, user_id, perm, detail="You do not have permission to do that."):
    perms = effective_perms_for_user(database, server, user_id)
    if not perms.get(perm):
        raise HTTPException(status_code=403, detail=detail)
    return perms


def empty_channel_override_perms():
    return {key: bool(CHANNEL_OVERRIDE_DEFAULTS.get(key, False)) for key in LIVE_CHANNEL_OVERRIDE_PERMS}


def clean_channel_override_perms(raw, fallback=None):
    raw = lift_legacy_wallpaper_perms(raw)
    base = fallback if isinstance(fallback, dict) else empty_channel_override_perms()
    perms = {key: bool(base.get(key, CHANNEL_OVERRIDE_DEFAULTS.get(key, False))) for key in LIVE_CHANNEL_OVERRIDE_PERMS}
    if not isinstance(raw, dict):
        return perms
    for key in LIVE_CHANNEL_OVERRIDE_PERMS:
        if key in raw:
            perms[key] = bool(raw.get(key))
    return perms


def parse_channel_override_perms(row):
    raw = getattr(row, "permissions", None) or ""
    try:
        data = json.loads(raw) if raw else {}
    except (TypeError, ValueError):
        data = {}
    return clean_channel_override_perms(data)


def channel_overrides_by_role(database, channel_id):
    rows = database.query(Server_channel_role_perms).filter(
        Server_channel_role_perms.channel_id == channel_id
    ).all()
    return {int(row.role_id): parse_channel_override_perms(row) for row in rows}


def role_perm_in_channel(server_perms, override, perm):
    if perm not in LIVE_CHANNEL_OVERRIDE_PERMS:
        return bool((server_perms or {}).get(perm))
    if override is not None:
        return bool(override.get(perm))
    if isinstance(server_perms, dict) and perm in server_perms:
        return bool(server_perms.get(perm))
    return bool(CHANNEL_OVERRIDE_DEFAULTS.get(perm, False))


def effective_perms_for_user_in_channel(database, server, user_id, channel_id):
    if server.owner_id == user_id:
        return owner_role_perms()
    seed_server_roles(database, server.id)
    merged = effective_perms_for_user(database, server, user_id)
    overrides = channel_overrides_by_role(database, channel_id)
    for key in LIVE_CHANNEL_OVERRIDE_PERMS:
        merged[key] = False
    for role in assigned_roles_for_user(database, server.id, user_id):
        server_perms = role.get("permissions") or {}
        override = overrides.get(int(role.get("id") or 0))
        for key in LIVE_CHANNEL_OVERRIDE_PERMS:
            if role_perm_in_channel(server_perms, override, key):
                merged[key] = True
    return merged


def require_channel_perm(database, server, user_id, channel_id, perm, detail="You do not have permission to do that."):
    perms = effective_perms_for_user_in_channel(database, server, user_id, channel_id)
    if not perms.get(perm):
        raise HTTPException(status_code=403, detail=detail)
    return perms


SLOWMODE_CHOICES = (0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600)


def normalize_slowmode(value):
    try:
        seconds = int(value)
    except (TypeError, ValueError):
        return 0
    return seconds if seconds in SLOWMODE_CHOICES else 0


def last_channel_slowmode_at(database, channel, user_id):
    kind = getattr(channel, "channel_type", None)
    if kind == "forums":
        post_at = database.query(func.max(Forum_post.created_at)).filter(
            Forum_post.channel_id == channel.id,
            Forum_post.author_id == user_id,
        ).scalar()
        reply_at = database.query(func.max(Forum_messages.created_at)).join(
            Forum_post, Forum_post.id == Forum_messages.post_id
        ).filter(
            Forum_post.channel_id == channel.id,
            Forum_messages.author_id == user_id,
        ).scalar()
        stamps = [stamp for stamp in (post_at, reply_at) if stamp is not None]
        return max(stamps) if stamps else None
    if kind == "announcements":
        return database.query(func.max(Announcement_post.created_at)).filter(
            Announcement_post.channel_id == channel.id,
            Announcement_post.sender_id == user_id,
        ).scalar()
    return database.query(func.max(Channel_messages.timestamp)).filter(
        Channel_messages.channel_id == channel.id,
        Channel_messages.sender_id == user_id,
    ).scalar()


def require_channel_slowmode(database, server, user_id, channel):
    seconds = normalize_slowmode(getattr(channel, "slowmode", 0))
    if seconds <= 0:
        return
    if getattr(channel, "channel_type", None) not in ("text", "announcements", "forums"):
        return
    perms = effective_perms_for_user_in_channel(database, server, user_id, channel.id)
    if perms.get("bypass_slowmode"):
        return
    last_at = last_channel_slowmode_at(database, channel, user_id)
    if last_at is None:
        return
    if getattr(last_at, "tzinfo", None):
        last_at = last_at.replace(tzinfo=None)
    remaining = seconds - (datetime.utcnow() - last_at).total_seconds()
    if remaining > 0:
        wait = max(1, int(remaining + 0.999))
        raise HTTPException(status_code=429, detail=f"Slowmode is enabled. You can send again in {wait} seconds.")


def display_channel_role_perms(database, channel_id, role):
    overrides = channel_overrides_by_role(database, channel_id)
    role_id = int(role.get("id") or 0)
    override = overrides.get(role_id)
    server_perms = role.get("permissions") or {}
    return {
        key: role_perm_in_channel(server_perms, override, key)
        for key in LIVE_CHANNEL_OVERRIDE_PERMS
    }


def channel_type_visible(permissions, channel_type):
    if channel_type == "announcements":
        return bool(permissions.get("view_announcements"))
    if channel_type == "forums":
        return bool(permissions.get("read_forums"))
    if channel_type == "text":
        return bool(permissions.get("read_messages"))
    if channel_type == "doc":
        return bool(permissions.get("view_wallpaper"))
    if channel_type == "docs":
        return bool(permissions.get("view_docs"))
    if channel_type == "media":
        return bool(permissions.get("see_media"))
    if channel_type == "events":
        return bool(permissions.get("view_events"))
    return True


def role_sort_key(role):
    if isinstance(role, dict):
        return (int(role.get("position") or 0), int(role.get("id") or 0))
    return (int(getattr(role, "position", 0) or 0), int(getattr(role, "id", 0) or 0))


def actor_highest_role(database, server, user_id):
    if server.owner_id == user_id:
        return None
    return highest_role_for_user(database, server.id, user_id)


def can_manage_target_role(is_owner, actor_highest, target):
    if is_owner:
        return True
    if not actor_highest or target is None:
        return False
    return role_sort_key(target) > role_sort_key(actor_highest)


def clamp_role_perms(incoming, current, actor_perms, is_owner):
    if is_owner:
        return incoming
    out = dict(incoming)
    for key in LIVE_ROLE_PERMS:
        if not actor_perms.get(key):
            out[key] = bool((current or {}).get(key))
    return out


def next_position_below(database, server_id, actor_highest, extra_positions=None):
    actor_pos = int(actor_highest.get("position") or 0)
    used = {int(row.position or 0) for row in database.query(Server_roles).filter(Server_roles.server_id == server_id).all()}
    if extra_positions:
        used.update(extra_positions)
    pos = actor_pos + 1
    while pos in used:
        pos += 1
    if pos >= MEMBERS_POSITION:
        raise HTTPException(status_code=400, detail="There is no room to create a role below yours.")
    return pos


def require_server_member(database, server_id, user_id):
    server = database.query(Servers).filter(Servers.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    in_server = database.query(Server_members).filter(
        Server_members.server_id == server_id,
        Server_members.user_id == user_id,
    ).first()
    if not in_server:
        raise HTTPException(status_code=404, detail="Server membership not found")
    return server


@router.get("/get_server_perms/{server_id}")
def get_server_perms(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, server_id, current_user.id)
    seed_server_roles(database, server.id)
    database.commit()
    membership = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()
    from app.routers.moderation import iso_dt, timeout_until_for
    return {
        "permissions": effective_perms_for_user(database, server, current_user.id),
        "highest_role": actor_highest_role(database, server, current_user.id),
        "timeout_until": iso_dt(timeout_until_for(membership)),
    }


@router.get("/get_server_roles/{server_id}")
def get_server_roles(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, server_id, current_user.id)
    seed_server_roles(database, server_id)
    database.commit()
    return {
        "roles": list_server_roles(database, server_id),
        "permissions": effective_perms_for_user(database, server, current_user.id),
        "highest_role": actor_highest_role(database, server, current_user.id),
    }


@router.post("/save_server_roles")
async def save_server_roles(body: Server_roles_save, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    actor_perms = require_server_perm(database, server, current_user.id, "manage_roles", "You do not have permission to manage roles.")
    is_owner = server.owner_id == current_user.id
    actor_highest = None if is_owner else highest_role_for_user(database, server.id, current_user.id)

    seed_server_roles(database, server.id)
    members_row = database.query(Server_roles).filter(Server_roles.server_id == server.id, Server_roles.is_members == True).first()
    existing = {
        row.id: row
        for row in database.query(Server_roles).filter(Server_roles.server_id == server.id).all()
    }
    lowest = database.query(func.min(Server_roles.position)).filter(
        Server_roles.server_id == server.id,
        Server_roles.is_members == False,
    ).scalar()
    next_position = 100 if lowest is None else int(lowest) - 100
    created_positions = []

    saved = []
    created_ids = []
    for item in body.roles or []:
        name = clean_role_name(item.name)
        color = clean_role_color(item.color)
        perms = clean_role_perms(item.permissions)
        mentionable = bool(item.mentionable)
        hoist = bool(item.hoist)
        name_color = bool(item.name_color)
        self_assignable = bool(item.self_assignable)

        if item.id and item.id in existing:
            row = existing[item.id]
            if not can_manage_target_role(is_owner, actor_highest, row):
                raise HTTPException(status_code=403, detail="You can only change roles below yours.")
            perms = clamp_role_perms(perms, parse_role_perms(row), actor_perms, is_owner)
            if row.is_members:
                row.name = clean_role_name(item.name, "Members")
                row.position = MEMBERS_POSITION
            else:
                row.name = name
            row.color = color
            row.mentionable = mentionable
            row.hoist = hoist
            row.name_color = name_color
            row.self_assignable = False if row.is_members else self_assignable
            row.permissions = json.dumps(perms)
            saved.append({"client_id": item.client_id or "", "role": row})
        elif item.id:
            raise HTTPException(status_code=404, detail="Role not found")
        else:
            if not is_owner:
                if not actor_highest or actor_highest.get("is_members"):
                    raise HTTPException(status_code=403, detail="You can only create roles below yours.")
                create_position = next_position_below(database, server.id, actor_highest, created_positions)
                created_positions.append(create_position)
                perms = clamp_role_perms(perms, empty_role_perms(), actor_perms, False)
            else:
                create_position = next_position
                next_position -= 100
            row = Server_roles(
                server_id=server.id,
                name=name,
                color=color,
                position=create_position,
                mentionable=mentionable,
                hoist=hoist,
                name_color=name_color,
                self_assignable=self_assignable,
                is_members=False,
                permissions=json.dumps(perms),
            )
            database.add(row)
            database.flush()
            created_ids.append(row.id)
            saved.append({"client_id": item.client_id or "", "role": row})

    write_audit_log(database, server.id, current_user.id, "roles_modified", "roles", members_row.id if members_row else 0, {
        "updated_ids": [item["role"].id for item in saved if item["role"].id not in created_ids],
        "created_ids": created_ids,
    })
    database.commit()
    payload_roles = list_server_roles(database, server.id)
    await server_broadcast(
        server_id=server.id,
        payload={"type": "server_roles_updated", "server_id": server.id, "roles": payload_roles},
        database=database,
        exclude_user_id=current_user.id,
    )
    return {
        "ok": True,
        "roles": payload_roles,
        "saved": [
            {"client_id": item["client_id"], "id": item["role"].id}
            for item in saved
        ],
    }


@router.post("/set_server_role_member")
async def set_server_role_member(body: Server_role_member_in, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    require_server_member(database, body.server_id, body.user_id)
    seed_server_roles(database, server.id)
    role = database.query(Server_roles).filter(
        Server_roles.id == body.role_id,
        Server_roles.server_id == server.id,
    ).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_members:
        raise HTTPException(status_code=400, detail="The Members role cannot be changed.")
    is_owner = server.owner_id == current_user.id
    is_self = body.user_id == current_user.id
    if not is_owner:
        perms = effective_perms_for_user(database, server, current_user.id)
        if perms.get("manage_roles"):
            if body.user_id == current_user.id:
                raise HTTPException(status_code=403, detail="Use Self-assignable roles on your own account.")
            if not can_moderate_target(database, server, current_user.id, body.user_id):
                raise HTTPException(status_code=403, detail="You can only change roles for members below your highest role.")
            actor_highest = actor_highest_role(database, server, current_user.id)
            if not can_manage_target_role(False, actor_highest, role):
                raise HTTPException(status_code=403, detail="You can only assign roles below your highest role.")
        elif not (is_self and bool(getattr(role, "self_assignable", False))):
            raise HTTPException(status_code=403, detail="You can only assign that role to yourself.")

    existing = database.query(Server_role_members).filter(
        Server_role_members.role_id == role.id,
        Server_role_members.user_id == body.user_id,
    ).first()
    if body.assigned and not existing:
        database.add(Server_role_members(role_id=role.id, user_id=body.user_id))
    elif not body.assigned and existing:
        database.delete(existing)
    else:
        database.commit()
        return {
            "ok": True,
            "roles": assigned_roles_for_user(database, server.id, body.user_id),
            "highest_role": highest_role_for_user(database, server.id, body.user_id),
            "hoist_role": hoist_role_for_user(database, server.id, body.user_id),
            "name_role": name_color_role_for_user(database, server.id, body.user_id),
        }

    target = database.query(UserInfo).filter(UserInfo.id == body.user_id).first()
    write_audit_log(database, server.id, current_user.id, "role_member_updated", "member", body.user_id, {
        "username": target.username if target else None,
        "role_id": role.id,
        "role_name": role.name,
        "assigned": bool(body.assigned),
    })
    database.commit()

    hoist = hoist_role_for_user(database, server.id, body.user_id)
    name_role = name_color_role_for_user(database, server.id, body.user_id)
    await server_broadcast(
        server_id=server.id,
        payload={
            "type": "server_member_roles_updated",
            "server_id": server.id,
            "user_id": body.user_id,
            "hoist_role": hoist,
            "name_role": name_role,
        },
        database=database,
        exclude_user_id=current_user.id,
    )
    return {
        "ok": True,
        "roles": assigned_roles_for_user(database, server.id, body.user_id),
        "highest_role": highest_role_for_user(database, server.id, body.user_id),
        "hoist_role": hoist,
        "name_role": name_role,
    }


def _channel_server_or_404(database, channel_id, user_id):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    server = require_server_member(database, category.server_id, user_id)
    return channel, category, server


@router.get("/get_channel_role_perms/{channel_id}")
def get_channel_role_perms(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, category, server = _channel_server_or_404(database, channel_id, current_user.id)
    seed_server_roles(database, server.id)
    database.commit()
    overrides = channel_overrides_by_role(database, channel.id)
    roles = list_server_roles(database, server.id)
    display = {}
    for role in roles:
        role_id = str(role.get("id"))
        display[role_id] = display_channel_role_perms(database, channel.id, role)
    return {
        "channel_id": channel.id,
        "overrides": {str(role_id): perms for role_id, perms in overrides.items()},
        "display": display,
        "live": list(LIVE_CHANNEL_OVERRIDE_PERMS),
    }


@router.post("/save_channel_role_perms")
async def save_channel_role_perms(body: Channel_role_perms_save, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel, category, server = _channel_server_or_404(database, body.channel_id, current_user.id)
    require_server_perm(database, server, current_user.id, "manage_channels", "You do not have permission to manage channel permissions.")
    seed_server_roles(database, server.id)
    role = database.query(Server_roles).filter(
        Server_roles.id == body.role_id,
        Server_roles.server_id == server.id,
    ).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    existing = database.query(Server_channel_role_perms).filter(
        Server_channel_role_perms.channel_id == channel.id,
        Server_channel_role_perms.role_id == role.id,
    ).first()
    fallback = parse_channel_override_perms(existing) if existing else display_channel_role_perms(
        database, channel.id, serialize_role(role)
    )
    perms = clean_channel_override_perms(body.permissions, fallback=fallback)
    if existing:
        existing.permissions = json.dumps(perms)
    else:
        database.add(Server_channel_role_perms(
            channel_id=channel.id,
            role_id=role.id,
            permissions=json.dumps(perms),
        ))
    database.commit()
    await server_broadcast(
        server.id,
        {
            "type": "channel_role_perms_updated",
            "server_id": server.id,
            "channel_id": channel.id,
            "role_id": role.id,
            "permissions": perms,
        },
        database,
        exclude_user_id=current_user.id,
    )
    return {
        "ok": True,
        "channel_id": channel.id,
        "role_id": role.id,
        "permissions": perms,
        "display": display_channel_role_perms(database, channel.id, serialize_role(role)),
    }
