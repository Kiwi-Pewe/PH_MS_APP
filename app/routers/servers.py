from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Channel_messages, Channel_last_viewed, Announcement_post, Announcement_comment, Forum_post, Forum_messages, Doc_page, Doc_entry, Media_item, Media_comment, Message_pin, List_item, List_check, List_thread_message, Calendar_event, Calendar_event_rsvp, Calendar_event_comment, Schedule_block
from app.schemas import Server_create, Server_message, Category_create, Channel_create, Reorder_server_rail, Reorder_category, Reorder_channel, Channel_update, Category_update, Server_icon_update, Server_banner_update, Server_name_update, Server_about_update, Server_url_update, Server_type_update, Server_timezone_update, Server_notifications_update, Server_privacy_update, Server_delete
from zoneinfo import available_timezones
from app.database import get_db
from app.auth import get_current_user
from app.r2 import ALLOWED_MIME, PROFILE_IMAGE_BYTES, SERVER_KEY_RE, attachment_public, delete_attachment, delete_r2_object, normalize_mime, public_url_for, require_message_body, store_attachment
from app.routers.deletion import write_audit_log
from app.routers.reactions import clear_reactions, reactions_for_messages
from app.routers.pins import clear_pins
from app.routers.realtime import serialize_member, server_broadcast
from app.routers.profile import avatar_lookup
from app.routers.roles import (
    actor_highest_role,
    assigned_roles_for_user,
    channel_type_visible,
    effective_perms_for_user,
    effective_perms_for_user_in_channel,
    highest_roles_by_user,
    hoist_roles_by_user,
    name_color_roles_by_user,
    require_channel_perm,
    require_channel_slowmode,
    normalize_slowmode,
    require_server_member,
    require_server_perm,
    require_server_roster,
    seed_server_roles,
)
from app.routers.account import public_display_name
from app.routers.moderation import iso_dt, require_not_timed_out, timeout_until_for
from app.routers.mentions import apply_channel_mentions, decorate_history, server_notice, channel_notice, stamp_channel_view, clear_mentions, seed_channel_unread, clear_channel_mentions, accepted_reply_parent, reply_map_for
from app.routers.feed import notify_activity_reply
from app.privacy import drop_blocked_rows
import random
import re

BANNER_HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
SERVER_NAME_MAX = 25
SERVER_SLUG_RE = re.compile(
    r"^[A-Za-z](?:[A-Za-z0-9-]{0," + str(max(0, SERVER_NAME_MAX - 2)) + r"}[A-Za-z0-9])$"
)
SERVER_TYPES = {
    "community": "Community",
    "team": "Team",
    "organization": "Organization",
    "clan": "Clan",
    "guild": "Guild",
    "friends": "Friends",
    "streaming": "Streaming",
    "other": "Other",
}
SERVER_NOTIFICATIONS = ("all", "mentions")
SERVER_NOTIFICATIONS_DEFAULT = "mentions"
SERVER_PRIVACY_MODES = ("private", "default", "open")
SERVER_PRIVACY_DEFAULT = "private"
RESERVED_SERVER_SLUGS = {
    "main", "app", "login", "invite", "admin", "shared", "accessibility",
    "index", "api", "cdn", "settings", "profile", "communities", "games",
    "announcements", "feedback", "messages", "home", "server", "servers",
    "about", "help", "support", "legal", "terms", "privacy", "status",
    "blog", "docs", "static", "assets", "oneira", "www", "mail",
}


def clean_server_slug(value):
    text = (value or "").strip()
    text = re.sub(r"^https?://", "", text, flags=re.I)
    text = re.sub(r"^(www\.)?oneira\.cc/", "", text, flags=re.I)
    text = text.strip().strip("/")
    return text


def server_url_slug(server):
    return (getattr(server, "url_slug", None) or "") if server else ""


SERVER_TIMEZONES = available_timezones()


def clean_server_timezone(value):
    zone = (value or "").strip()
    if not zone:
        return ""
    if zone not in SERVER_TIMEZONES:
        return None
    return zone


def clean_server_notifications(value):
    kind = (value or "").strip().lower()
    if kind in SERVER_NOTIFICATIONS:
        return kind
    return None


def server_default_notifications(server):
    kind = getattr(server, "default_notifications", None) if server else None
    if kind in SERVER_NOTIFICATIONS:
        return kind
    return SERVER_NOTIFICATIONS_DEFAULT


def clean_server_privacy_mode(value):
    kind = (value or "").strip().lower()
    if kind in SERVER_PRIVACY_MODES:
        return kind
    return None


def server_privacy_fields(server):
    mode = clean_server_privacy_mode(getattr(server, "privacy_mode", None) if server else None) or SERVER_PRIVACY_DEFAULT
    discoverable = bool(getattr(server, "discoverable", False)) if server else False
    if mode == "private":
        discoverable = False
    return {"privacy_mode": mode, "discoverable": discoverable}


router = APIRouter()


def server_icon_url(server):
    key = getattr(server, "icon_key", None) if server else None
    return public_url_for(key) if key else ""


def server_banner_url(server):
    key = getattr(server, "banner_key", None) if server else None
    return public_url_for(key) if key else ""


def clean_banner_hex(value):
    text = (value or "").strip()
    if BANNER_HEX_RE.fullmatch(text):
        return text.lower()
    return ""


def server_banner_fields(server):
    return {
        "banner_url": server_banner_url(server),
        "banner_color": (getattr(server, "banner_color", None) or "") if server else "",
    }

