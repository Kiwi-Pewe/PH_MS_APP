from math import ceil

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Channel_messages, Server_categories, Server_channels, Server_members, Server_votes, Servers, UserInfo
from app.routers.deletion import write_audit_log
from app.routers.moderation import active_ban
from app.routers.realtime import presence_status, serialize_member, server_broadcast
from app.routers.roles import assign_members_role, hoist_role_for_user, name_color_role_for_user
from app.routers.feed import notify_feed_alert
from app.routers.servers import clean_server_tag, parse_application_form, parse_server_tags, server_banner_fields, server_icon_url, server_listing_tags, server_url_slug

router = APIRouter()

COMMUNITY_PAGE = 24


class Community_join_in(BaseModel):
    server_id: str


class Community_vote_in(BaseModel):
    server_id: str
    vote: int = 0


class Community_apply_in(BaseModel):
    server_id: str
    answers: list[dict] = []


def listed_server(server):
    return bool(server and getattr(server, "discoverable", False))


def listed_servers_query(database):
    return database.query(Servers).filter(Servers.discoverable == True)


def community_filter_tags(raw):
    tags = []
    for part in str(raw or "").split(","):
        tag = clean_server_tag(part)
        if tag and tag not in tags:
            tags.append(tag)
        if len(tags) >= 5:
            break
    return tags


def community_facets(database):
    tags = []
    seen_tags = set()
    zones = []
    seen_zones = set()
    rows = listed_servers_query(database).all()
    for server in rows:
        for tag in parse_server_tags(getattr(server, "tags", None)):
            if tag in seen_tags:
                continue
            seen_tags.add(tag)
            tags.append(tag)
            if len(tags) >= 24:
                break
        zone = (getattr(server, "timezone", None) or "").strip()
        if zone and zone not in seen_zones:
            seen_zones.add(zone)
            zones.append(zone)
        if len(tags) >= 24 and len(zones) >= 24:
            break
    return {"tags": tags, "timezones": zones}


def first_server_channel(database, server_id):
    category = database.query(Server_categories).filter(
        Server_categories.server_id == server_id
    ).order_by(Server_categories.position).first()
    if not category:
        return None
    return database.query(Server_channels).filter(
        Server_channels.category_id == category.id
    ).order_by(Server_channels.position).first()


def empty_vote_pack():
    return {"votes": 0, "vote_up": 0, "vote_down": 0, "my_vote": 0}


def vote_pack(up, down, mine):
    up = int(up or 0)
    down = int(down or 0)
    return {"votes": up - down, "vote_up": up, "vote_down": down, "my_vote": int(mine or 0)}


def votes_for_servers(database, server_ids, user_id):
    packs = {sid: empty_vote_pack() for sid in server_ids}
    if not server_ids:
        return packs
    rows = (
        database.query(
            Server_votes.server_id,
            func.coalesce(func.sum(case((Server_votes.value > 0, 1), else_=0)), 0),
            func.coalesce(func.sum(case((Server_votes.value < 0, 1), else_=0)), 0),
        )
        .filter(Server_votes.server_id.in_(server_ids))
        .group_by(Server_votes.server_id)
        .all()
    )
    for sid, up, down in rows:
        packs[sid] = vote_pack(up, down, 0)
    mine = database.query(Server_votes.server_id, Server_votes.value).filter(
        Server_votes.server_id.in_(server_ids),
        Server_votes.user_id == user_id,
    ).all()
    for sid, value in mine:
        pack = packs.get(sid) or empty_vote_pack()
        pack["my_vote"] = int(value or 0)
        packs[sid] = pack
    return packs


def votes_for_server(database, server_id, user_id):
    return votes_for_servers(database, [server_id], user_id).get(server_id) or empty_vote_pack()


def community_row(server, online, joined, votes=None):
    pack = votes or empty_vote_pack()
    return {
        "id": server.id,
        "name": server.name or "",
        "about": getattr(server, "about", None) or "",
        "icon_url": server_icon_url(server),
        "url_slug": server_url_slug(server),
        "online": int(online or 0),
        "joined": bool(joined),
        "tags": server_listing_tags(server),
        "server_type": (getattr(server, "server_type", None) or "").strip().lower(),
        "timezone": (getattr(server, "timezone", None) or "").strip(),
        "applications_enabled": bool(getattr(server, "applications_enabled", False)),
        "explicit": bool(getattr(server, "explicit", False)),
        "application_form": parse_application_form(getattr(server, "application_form", None)),
        **pack,
        **server_banner_fields(server),
    }


