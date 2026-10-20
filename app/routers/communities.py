from math import ceil

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Channel_messages, Server_categories, Server_channels, Server_members, Servers, UserInfo
from app.routers.deletion import write_audit_log
from app.routers.moderation import active_ban
from app.routers.realtime import presence_status, serialize_member, server_broadcast
from app.routers.roles import assign_members_role, hoist_role_for_user, name_color_role_for_user
from app.routers.servers import server_banner_fields, server_icon_url, server_privacy_fields, server_url_slug

router = APIRouter()

COMMUNITY_PAGE = 24


class Community_join_in(BaseModel):
    server_id: str


def listed_server(server):
    if not server:
        return False
    fields = server_privacy_fields(server)
    return bool(fields.get("discoverable")) and fields.get("privacy_mode") != "private"


def listed_servers_query(database):
    return database.query(Servers).filter(
        Servers.discoverable == True,
        Servers.privacy_mode.in_(("default", "open")),
    )


def first_server_channel(database, server_id):
    category = database.query(Server_categories).filter(
        Server_categories.server_id == server_id
    ).order_by(Server_categories.position).first()
    if not category:
        return None
    return database.query(Server_channels).filter(
        Server_channels.category_id == category.id
    ).order_by(Server_channels.position).first()


def community_row(server, online, joined):
    return {
        "id": server.id,
        "name": server.name or "",
        "about": getattr(server, "about", None) or "",
        "icon_url": server_icon_url(server),
        "url_slug": server_url_slug(server),
        "online": int(online or 0),
        "joined": bool(joined),
        "votes": 0,
        "tags": [],
        **server_banner_fields(server),
    }


@router.get("/community_servers")
def community_servers(
    q: str = "",
    page: int = 1,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    page = max(1, int(page or 1))
    query = listed_servers_query(database)
    needle = (q or "").strip().lower()
    if needle:
        like = "%" + needle + "%"
        query = query.filter(or_(
            func.lower(Servers.name).like(like),
            func.lower(func.coalesce(Servers.about, "")).like(like),
        ))
    total = query.count()
    last_msg = (
        database.query(
            Server_categories.server_id.label("server_id"),
            func.max(Channel_messages.timestamp).label("last_at"),
        )
        .join(Server_channels, Server_channels.category_id == Server_categories.id)
        .join(Channel_messages, Channel_messages.channel_id == Server_channels.id)
        .group_by(Server_categories.server_id)
        .subquery()
    )
    query = query.outerjoin(last_msg, last_msg.c.server_id == Servers.id)
    pages = ceil(total / COMMUNITY_PAGE) if total else 0
    if pages and page > pages:
        page = pages
    rows = (
        query
        .order_by(func.coalesce(last_msg.c.last_at, Servers.created_at).desc(), Servers.id.desc())
        .offset((page - 1) * COMMUNITY_PAGE)
        .limit(COMMUNITY_PAGE)
        .all()
    )
    ids = [server.id for server in rows]
    online = {sid: 0 for sid in ids}
    joined = set()
    if ids:
        members = database.query(Server_members.server_id, Server_members.user_id).filter(
            Server_members.server_id.in_(ids)
        ).all()
        for sid, uid in members:
            if presence_status(uid) == "online":
                online[sid] = online.get(sid, 0) + 1
            if uid == current_user.id:
                joined.add(sid)
    return {
        "servers": [community_row(server, online.get(server.id, 0), server.id in joined) for server in rows],
        "page": page,
        "pages": pages,
        "total": total,
    }


@router.post("/join_community")
async def join_community(
    body: Community_join_in,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    server = database.query(Servers).filter(Servers.id == body.server_id).first()
    if not listed_server(server) or active_ban(database, body.server_id, current_user.id):
        raise HTTPException(status_code=404, detail="Server not found")
    is_member = database.query(Server_members).filter(
        Server_members.server_id == server.id,
        Server_members.user_id == current_user.id,
    ).first()
    if is_member:
        return {"ok": True, "id": server.id, "joined": True}
    highest_position = database.query(func.max(Server_members.position)).filter(
        Server_members.user_id == current_user.id
    ).scalar()
    new_member = Server_members(
        server_id=server.id,
        user_id=current_user.id,
        position=100 if highest_position is None else highest_position + 100,
        notify_level="all",
    )
    database.add(new_member)
    assign_members_role(database, server.id, current_user.id)
    channel = first_server_channel(database, server.id)
    if channel:
        database.add(Channel_messages(
            sender_id=None,
            channel_id=channel.id,
            content=f"{current_user.username} has joined the server",
        ))
    write_audit_log(database, server.id, current_user.id, "member_joined", "member", current_user.id, {
        "username": current_user.username,
    })
    database.commit()
    await server_broadcast(
        server_id=server.id,
        payload={
            "type": "member_joined",
            "scope": "server",
            "scope_id": server.id,
            "member": serialize_member(
                current_user,
                current_user.id == server.owner_id,
                hoist_role_for_user(database, server.id, current_user.id),
                name_color_role_for_user(database, server.id, current_user.id),
            ),
        },
        database=database,
        exclude_user_id=current_user.id,
    )
    return {"ok": True, "id": server.id, "joined": True}