@router.post("/create_server")
def create_server(server_name: Server_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server_id_chars = "234679ACDEFGHJKLMNPQRTUVWXYZ"

    while True:
        test_id = "".join(random.choices(server_id_chars, k=10))
        id_check = database.query(Servers).filter(Servers.id == test_id).first()
        if not id_check: break

    name = (server_name.name or "").strip() or "Server"
    if len(name) > SERVER_NAME_MAX:
        name = name[:SERVER_NAME_MAX]
    new_server = Servers(
        id = test_id,
        name = name,
        owner_id = current_user.id
    )
    database.add(new_server)

    highest_position = database.query(func.max(Server_members.position)).filter(Server_members.user_id == current_user.id).scalar()

    new_member = Server_members(
        server_id = test_id,
        user_id = current_user.id,
        position = 100 if highest_position == None else highest_position + 100,
    )
    database.add(new_member)

    text_category = Server_categories(
        server_id = test_id,
        name = "Text Channels",
        position = 100,
    )
    database.add(text_category)
    database.flush() 

    text_channel = Server_channels(
        category_id = text_category.id,
        name = "general",
        channel_type = "text",
        position = 100,
    )
    database.add(text_channel)

    voice_category = Server_categories(
        server_id = test_id,
        name = "Voice Channels",
        position = 200,
    )
    database.add(voice_category)
    database.flush() 

    voice_channel = Server_channels(
        category_id = voice_category.id,
        name = "General",
        channel_type = "voice",
        position = 100,
    )
    database.add(voice_channel)

    from app.routers.roles import seed_server_roles
    seed_server_roles(database, test_id)

    database.commit()

@router.get("/get_servers")
def get_user_servers(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    user_servers = database.query(Server_members).filter(Server_members.user_id == current_user.id).order_by(Server_members.position).all()

    server_list = []
    for server in user_servers:
        server_info = database.query(Servers).filter(Servers.id == server.server_id).first()
        notice = server_notice(database, server_info.id, current_user.id)
        server_list.append({
            "type": "server",
            "id": server_info.id,
            "name": server_info.name,
            "position": server.position,
            "owner_id": server_info.owner_id,
            "unread": notice["unread"],
            "mention_count": notice["mention_count"],
            "icon_url": server_icon_url(server_info),
            **server_banner_fields(server_info)
        })

    return {"servers": server_list}

@router.get("/get_server_contents/{server_id}")
def get_server_contents(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    in_server = database.query(Server_members).filter(Server_members.server_id == server_id, Server_members.user_id == current_user.id).first()

    if not in_server:
        raise HTTPException(status_code=404, detail="Server membership not found")

    all_categories = database.query(Server_categories).filter(Server_categories.server_id == server_id).order_by(Server_categories.position).all()
    server = database.query(Servers).filter(Servers.id == server_id).first()
    seed_server_roles(database, server.id)
    database.commit()
    is_owner = server.owner_id == current_user.id
    permissions = effective_perms_for_user(database, server, current_user.id)
    server_info = []

    for category in all_categories:
        channel_info = []
        if category.is_private == False or is_owner:
            all_channels = database.query(Server_channels).filter(Server_channels.category_id == category.id).order_by(Server_channels.position).all()

            for channel in all_channels:
                if channel.is_private == False or is_owner:
                    channel_perms = effective_perms_for_user_in_channel(database, server, current_user.id, channel.id)
                    if not channel_type_visible(channel_perms, channel.channel_type):
                        continue
                    notice = channel_notice(database, channel.id, current_user.id)
                    live_flags = {key: bool(channel_perms.get(key)) for key in (
                        "manage_channels", "mention_everyone", "bypass_slowmode",
                        "read_messages", "send_messages", "upload_chat_media", "manage_messages", "pin_messages",
                        "view_announcements", "create_announcements", "manage_announcements",
                        "read_forums", "create_topics", "create_topic_replies", "manage_topics",
                        "sticky_topics", "lock_topics",
                        "view_wallpaper", "create_wallpaper", "manage_wallpaper", "remove_wallpaper",
                        "view_docs", "create_docs", "manage_docs", "remove_docs",
                        "see_media", "create_media", "manage_media", "remove_media",
                        "view_events", "create_events", "manage_events", "remove_events", "edit_rsvps",
                        "view_schedules", "create_schedule", "delete_schedule",
                    )}
                    channel_info.append({
                        "id": channel.id,
                        "category_id": channel.category_id,
                        "name": channel.name,
                        "channel_type": channel.channel_type,
                        "position": channel.position,
                        "is_private": channel.is_private,
                        "topic": getattr(channel, "topic", None) or "",
                        "slowmode": int(getattr(channel, "slowmode", 0) or 0),
                        "announce_public": bool(getattr(channel, "announce_public", False)),
                        "blog_enabled": bool(getattr(channel, "blog_enabled", False)),
                        "unread": notice["unread"],
                        "mention_count": notice["mention_count"],
                        "can_read": bool(channel_perms.get("read_messages")),
                        "can_send": bool(channel_perms.get("send_messages")),
                        "permissions": live_flags,
                    })

            server_info.append({"id": category.id, "name": category.name, "position": category.position, "is_private": category.is_private, "channels": channel_info})
            
    return {
        "type": "server",
        "categories": server_info,
        "owner": server.owner_id,
        "icon_url": server_icon_url(server),
        "about": getattr(server, "about", None) or "",
        "url_slug": server_url_slug(server),
        "server_type": getattr(server, "server_type", None) or "",
        "timezone": getattr(server, "timezone", None) or "",
        "default_notifications": server_default_notifications(server),
        "permissions": permissions,
        "highest_role": actor_highest_role(database, server, current_user.id),
        "timeout_until": iso_dt(timeout_until_for(in_server)),
        **server_privacy_fields(server),
        **server_banner_fields(server)
    }


@router.post("/update_server_icon")
async def update_server_icon(body: Server_icon_update, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    require_server_perm(database, server, current_user.id, "update_server", "You do not have permission to update this server.")

    key = (body.key or "").strip() or None
    old_key = getattr(server, "icon_key", None)
    if key:
        mime = normalize_mime(body.mime)
        if mime == "image/jpg":
            mime = "image/jpeg"
        if not SERVER_KEY_RE.match(key) or mime not in ALLOWED_MIME or ALLOWED_MIME[mime][1] != "image":
            raise HTTPException(status_code=400, detail="That is not a valid server icon.")
        if not key.endswith(ALLOWED_MIME[mime][0]):
            raise HTTPException(status_code=400, detail="That is not a valid server icon.")
        try:
            size = int(body.size or 0)
        except (TypeError, ValueError):
            size = 0
        if size < 1 or size > PROFILE_IMAGE_BYTES:
            raise HTTPException(status_code=400, detail="Server icons must be 5 MB or smaller.")
        server.icon_key = key
    else:
        server.icon_key = None

    database.commit()
    if old_key and old_key != getattr(server, "icon_key", None):
        delete_r2_object(old_key)

    icon_url = server_icon_url(server)
    await server_broadcast(
        server_id=server.id,
        payload={"type": "server_icon_updated", "server_id": server.id, "icon_url": icon_url},
        database=database,
        exclude_user_id=current_user.id,
    )
    return {"ok": True, "icon_url": icon_url}


@router.post("/update_server_banner")
async def update_server_banner(body: Server_banner_update, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    require_server_perm(database, server, current_user.id, "update_server", "You do not have permission to update this server.")

    color = clean_banner_hex(body.color)
    key = (body.key or "").strip() or None
    old_key = getattr(server, "banner_key", None)
    if color:
        server.banner_color = color
        server.banner_key = None
    elif key:
        mime = normalize_mime(body.mime)
        if mime == "image/jpg":
            mime = "image/jpeg"
        if not SERVER_KEY_RE.match(key) or mime not in ALLOWED_MIME or ALLOWED_MIME[mime][1] != "image":
            raise HTTPException(status_code=400, detail="That is not a valid server banner.")
        if not key.endswith(ALLOWED_MIME[mime][0]):
            raise HTTPException(status_code=400, detail="That is not a valid server banner.")
        try:
            size = int(body.size or 0)
        except (TypeError, ValueError):
            size = 0
        if size < 1 or size > PROFILE_IMAGE_BYTES:
            raise HTTPException(status_code=400, detail="Server banners must be 5 MB or smaller.")
        server.banner_key = key
        server.banner_color = None
    else:
        server.banner_key = None
        server.banner_color = None

    database.commit()
    if old_key and old_key != getattr(server, "banner_key", None):
        delete_r2_object(old_key)

    fields = server_banner_fields(server)
    await server_broadcast(
        server_id=server.id,
        payload={"type": "server_banner_updated", "server_id": server.id, **fields},
        database=database,
        exclude_user_id=current_user.id,
    )
    return {"ok": True, **fields}


@router.post("/update_server_name")
async def update_server_name(body: Server_name_update, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    require_server_perm(database, server, current_user.id, "update_server", "You do not have permission to update this server.")

    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Server name cannot be empty.")
    if len(name) > SERVER_NAME_MAX:
        raise HTTPException(status_code=400, detail="Server name is too long.")

    server.name = name
    database.commit()
    await server_broadcast(
        server_id=server.id,
        payload={"type": "server_name_updated", "server_id": server.id, "name": name},
        database=database,
        exclude_user_id=current_user.id,
    )
    return {"ok": True, "name": name}


@router.post("/update_server_about")
async def update_server_about(body: Server_about_update, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    require_server_perm(database, server, current_user.id, "update_server", "You do not have permission to update this server.")

    about = body.about if body.about is not None else ""
    if not isinstance(about, str):
        about = str(about)
    if len(about) > 2000:
        raise HTTPException(status_code=400, detail="About text is too long.")

    server.about = about
    database.commit()
    await server_broadcast(
        server_id=server.id,
        payload={"type": "server_about_updated", "server_id": server.id, "about": about},
        database=database,
        exclude_user_id=current_user.id,
    )
    return {"ok": True, "about": about}


@router.post("/update_server_url")
async def update_server_url(body: Server_url_update, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    require_server_perm(database, server, current_user.id, "update_server", "You do not have permission to update this server.")

    slug = clean_server_slug(body.slug)
    if not slug:
        server.url_slug = None
        database.commit()
        await server_broadcast(
            server_id=server.id,
            payload={"type": "server_url_updated", "server_id": server.id, "url_slug": ""},
            database=database,
            exclude_user_id=current_user.id,
        )
        return {"ok": True, "url_slug": ""}

    if not SERVER_SLUG_RE.fullmatch(slug):
        raise HTTPException(status_code=400, detail=f"Use 2–{SERVER_NAME_MAX} letters, numbers, or hyphens, starting with a letter.")
    if slug.lower() in RESERVED_SERVER_SLUGS:
        raise HTTPException(status_code=400, detail="That URL is reserved.")

    taken = database.query(Servers).filter(
        func.lower(Servers.url_slug) == slug.lower(),
        Servers.id != server.id,
    ).first()
    if taken:
        raise HTTPException(status_code=409, detail="That URL is already taken.")

    server.url_slug = slug
    database.commit()
    await server_broadcast(
        server_id=server.id,
        payload={"type": "server_url_updated", "server_id": server.id, "url_slug": slug},
        database=database,
        exclude_user_id=current_user.id,
    )
    return {"ok": True, "url_slug": slug}


@router.post("/update_server_type")
async def update_server_type(body: Server_type_update, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    require_server_perm(database, server, current_user.id, "update_server", "You do not have permission to update this server.")

    kind = (body.server_type or "").strip().lower()
    if not kind:
        server.server_type = None
    elif kind not in SERVER_TYPES:
        raise HTTPException(status_code=400, detail="That is not a server type.")
    else:
        server.server_type = kind

    database.commit()
    saved = getattr(server, "server_type", None) or ""
    await server_broadcast(
        server_id=server.id,
        payload={"type": "server_type_updated", "server_id": server.id, "server_type": saved},
        database=database,
        exclude_user_id=current_user.id,
    )
    return {"ok": True, "server_type": saved}


@router.post("/update_server_timezone")
async def update_server_timezone(body: Server_timezone_update, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    require_server_perm(database, server, current_user.id, "update_server", "You do not have permission to update this server.")

    zone = clean_server_timezone(body.timezone)
    if zone is None:
        raise HTTPException(status_code=400, detail="That is not a timezone.")

    server.timezone = zone or None
    database.commit()
    saved = getattr(server, "timezone", None) or ""
    await server_broadcast(
        server_id=server.id,
        payload={"type": "server_timezone_updated", "server_id": server.id, "timezone": saved},
        database=database,
        exclude_user_id=current_user.id,
    )
    return {"ok": True, "timezone": saved}


@router.post("/update_server_notifications")
async def update_server_notifications(body: Server_notifications_update, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    require_server_perm(database, server, current_user.id, "update_server", "You do not have permission to update this server.")

    kind = clean_server_notifications(body.default_notifications)
    if kind is None:
        raise HTTPException(status_code=400, detail="Pick All Messages or Only @mentions.")

    server.default_notifications = kind
    database.commit()
    await server_broadcast(
        server_id=server.id,
        payload={"type": "server_notifications_updated", "server_id": server.id, "default_notifications": kind},
        database=database,
        exclude_user_id=current_user.id,
    )
    return {"ok": True, "default_notifications": kind}


@router.post("/update_server_privacy")
async def update_server_privacy(body: Server_privacy_update, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    require_server_perm(database, server, current_user.id, "update_server", "You do not have permission to update this server.")

    mode = clean_server_privacy_mode(body.privacy_mode)
    if mode is None:
        raise HTTPException(status_code=400, detail="Pick Private, Default, or Open entry.")
    discoverable = bool(body.discoverable) and mode != "private"
    server.privacy_mode = mode
    server.discoverable = discoverable
    database.commit()
    fields = server_privacy_fields(server)
    await server_broadcast(
        server_id=server.id,
        payload={"type": "server_privacy_updated", "server_id": server.id, **fields},
        database=database,
        exclude_user_id=current_user.id,
    )
    return {"ok": True, **fields}


@router.get("/get_server_members/{server_id}")
def get_server_members(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    in_server = database.query(Server_members).filter(Server_members.server_id == server_id, Server_members.user_id == current_user.id).first()
    if not in_server:
        raise HTTPException(status_code=404, detail="Server membership not found")

    server = database.query(Servers).filter(Servers.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    from app.routers.roles import seed_server_roles, hoist_roles_by_user, name_color_roles_by_user
    seed_server_roles(database, server_id)
    database.commit()

    memberships = database.query(Server_members).filter(Server_members.server_id == server_id).all()
    user_ids = [row.user_id for row in memberships]
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(user_ids)).all()
    account_lookup = {account.id: account for account in accounts}
    hoist_map = hoist_roles_by_user(database, server_id, user_ids)
    name_map = name_color_roles_by_user(database, server_id, user_ids)
    highest_map = highest_roles_by_user(database, server_id, user_ids)

    members = []
    for row in memberships:
        account = account_lookup.get(row.user_id)
        if account:
            members.append(serialize_member(
                account,
                account.id == server.owner_id,
                hoist_map.get(account.id),
                name_map.get(account.id),
                highest_map.get(account.id),
                iso_dt(timeout_until_for(row)),
                getattr(row, "timeout_reason", None) if timeout_until_for(row) else None,
            ))
    return {"server_id": server_id, "members": members}


@router.get("/server_settings_members/{server_id}")
def server_settings_members(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, server_id, current_user.id)
    require_server_roster(database, server, current_user.id)
    seed_server_roles(database, server_id)
    database.commit()

    memberships = database.query(Server_members).filter(Server_members.server_id == server_id).all()
    user_ids = [row.user_id for row in memberships]
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(user_ids)).all() if user_ids else []
    account_lookup = {account.id: account for account in accounts}
    hoist_map = hoist_roles_by_user(database, server_id, user_ids)
    name_map = name_color_roles_by_user(database, server_id, user_ids)
    highest_map = highest_roles_by_user(database, server_id, user_ids)
    roles_by_user = {}
    for uid in user_ids:
        roles_by_user[uid] = assigned_roles_for_user(database, server_id, uid)

    members = []
    for row in memberships:
        account = account_lookup.get(row.user_id)
        if not account:
            continue
        payload = serialize_member(
            account,
            account.id == server.owner_id,
            hoist_map.get(account.id),
            name_map.get(account.id),
            highest_map.get(account.id),
            iso_dt(timeout_until_for(row)),
            getattr(row, "timeout_reason", None) if timeout_until_for(row) else None,
        )
        payload["display_name"] = public_display_name(account)
        payload["joined_at"] = iso_dt(row.joined_at) if getattr(row, "joined_at", None) else None
        payload["created_at"] = iso_dt(getattr(account, "created_at", None)) if getattr(account, "created_at", None) else None
        payload["roles"] = roles_by_user.get(account.id) or []
        members.append(payload)
    return {"server_id": server_id, "members": members}


@router.post("/message_server_channel")
async def message_server_channel(server_msg: Server_message, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel = database.query(Server_channels).filter(Server_channels.id == server_msg.channel_id).first()
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()

    if not is_member:
        raise HTTPException(status_code=404, detail= "Server membership not found.")
    require_channel_perm(database, server, current_user.id, channel.id, "send_messages", "You do not have permission to send messages in this channel.")
    if server_msg.attachment:
        require_channel_perm(database, server, current_user.id, channel.id, "upload_chat_media", "You do not have permission to upload media.")
    require_not_timed_out(is_member)
    require_channel_slowmode(database, server, current_user.id, channel)

    require_message_body(server_msg.content, server_msg.attachment)
    parent = None
    if server_msg.reply_to_id:
        candidate = database.query(Channel_messages).filter(Channel_messages.id == server_msg.reply_to_id, Channel_messages.channel_id == channel.id).first()
        parent = accepted_reply_parent(candidate)
    new_message = Channel_messages(
        sender_id= current_user.id,
        channel_id = channel.id,
        content= server_msg.content,
        attachment=store_attachment(server_msg.attachment, current_user),
        reply_to_id= parent.id if parent else None,
    )
    database.add(new_message)
    database.flush()
    member_ids = [row.user_id for row in database.query(Server_members).filter(Server_members.server_id == server.id).all()]
    apply_channel_mentions(database, new_message, server, member_ids, reply_author_id= parent.sender_id if parent else None)
    seed_channel_unread(database, channel.id, member_ids, current_user.id, new_message.timestamp)
    stamp_channel_view(database, channel.id, current_user.id)
    database.commit()
    database.refresh(new_message)
    if parent and parent.sender_id:
        await notify_activity_reply(
            database,
            receiver_id=parent.sender_id,
            actor_id=current_user.id,
            message_kind="channel",
            message_id=new_message.id,
            server_id=server.id,
        )
    return new_message    

@router.get("/get_channel_history/{channel_id}")
def get_channel_history(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user), before_id: int = None, around_id: int = None):

    target_channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not target_channel:
        raise HTTPException(status_code= 404, detail="Channel not found.")

    category = database.query(Server_categories).filter(Server_categories.id == target_channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()

    if not is_member:
        raise HTTPException(status_code= 404, detail="Server membership not found")
    require_channel_perm(database, server, current_user.id, target_channel.id, "read_messages", "You do not have permission to read messages.")

    base = database.query(Channel_messages).filter(Channel_messages.channel_id == channel_id)
    around_mode = False
    if around_id:
        target = base.filter(Channel_messages.id == around_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="No message found")
        before = base.filter(Channel_messages.id < around_id).order_by(Channel_messages.timestamp.desc()).limit(12).all()
        after = base.filter(Channel_messages.id > around_id).order_by(Channel_messages.timestamp.asc()).limit(12).all()
        channel_history = list(reversed(before)) + [target] + after
        around_mode = True
    elif before_id:
        channel_history = base.filter(Channel_messages.id < before_id).order_by(Channel_messages.timestamp.desc()).limit(25).all()
    else:
        stamp_channel_view(database, channel_id, current_user.id)
        database.commit()
        channel_history = base.order_by(Channel_messages.timestamp.desc()).limit(25).all()

    channel_history = drop_blocked_rows(database, current_user.id, channel_history)

    sender_ids = list({message.sender_id for message in channel_history})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(sender_ids)).all()
    username_lookup = {account.id: account.username for account in accounts}
    faces = avatar_lookup(accounts)
    reaction_map = reactions_for_messages(database, "channel", [message.id for message in channel_history], current_user.id)
    mention_meta = decorate_history(database, "channel", channel_history, current_user.id)
    reply_map = reply_map_for(database, Channel_messages, channel_history)
    from app.routers.roles import name_color_roles_by_user
    name_map = name_color_roles_by_user(database, server.id, sender_ids)

    message_history = []
    for index, message in enumerate(channel_history):
        message_history.append({
            "id": message.id,
            "sender_id": message.sender_id,
            "username": "" if message.sender_id == None else username_lookup.get(message.sender_id, ""),
            "content": message.content,
            "attachment": attachment_public(message.attachment),
            "timestamp": str(message.timestamp),
            "edited": bool(message.edited),
            "reactions": reaction_map.get(message.id, []),
            "mentioned": mention_meta[index]["mentioned"],
            "mention_users": mention_meta[index]["mention_users"],
            "mention_roles": mention_meta[index]["mention_roles"],
            "reply_to": reply_map.get(message.reply_to_id) if message.reply_to_id else None,
            "avatar": faces.get(message.sender_id),
            "name_role": name_map.get(message.sender_id),
        })

    if not around_mode:
        message_history.reverse()
    from app.site_moderation import mask_message_payloads
    mask_message_payloads(database, message_history)
    return {"server_name": server.name, "server_id": server.id, "channel_id": channel_id, "session_username": current_user.username, "messages": message_history}

@router.post("/create_category")
async def create_category(category_info: Category_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, category_info.server_id, current_user.id)
    require_server_perm(database, server, current_user.id, "manage_channels", "You do not have permission to manage channels.")
    
    highest_position = database.query(func.max(Server_categories.position)).filter(Server_categories.server_id == category_info.server_id).scalar()

    new_category = Server_categories(
        server_id = server.id,
        name = category_info.name,
        position = 100 if highest_position == None else highest_position + 100,
        is_private = category_info.is_private
    )
    database.add(new_category)
    database.commit()
    database.refresh(new_category)
    payload = {
        "type": "category_created",
        "server_id": server.id,
        "category": {"id": new_category.id, "name": new_category.name, "position": new_category.position, "is_private": new_category.is_private, "channels": []}
    }
    await server_broadcast(server_id= server.id, payload= payload, database= database, exclude_user_id= current_user.id)
    return "success"

@router.post("/create_channel")
async def create_channel(channel_info: Channel_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    category = database.query(Server_categories).filter(Server_categories.id == channel_info.category_id).first()
    if not category:
        raise HTTPException (status_code= 404, detail= "Category not found")
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    require_server_perm(database, server, current_user.id, "manage_channels", "You do not have permission to manage channels.")

    highest_position = database.query(func.max(Server_channels.position)).filter(Server_channels.category_id == channel_info.category_id).scalar()

    new_channel = Server_channels(
        category_id = category.id,
        name = channel_info.name,
        channel_type = channel_info.channel_type,
        position = 100 if highest_position == None else highest_position + 100,
        is_private = channel_info.is_private
    )
    database.add(new_channel)
    database.commit()
    database.refresh(new_channel)
    payload = {
        "type": "channel_created",
        "server_id": server.id,
        "channel": {"channel_type": new_channel.channel_type, "id": new_channel.id, "name": new_channel.name, "position": new_channel.position, "is_private": new_channel.is_private, "topic": "", "slowmode": 0, "category_id": new_channel.category_id}
    }
    await server_broadcast(server_id= server.id, payload= payload, database= database, exclude_user_id= current_user.id)
    return "success"

def gap_insert_position(neighbor_positions, insert_index):
    n = len(neighbor_positions)
    if n == 0:
        return 100, False
    if insert_index <= 0:
        after = int(neighbor_positions[0] or 0)
        candidate = after - 100
        if candidate < 1:
            return None, True
        return candidate, False
    if insert_index >= n:
        before = int(neighbor_positions[-1] or 0)
        return before + 100, False
    before = int(neighbor_positions[insert_index - 1] or 0)
    after = int(neighbor_positions[insert_index] or 0)
    mid = (before + after) // 2
    if mid <= before or mid >= after:
        return None, True
    return mid, False

def repack_row_positions(rows):
    for index, row in enumerate(rows):
        row.position = (index + 1) * 100

def insert_index_for_before(ordered_ids, before_id):
    if before_id is None:
        return len(ordered_ids)
    try:
        return ordered_ids.index(before_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Drop target not found")

@router.post("/reorder_server_rail")
def reorder_server_rail(body: Reorder_server_rail, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    memberships = (
        database.query(Server_members)
        .filter(Server_members.user_id == current_user.id)
        .order_by(Server_members.position, Server_members.id)
        .all()
    )
    moved = next((row for row in memberships if row.server_id == body.server_id), None)
    if not moved:
        raise HTTPException(status_code=404, detail="Server membership not found")
    if body.before_server_id == body.server_id:
        raise HTTPException(status_code=400, detail="Invalid drop target")
    others = [row for row in memberships if row.server_id != body.server_id]
    insert_at = insert_index_for_before([row.server_id for row in others], body.before_server_id)
    position, need_repack = gap_insert_position([row.position for row in others], insert_at)
    if need_repack or position is None:
        ordered = others[:insert_at] + [moved] + others[insert_at:]
        repack_row_positions(ordered)
    else:
        moved.position = position
    database.commit()
    refreshed = (
        database.query(Server_members)
        .filter(Server_members.user_id == current_user.id)
        .order_by(Server_members.position, Server_members.id)
        .all()
    )
    return {
        "servers": [{"id": row.server_id, "position": int(row.position or 0)} for row in refreshed]
    }

@router.post("/reorder_category")
async def reorder_category(body: Reorder_category, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    category = database.query(Server_categories).filter(Server_categories.id == body.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    server = require_server_member(database, category.server_id, current_user.id)
    require_server_perm(database, server, current_user.id, "manage_channels", "You do not have permission to manage channels.")
    if body.before_category_id == body.category_id:
        raise HTTPException(status_code=400, detail="Invalid drop target")
    categories = (
        database.query(Server_categories)
        .filter(Server_categories.server_id == server.id)
        .order_by(Server_categories.position, Server_categories.id)
        .all()
    )
    moved = next((row for row in categories if row.id == body.category_id), None)
    if not moved:
        raise HTTPException(status_code=404, detail="Category not found")
    others = [row for row in categories if row.id != body.category_id]
    if body.before_category_id is not None:
        target = next((row for row in others if row.id == body.before_category_id), None)
        if not target:
            raise HTTPException(status_code=404, detail="Drop target not found")
    insert_at = insert_index_for_before([row.id for row in others], body.before_category_id)
    position, need_repack = gap_insert_position([row.position for row in others], insert_at)
    if need_repack or position is None:
        ordered = others[:insert_at] + [moved] + others[insert_at:]
        repack_row_positions(ordered)
    else:
        moved.position = position
    database.commit()
    refreshed = (
        database.query(Server_categories)
        .filter(Server_categories.server_id == server.id)
        .order_by(Server_categories.position, Server_categories.id)
        .all()
    )
    payload = {
        "type": "categories_reordered",
        "server_id": server.id,
        "categories": [{"id": row.id, "position": int(row.position or 0)} for row in refreshed],
    }
    await server_broadcast(server_id=server.id, payload=payload, database=database, exclude_user_id=current_user.id)
    return payload

@router.post("/reorder_channel")
async def reorder_channel(body: Reorder_channel, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel = database.query(Server_channels).filter(Server_channels.id == body.channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    source_category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    if not source_category:
        raise HTTPException(status_code=404, detail="Category not found")
    target_category = database.query(Server_categories).filter(Server_categories.id == body.category_id).first()
    if not target_category:
        raise HTTPException(status_code=404, detail="Category not found")
    if source_category.server_id != target_category.server_id:
        raise HTTPException(status_code=400, detail="Categories must be in the same server")
    server = require_server_member(database, target_category.server_id, current_user.id)
    require_server_perm(database, server, current_user.id, "manage_channels", "You do not have permission to manage channels.")
    if body.before_channel_id == body.channel_id:
        raise HTTPException(status_code=400, detail="Invalid drop target")

    old_category_id = channel.category_id
    siblings = (
        database.query(Server_channels)
        .filter(Server_channels.category_id == target_category.id)
        .order_by(Server_channels.position, Server_channels.id)
        .all()
    )
    others = [row for row in siblings if row.id != body.channel_id]
    if body.before_channel_id is not None:
        target = next((row for row in others if row.id == body.before_channel_id), None)
        if not target:
            raise HTTPException(status_code=404, detail="Drop target not found")
    insert_at = insert_index_for_before([row.id for row in others], body.before_channel_id)
    channel.category_id = target_category.id
    position, need_repack = gap_insert_position([row.position for row in others], insert_at)
    if need_repack or position is None:
        ordered = others[:insert_at] + [channel] + others[insert_at:]
        repack_row_positions(ordered)
    else:
        channel.position = position
    database.commit()

    touched_ids = {old_category_id, target_category.id}
    channels_out = []
    for category_id in touched_ids:
        rows = (
            database.query(Server_channels)
            .filter(Server_channels.category_id == category_id)
            .order_by(Server_channels.position, Server_channels.id)
            .all()
        )
        for row in rows:
            channels_out.append({
                "id": row.id,
                "category_id": row.category_id,
                "position": int(row.position or 0),
            })
    payload = {
        "type": "channels_reordered",
        "server_id": server.id,
        "channels": channels_out,
    }
    await server_broadcast(server_id=server.id, payload=payload, database=database, exclude_user_id=current_user.id)
    return payload

def purge_channel_contents(database, channel):
    messages = database.query(Channel_messages).filter(Channel_messages.channel_id == channel.id).all()
    for message in messages:
        clear_reactions(database, "channel", message.id)
        clear_pins(database, "channel", message.id)
        clear_mentions(database, "channel", message.id)
        delete_attachment(message.attachment)
        database.delete(message)
    database.query(Channel_last_viewed).filter(Channel_last_viewed.channel_id == channel.id).delete()
    database.query(Message_pin).filter(
        Message_pin.scope_kind == "channel",
        Message_pin.scope_id == channel.id,
    ).delete(synchronize_session=False)

    posts = database.query(Announcement_post).filter(Announcement_post.channel_id == channel.id).all()
    for post in posts:
        comments = database.query(Announcement_comment).filter(Announcement_comment.post_id == post.id).all()
        for comment in comments:
            clear_reactions(database, "comment", comment.id)
            clear_pins(database, "comment", comment.id)
            clear_mentions(database, "comment", comment.id)
            database.delete(comment)
        clear_reactions(database, "announcement", post.id)
        clear_pins(database, "announcement", post.id)
        clear_mentions(database, "announcement", post.id)
        delete_attachment(post.attachment)
        database.delete(post)

    forum_posts = database.query(Forum_post).filter(Forum_post.channel_id == channel.id).all()
    for post in forum_posts:
        thread_messages = database.query(Forum_messages).filter(Forum_messages.post_id == post.id).all()
        for message in thread_messages:
            clear_reactions(database, "forum", message.id)
            clear_pins(database, "forum", message.id)
            clear_mentions(database, "forum", message.id)
            delete_attachment(message.attachment)
            database.delete(message)
        clear_reactions(database, "forum_post", post.id)
        clear_pins(database, "forum_post", post.id)
        clear_mentions(database, "forum_post", post.id)
        delete_attachment(post.attachment)
        database.delete(post)

    list_items = database.query(List_item).filter(List_item.channel_id == channel.id).all()
    for item in list_items:
        database.query(List_check).filter(List_check.item_id == item.id).delete(synchronize_session=False)
        database.query(List_thread_message).filter(List_thread_message.item_id == item.id).delete(synchronize_session=False)
        database.delete(item)

    event_ids = [row.id for row in database.query(Calendar_event.id).filter(Calendar_event.channel_id == channel.id).all()]
    if event_ids:
        database.query(Calendar_event_rsvp).filter(Calendar_event_rsvp.event_id.in_(event_ids)).delete(synchronize_session=False)
        database.query(Calendar_event_comment).filter(Calendar_event_comment.event_id.in_(event_ids)).delete(synchronize_session=False)
        for event_id in event_ids:
            clear_reactions(database, "calendar_event", event_id)
    database.query(Calendar_event).filter(Calendar_event.channel_id == channel.id).delete(synchronize_session=False)
    database.query(Schedule_block).filter(Schedule_block.channel_id == channel.id).delete(synchronize_session=False)
    database.query(Doc_entry).filter(Doc_entry.channel_id == channel.id).delete(synchronize_session=False)
    media_ids = [row.id for row in database.query(Media_item.id).filter(Media_item.channel_id == channel.id).all()]
    if media_ids:
        media_comments = database.query(Media_comment).filter(Media_comment.item_id.in_(media_ids)).all()
        for comment in media_comments:
            clear_reactions(database, "media_comment", comment.id)
            clear_pins(database, "media_comment", comment.id)
            clear_mentions(database, "media_comment", comment.id)
            database.delete(comment)
    database.query(Media_item).filter(Media_item.channel_id == channel.id).delete(synchronize_session=False)

    page = database.query(Doc_page).filter(Doc_page.channel_id == channel.id).first()
    if page:
        database.delete(page)

    clear_channel_mentions(database, channel.id)
    database.delete(channel)

@router.post("/update_channel")
async def update_channel(body: Channel_update, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel = database.query(Server_channels).filter(Server_channels.id == body.channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    server = require_server_member(database, category.server_id, current_user.id)
    require_channel_perm(database, server, current_user.id, channel.id, "manage_channels", "You do not have permission to manage this channel.")
    if body.name is None and body.is_private is None and body.topic is None and body.slowmode is None:
        raise HTTPException(status_code=400, detail="Nothing to update")
    if body.name is not None:
        name = (body.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Channel name is required")
        if len(name) > 100:
            name = name[:100]
        channel.name = name
    if body.is_private is not None:
        channel.is_private = bool(body.is_private)
    if body.topic is not None:
        topic = (body.topic or "").strip()
        if len(topic) > 1024:
            topic = topic[:1024]
        channel.topic = topic or None
    if body.slowmode is not None:
        channel.slowmode = normalize_slowmode(body.slowmode)
    database.commit()
    database.refresh(channel)
    payload = {
        "type": "channel_updated",
        "server_id": server.id,
        "channel": {
            "id": channel.id,
            "name": channel.name,
            "channel_type": channel.channel_type,
            "position": channel.position,
            "is_private": bool(channel.is_private),
            "topic": getattr(channel, "topic", None) or "",
            "slowmode": int(getattr(channel, "slowmode", 0) or 0),
            "category_id": channel.category_id,
        },
    }
    await server_broadcast(server_id=server.id, payload=payload, database=database, exclude_user_id=current_user.id)
    return payload

@router.post("/update_category")
async def update_category(body: Category_update, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    category = database.query(Server_categories).filter(Server_categories.id == body.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    server = require_server_member(database, category.server_id, current_user.id)
    require_server_perm(database, server, current_user.id, "manage_channels", "You do not have permission to manage channels.")
    if body.name is None and body.is_private is None:
        raise HTTPException(status_code=400, detail="Nothing to update")
    if body.name is not None:
        name = (body.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Category name is required")
        if len(name) > 100:
            name = name[:100]
        category.name = name
    if body.is_private is not None:
        category.is_private = bool(body.is_private)
    database.commit()
    database.refresh(category)
    payload = {
        "type": "category_updated",
        "server_id": server.id,
        "category": {
            "id": category.id,
            "name": category.name,
            "position": category.position,
            "is_private": bool(category.is_private),
        },
    }
    await server_broadcast(server_id=server.id, payload=payload, database=database, exclude_user_id=current_user.id)
    return payload

@router.post("/delete_channel/{channel_id}")
async def delete_channel(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    require_server_perm(database, server, current_user.id, "manage_channels", "You do not have permission to manage channels.")

    write_audit_log(database, server.id, current_user.id, "delete_channel", "channel", channel.id, {
        "name": channel.name,
        "channel_type": channel.channel_type,
        "category_id": category.id
    })
    category_id = category.id
    purge_channel_contents(database, channel)
    database.commit()
    payload = {
        "type": "channel_deleted",
        "server_id": server.id,
        "category_id": category_id,
        "channel_id": channel_id
    }
    await server_broadcast(server_id= server.id, payload= payload, database= database, exclude_user_id= current_user.id)
    return {"channel_id": channel_id, "category_id": category_id}

@router.post("/delete_category/{category_id}")
async def delete_category(category_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    category = database.query(Server_categories).filter(Server_categories.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    require_server_perm(database, server, current_user.id, "manage_channels", "You do not have permission to manage channels.")

    channels = database.query(Server_channels).filter(Server_channels.category_id == category.id).all()
    channel_ids = [channel.id for channel in channels]
    write_audit_log(database, server.id, current_user.id, "delete_category", "category", category.id, {
        "name": category.name,
        "channel_ids": channel_ids
    })
    for channel in channels:
        purge_channel_contents(database, channel)
    database.delete(category)
    database.commit()
    payload = {
        "type": "category_deleted",
        "server_id": server.id,
        "category_id": category_id,
        "channel_ids": channel_ids
    }
    await server_broadcast(server_id= server.id, payload= payload, database= database, exclude_user_id= current_user.id)
    return {"category_id": category_id, "channel_ids": channel_ids}

@router.post("/leave_server/{server_id}")
async def leave_server(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = database.query(Servers).filter(Servers.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if server.owner_id == current_user.id:
        raise HTTPException(status_code=403, detail="Owner cannot leave the server")

    membership = database.query(Server_members).filter(Server_members.server_id == server_id, Server_members.user_id == current_user.id).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Server membership not found")

    category = database.query(Server_categories).filter(Server_categories.server_id == server_id).order_by(Server_categories.position).first()
    channel = None
    if category:
        channel = database.query(Server_channels).filter(Server_channels.category_id == category.id).order_by(Server_channels.position).first()
    if channel:
        leave_message = Channel_messages(
            sender_id = None,
            channel_id = channel.id,
            content = f"{current_user.username} has left the server"
        )
        database.add(leave_message)

    write_audit_log(database, server_id, current_user.id, "member_left", "member", current_user.id, {
        "username": current_user.username,
    })
    database.delete(membership)
    database.commit()
    await server_broadcast(server_id= server_id, payload= {
        "type": "member_left",
        "scope": "server",
        "scope_id": server_id,
        "user_id": current_user.id
    }, database= database, exclude_user_id= current_user.id)
    return {"server_id": server_id}


@router.post("/delete_server")
async def delete_server(body: Server_delete, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = database.query(Servers).filter(Servers.id == body.server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the server owner can delete this server.")
    typed = (body.confirm_name or "").strip()
    if typed != (server.name or ""):
        raise HTTPException(status_code=400, detail="Type the full server name to confirm.")

    server_id = server.id
    member_ids = [
        row.user_id
        for row in database.query(Server_members).filter(Server_members.server_id == server_id).all()
        if row.user_id != current_user.id
    ]
    from app.site_moderation import wipe_owned_server
    wipe_owned_server(database, server)
    database.commit()

    payload = {
        "type": "server_deleted",
        "server_id": server_id,
    }
    for uid in member_ids:
        from app.routers.deletion import notify_user
        await notify_user(uid, payload)
    return {"ok": True, "server_id": server_id}