@router.get("/community_servers")
def community_servers(
    q: str = "",
    page: int = 1,
    type: str = "",
    tags: str = "",
    timezone: str = "",
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
            func.lower(func.coalesce(Servers.tags, "")).like(like),
            func.lower(func.coalesce(Servers.server_type, "")).like(like),
            func.lower(func.coalesce(Servers.timezone, "")).like(like),
        ))
    kind = (type or "").strip().lower()
    if kind:
        query = query.filter(func.lower(func.coalesce(Servers.server_type, "")) == kind)
    for tag in community_filter_tags(tags):
        query = query.filter(func.lower(func.coalesce(Servers.tags, "")).like("%" + tag + "%"))
    zone = (timezone or "").strip()
    if zone:
        query = query.filter(Servers.timezone == zone)
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
    votes = votes_for_servers(database, ids, current_user.id)
    return {
        "servers": [community_row(server, online.get(server.id, 0), server.id in joined, votes.get(server.id)) for server in rows],
        "page": page,
        "pages": pages,
        "total": total,
        "facets": community_facets(database),
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
    if bool(getattr(server, "applications_enabled", False)):
        raise HTTPException(status_code=400, detail="This server requires an application.")
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


def validate_application_answers(form, answers, username):
    packed = {}
    if isinstance(answers, list):
        for item in answers:
            if not isinstance(item, dict):
                continue
            qid = str(item.get("id") or "").strip()
            if not qid:
                continue
            if "values" in item:
                values = item.get("values") if isinstance(item.get("values"), list) else []
                packed[qid] = [str(value or "").strip() for value in values if str(value or "").strip()]
            else:
                packed[qid] = str(item.get("value") or "").strip()
    for question in form.get("questions") or []:
        qid = str(question.get("id") or "")
        kind = str(question.get("type") or "")
        got = packed.get(qid)
        if kind == "multi":
            options = question.get("options") or []
            picked = got if isinstance(got, list) else ([got] if got else [])
            if any(item not in options for item in picked):
                raise HTTPException(status_code=400, detail="Pick valid options.")
        elif kind == "choice":
            value = got[0] if isinstance(got, list) and got else got
            if not value or value not in (question.get("options") or []):
                raise HTTPException(status_code=400, detail="Pick one option.")
        elif kind == "text":
            value = got[0] if isinstance(got, list) and got else got
            if not str(value or "").strip():
                raise HTTPException(status_code=400, detail="Answer every written question.")
        elif kind == "signature":
            value = got[0] if isinstance(got, list) and got else got
            if str(value or "").strip().lower() != str(username or "").strip().lower():
                raise HTTPException(status_code=400, detail="Type your username to submit.")


@router.post("/apply_community")
async def apply_community(
    body: Community_apply_in,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    server = database.query(Servers).filter(Servers.id == body.server_id).first()
    if not listed_server(server) or active_ban(database, body.server_id, current_user.id):
        raise HTTPException(status_code=404, detail="Server not found")
    if not bool(getattr(server, "applications_enabled", False)):
        raise HTTPException(status_code=400, detail="This server is not taking applications.")
    is_member = database.query(Server_members).filter(
        Server_members.server_id == server.id,
        Server_members.user_id == current_user.id,
    ).first()
    if is_member:
        return {"ok": True, "id": server.id, "joined": True}
    form = parse_application_form(getattr(server, "application_form", None))
    validate_application_answers(form, body.answers, current_user.username)
    await notify_feed_alert(
        database,
        receiver_id=current_user.id,
        alert_type="application_submitted",
        sender_id=None,
        alert_family="activity",
        server_id=server.id,
        reason=server.name or "Server",
        force=True,
    )
    return {"ok": True, "id": server.id, "applied": True}


@router.post("/community_vote")
def community_vote(
    body: Community_vote_in,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    server = database.query(Servers).filter(Servers.id == body.server_id).first()
    if not listed_server(server):
        raise HTTPException(status_code=404, detail="Server not found")
    next_vote = 1 if body.vote > 0 else -1 if body.vote < 0 else 0
    row = database.query(Server_votes).filter(
        Server_votes.server_id == server.id,
        Server_votes.user_id == current_user.id,
    ).first()
    current = int(row.value) if row else 0
    if next_vote == 0 or next_vote == current:
        if row:
            database.delete(row)
    elif row:
        row.value = next_vote
    else:
        database.add(Server_votes(server_id=server.id, user_id=current_user.id, value=next_vote))
    database.commit()
    return {"ok": True, "id": server.id, **votes_for_server(database, server.id, current_user.id)}
