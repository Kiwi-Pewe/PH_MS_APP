import json
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import UserInfo, Servers, Server_members, Server_roles, Server_role_members
from app.schemas import Server_role_member_in, Server_roles_save
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
    "ban_members", "timeout_members", "manage_channels", "mention_everyone",
    "view_announcements", "create_announcements", "manage_announcements",
    "read_messages", "send_messages", "upload_chat_media", "manage_messages",
    "read_forums", "create_topics", "create_topic_replies", "manage_topics",
    "sticky_topics", "lock_topics",
    "view_docs", "create_docs", "manage_docs", "remove_docs",
)

MEMBERS_DEFAULT_PERMS = (
    "invite_members", "mention_everyone",
    "read_messages", "send_messages", "upload_chat_media",
    "view_announcements",
    "read_forums", "create_topics", "create_topic_replies",
    "view_docs",
)


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


def clean_role_perms(raw):
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
    return clean_role_perms(data)


def serialize_role(row):
    return {
        "id": row.id,
        "name": row.name or "",
        "color": clean_role_color(getattr(row, "color", None)),
        "position": int(row.position or 0),
        "mentionable": bool(row.mentionable),
        "hoist": bool(row.hoist),
        "name_color": bool(row.name_color),
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


@router.get("/get_server_roles/{server_id}")
def get_server_roles(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    require_server_member(database, server_id, current_user.id)
    seed_server_roles(database, server_id)
    database.commit()
    return {"roles": list_server_roles(database, server_id)}


@router.post("/save_server_roles")
async def save_server_roles(body: Server_roles_save, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    if server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the server owner can change roles.")

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

    saved = []
    created_ids = []
    for item in body.roles or []:
        name = clean_role_name(item.name)
        color = clean_role_color(item.color)
        perms = clean_role_perms(item.permissions)
        mentionable = bool(item.mentionable)
        hoist = bool(item.hoist)
        name_color = bool(item.name_color)

        if item.id and item.id in existing:
            row = existing[item.id]
            if row.is_members:
                row.name = clean_role_name(item.name, "Members")
                row.position = MEMBERS_POSITION
            else:
                row.name = name
            row.color = color
            row.mentionable = mentionable
            row.hoist = hoist
            row.name_color = name_color
            row.permissions = json.dumps(perms)
            saved.append({"client_id": item.client_id or "", "role": row})
        elif item.id:
            raise HTTPException(status_code=404, detail="Role not found")
        else:
            row = Server_roles(
                server_id=server.id,
                name=name,
                color=color,
                position=next_position,
                mentionable=mentionable,
                hoist=hoist,
                name_color=name_color,
                is_members=False,
                permissions=json.dumps(perms),
            )
            next_position -= 100
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
    if server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the server owner can assign roles.")
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

    existing = database.query(Server_role_members).filter(
        Server_role_members.role_id == role.id,
        Server_role_members.user_id == body.user_id,
    ).first()
    if body.assigned and not existing:
        database.add(Server_role_members(role_id=role.id, user_id=body.user_id))
    elif not body.assigned and existing:
        database.delete(existing)
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
