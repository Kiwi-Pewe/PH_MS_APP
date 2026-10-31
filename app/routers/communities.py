from datetime import datetime
from math import ceil

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Channel_messages, Community_edge, Server_categories, Server_channels, Server_members, Server_votes, Servers, UserInfo
from app.routers.community_posts import COMMUNITY_FILTER_MAX, clean_filter_label, filter_word_hit
from app.schemas import Community_filter_entry, Community_finder_hide, Community_finder_prefs
from app.routers.deletion import write_audit_log
from app.routers.moderation import active_ban
from app.routers.realtime import presence_status, serialize_member, server_broadcast
from app.routers.roles import assign_members_role, hoist_role_for_user, name_color_role_for_user
from app.routers.feed import notify_feed_alert
from app.routers.servers import clean_server_tag, parse_application_form, parse_server_tags, server_banner_fields, server_icon_still_url, server_icon_url, server_listing_tags, server_url_slug

router = APIRouter()

COMMUNITY_PAGE = 24
FINDER_FILTER_KINDS = {"word": "finder_word", "tag": "finder_tag"}
FINDER_PREF_KIND = "finder_pref"
FINDER_HIDDEN_KIND = "finder_hidden"
FINDER_SORTS = ("active", "newest", "score", "online")
FINDER_EXPLICIT = ("nothing", "cover", "hide")
FINDER_PREF_FLAGS = {
    "blacklist_hide": False,
    "hide_joined": False,
    "hide_apply": False,
    "confirm_join": True,
}


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


def community_row(server, online, joined, votes=None, covered=False, cover_reason=""):
    pack = votes or empty_vote_pack()
    return {
        "id": server.id,
        "name": server.name or "",
        "about": getattr(server, "about", None) or "",
        "icon_url": server_icon_url(server),
        "icon_still_url": server_icon_still_url(server),
        "url_slug": server_url_slug(server),
        "online": int(online or 0),
        "joined": bool(joined),
        "tags": server_listing_tags(server),
        "server_type": (getattr(server, "server_type", None) or "").strip().lower(),
        "timezone": (getattr(server, "timezone", None) or "").strip(),
        "applications_enabled": bool(getattr(server, "applications_enabled", False)),
        "explicit": bool(getattr(server, "explicit", False)),
        "application_form": parse_application_form(getattr(server, "application_form", None)),
        "covered": bool(covered),
        "cover_reason": cover_reason or "",
        **pack,
        **server_banner_fields(server),
    }


def load_finder_prefs(database, user_id):
    found = {"words": [], "tags": [], "explicit": "nothing", "sort": "active", "hidden": []}
    found.update(FINDER_PREF_FLAGS)
    if not user_id:
        return found
    rows = database.query(Community_edge).filter(
        Community_edge.user_id == user_id,
        Community_edge.kind.in_(("finder_word", "finder_tag", FINDER_PREF_KIND, FINDER_HIDDEN_KIND)),
    ).order_by(Community_edge.created_at.asc(), Community_edge.id.asc()).all()
    hidden_ids = []
    for edge in rows:
        if edge.kind == "finder_word" and edge.label:
            found["words"].append(edge.label)
        elif edge.kind == "finder_tag" and edge.label:
            found["tags"].append(edge.label)
        elif edge.kind == FINDER_HIDDEN_KIND and edge.label:
            hidden_ids.append(edge.label)
        elif edge.kind == FINDER_PREF_KIND:
            if edge.label == "sort" and edge.mode in FINDER_SORTS:
                found["sort"] = edge.mode
            elif edge.label == "explicit" and edge.mode in FINDER_EXPLICIT:
                found["explicit"] = edge.mode
            elif edge.label in FINDER_PREF_FLAGS:
                found[edge.label] = edge.mode == "on"
    if hidden_ids:
        servers = database.query(Servers).filter(Servers.id.in_(hidden_ids)).all()
        names = {server.id: server.name or "Server" for server in servers}
        found["hidden"] = [{"id": server_id, "name": names[server_id]} for server_id in hidden_ids if server_id in names]
    return found


def finder_filter_kind(kind):
    edge_kind = FINDER_FILTER_KINDS.get(str(kind or "").strip().lower())
    if not edge_kind:
        raise HTTPException(status_code=400, detail="Unknown list.")
    return edge_kind


def finder_filter_label(kind, value):
    if kind == "finder_tag":
        label = clean_server_tag(value)
        if not label:
            raise HTTPException(status_code=400, detail="That is not a tag.")
        return label
    label = clean_filter_label(value)
    if not label:
        raise HTTPException(status_code=400, detail="Type something first.")
    return label


def finder_edge(database, user_id, kind, label, target_id=0):
    return database.query(Community_edge).filter(
        Community_edge.user_id == user_id,
        Community_edge.kind == kind,
        Community_edge.target_id == target_id,
        Community_edge.label == label,
    ).first()


def save_finder_pref(database, user_id, label, mode):
    edge = finder_edge(database, user_id, FINDER_PREF_KIND, label)
    if edge:
        edge.mode = mode
    else:
        database.add(Community_edge(user_id=user_id, kind=FINDER_PREF_KIND, target_id=0, label=label, mode=mode))


def finder_tag_hit(server, tags):
    if not tags:
        return False
    wanted = set(tags)
    return any(str(item or "").strip().lower() in wanted for item in server_listing_tags(server))


def finder_blacklisted(server, viewer_id, prefs):
    if not server or server.owner_id == viewer_id:
        return False
    if filter_word_hit((server.name or "") + " " + (getattr(server, "about", None) or ""), prefs.get("words") or []):
        return True
    return finder_tag_hit(server, prefs.get("tags") or [])


def finder_cover_reason(server, viewer_id, prefs):
    if finder_blacklisted(server, viewer_id, prefs) and not prefs.get("blacklist_hide"):
        return "blacklist"
    if prefs.get("explicit") == "cover" and bool(getattr(server, "explicit", False)) and server.owner_id != viewer_id:
        return "explicit"
    return ""


def finder_last_map(database):
    rows = (
        database.query(
            Server_categories.server_id,
            func.max(Channel_messages.timestamp),
        )
        .join(Server_channels, Server_channels.category_id == Server_categories.id)
        .join(Channel_messages, Channel_messages.channel_id == Server_channels.id)
        .group_by(Server_categories.server_id)
        .all()
    )
    return {server_id: last_at for server_id, last_at in rows}


def finder_online_map(database, server_ids):
    counts = {sid: 0 for sid in server_ids}
    if not server_ids:
        return counts
    members = database.query(Server_members.server_id, Server_members.user_id).filter(
        Server_members.server_id.in_(server_ids)
    ).all()
    for sid, uid in members:
        if presence_status(uid) == "online":
            counts[sid] = counts.get(sid, 0) + 1
    return counts


def finder_joined_ids(database, user_id, server_ids=None):
    query = database.query(Server_members.server_id).filter(Server_members.user_id == user_id)
    if server_ids is not None:
        if not server_ids:
            return set()
        query = query.filter(Server_members.server_id.in_(server_ids))
    return {sid for (sid,) in query.all()}


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
    prefs = load_finder_prefs(database, current_user.id)
    hidden_ids = [item["id"] for item in prefs["hidden"]]
    if hidden_ids:
        query = query.filter(~Servers.id.in_(hidden_ids))
    if prefs["hide_apply"]:
        query = query.filter(Servers.applications_enabled.is_(False))
    if prefs["explicit"] == "hide":
        query = query.filter(or_(Servers.explicit.is_(False), Servers.owner_id == current_user.id))
    if prefs["hide_joined"]:
        mine = finder_joined_ids(database, current_user.id)
        if mine:
            query = query.filter(~Servers.id.in_(mine))
    rows = query.all()
    if prefs["blacklist_hide"] and (prefs["words"] or prefs["tags"]):
        rows = [server for server in rows if not finder_blacklisted(server, current_user.id, prefs)]
    ids = [server.id for server in rows]
    last_map = finder_last_map(database) if prefs["sort"] == "active" else {}
    votes = votes_for_servers(database, ids, current_user.id) if ids else {}
    online = finder_online_map(database, ids)
    joined = finder_joined_ids(database, current_user.id, ids)
    empty = datetime.min
    if prefs["sort"] == "newest":
        rows.sort(key=lambda server: (server.created_at or empty, server.id), reverse=True)
    elif prefs["sort"] == "score":
        rows.sort(key=lambda server: (int((votes.get(server.id) or empty_vote_pack())["votes"]), server.id), reverse=True)
    elif prefs["sort"] == "online":
        rows.sort(key=lambda server: (int(online.get(server.id, 0)), server.id), reverse=True)
    else:
        rows.sort(key=lambda server: (last_map.get(server.id) or server.created_at or empty, server.id), reverse=True)
    total = len(rows)
    pages = ceil(total / COMMUNITY_PAGE) if total else 0
    if pages and page > pages:
        page = pages
    start = (page - 1) * COMMUNITY_PAGE
    page_rows = rows[start:start + COMMUNITY_PAGE]
    packed = []
    for server in page_rows:
        reason = finder_cover_reason(server, current_user.id, prefs)
        packed.append(community_row(
            server,
            online.get(server.id, 0),
            server.id in joined,
            votes.get(server.id),
            bool(reason),
            reason,
        ))
    return {
        "servers": packed,
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


@router.get("/community_finder_settings")
def get_community_finder_settings(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    return load_finder_prefs(database, current_user.id)


@router.patch("/community_finder_settings")
def update_community_finder_settings(
    body: Community_finder_prefs,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    if body.sort is not None:
        sort = str(body.sort).strip().lower()
        if sort not in FINDER_SORTS:
            raise HTTPException(status_code=400, detail="Unknown sort.")
        save_finder_pref(database, current_user.id, "sort", sort)
    if body.explicit is not None:
        explicit = str(body.explicit).strip().lower()
        if explicit not in FINDER_EXPLICIT:
            raise HTTPException(status_code=400, detail="Unknown explicit setting.")
        save_finder_pref(database, current_user.id, "explicit", explicit)
    for label in FINDER_PREF_FLAGS:
        value = getattr(body, label, None)
        if value is not None:
            save_finder_pref(database, current_user.id, label, "on" if value else "off")
    database.commit()
    return load_finder_prefs(database, current_user.id)


@router.post("/community_finder_settings/filters")
def add_community_finder_filter(
    body: Community_filter_entry,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    edge_kind = finder_filter_kind(body.kind)
    label = finder_filter_label(edge_kind, body.label)
    if not finder_edge(database, current_user.id, edge_kind, label):
        count = database.query(func.count(Community_edge.id)).filter(
            Community_edge.user_id == current_user.id,
            Community_edge.kind == edge_kind,
        ).scalar() or 0
        if count >= COMMUNITY_FILTER_MAX:
            raise HTTPException(status_code=400, detail="This list is full.")
        database.add(Community_edge(user_id=current_user.id, kind=edge_kind, target_id=0, label=label))
        database.commit()
    return load_finder_prefs(database, current_user.id)


@router.delete("/community_finder_settings/filters")
def remove_community_finder_filter(
    body: Community_filter_entry,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    edge_kind = finder_filter_kind(body.kind)
    label = finder_filter_label(edge_kind, body.label)
    database.query(Community_edge).filter(
        Community_edge.user_id == current_user.id,
        Community_edge.kind == edge_kind,
        Community_edge.target_id == 0,
        Community_edge.label == label,
    ).delete(synchronize_session=False)
    database.commit()
    return load_finder_prefs(database, current_user.id)


@router.post("/community_servers/{server_id}/hide")
def hide_community_server(
    server_id: str,
    body: Community_finder_hide,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    edge = finder_edge(database, current_user.id, FINDER_HIDDEN_KIND, server_id)
    if body.hidden:
        server = database.query(Servers).filter(Servers.id == server_id).first()
        if not listed_server(server):
            raise HTTPException(status_code=404, detail="Server not found")
        if not edge:
            database.add(Community_edge(user_id=current_user.id, kind=FINDER_HIDDEN_KIND, target_id=0, label=server_id))
    elif edge:
        database.delete(edge)
    database.commit()
    return load_finder_prefs(database, current_user.id)
