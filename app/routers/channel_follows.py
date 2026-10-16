from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Announcement_post, Channel_follow
from app.schemas import Channel_follow_body, Channel_follow_move, Announcement_publish
from app.database import get_db
from app.auth import get_current_user
from app.r2 import post_attachments_public, public_url_for
from app.routers.realtime import server_broadcast
from app.routers.roles import effective_perms_for_user_in_channel, require_server_perm, channel_type_visible
from app.routers.profile import public_avatar
from app.routers.deletion import write_audit_log
from app.routers.mentions import note_channel_unread
from app.routers.announcements import load_joined_announcement, comments_are_open, public_plain, blog_privacy_ok

router = APIRouter()

PUBLISH_LIMIT = 10


def server_for_channel(database, channel):
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first() if channel else None
    return database.query(Servers).filter(Servers.id == category.server_id).first() if category else None


def source_can_publish(server):
    return blog_privacy_ok(server)


def follow_manager_ok(database, server, user_id, channel_id):
    perms = effective_perms_for_user_in_channel(database, server, user_id, channel_id)
    return bool(perms.get("manage_announcements") or perms.get("manage_channels"))


def require_follow_manager(database, channel_id, user_id):
    channel, server = load_joined_announcement(database, channel_id, user_id)
    if not follow_manager_ok(database, server, user_id, channel.id):
        raise HTTPException(status_code=403, detail="You do not have permission to manage follows for this channel.")
    return channel, server


def follow_row_payload(database, follow):
    source = database.query(Server_channels).filter(Server_channels.id == follow.source_channel_id).first()
    dest = database.query(Server_channels).filter(Server_channels.id == follow.dest_channel_id).first()
    source_server = server_for_channel(database, source)
    dest_server = server_for_channel(database, dest)
    return {
        "follow_id": follow.id,
        "source_channel_id": follow.source_channel_id,
        "source_server_id": source_server.id if source_server else "",
        "channel_name": (source.name if source and source.name else "announcements"),
        "server_name": (source_server.name if source_server and source_server.name else "Server"),
        "server_icon": public_url_for(source_server.icon_key) if source_server and getattr(source_server, "icon_key", None) else "",
        "dest_channel_id": follow.dest_channel_id,
        "dest_channel_name": (dest.name if dest and dest.name else "announcements"),
        "dest_server_id": dest_server.id if dest_server else "",
    }


def managed_announcement_channels(database, user, exclude_channel_id=None):
    servers = []
    memberships = database.query(Server_members).filter(Server_members.user_id == user.id).all()
    for member in memberships:
        server = database.query(Servers).filter(Servers.id == member.server_id).first()
        if not server:
            continue
        is_owner = server.owner_id == user.id
        channels_out = []
        categories = database.query(Server_categories).filter(Server_categories.server_id == server.id).all()
        for category in categories:
            if category.is_private and not is_owner:
                continue
            channels = database.query(Server_channels).filter(
                Server_channels.category_id == category.id,
                Server_channels.channel_type == "announcements",
            ).all()
            for channel in channels:
                if channel.id == exclude_channel_id:
                    continue
                if channel.is_private and not is_owner:
                    continue
                if not follow_manager_ok(database, server, user.id, channel.id):
                    continue
                channels_out.append({"channel_id": channel.id, "channel_name": channel.name or "announcements"})
        if channels_out:
            channels_out.sort(key=lambda row: (row["channel_name"].lower(), row["channel_id"]))
            servers.append({"server_id": server.id, "server_name": server.name or "Server", "channels": channels_out})
    servers.sort(key=lambda row: (row["server_name"].lower(), row["server_id"]))
    return servers


@router.get("/follow_targets/{source_channel_id}")
def follow_targets(source_channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    source, source_server = load_joined_announcement(database, source_channel_id, current_user.id)
    follower_count = database.query(Channel_follow).filter(Channel_follow.source_channel_id == source.id).count()
    followable = source_can_publish(source_server)
    taken = {
        row.dest_channel_id
        for row in database.query(Channel_follow).filter(Channel_follow.source_channel_id == source.id).all()
    }
    servers = []
    if followable:
        for entry in managed_announcement_channels(database, current_user, exclude_channel_id=source.id):
            channels = [row for row in entry["channels"] if row["channel_id"] not in taken]
            if channels:
                servers.append({"server_id": entry["server_id"], "server_name": entry["server_name"], "channels": channels})
    return {"channel_id": source.id, "followable": followable, "follower_count": follower_count, "servers": servers}


@router.post("/follow_channel")
def follow_channel(body: Channel_follow_body, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    if body.dest_channel_id == body.source_channel_id:
        raise HTTPException(status_code=400, detail="A channel cannot follow itself.")
    source, source_server = load_joined_announcement(database, body.source_channel_id, current_user.id)
    if not source_can_publish(source_server):
        raise HTTPException(status_code=400, detail="Private servers cannot be followed.")
    dest, dest_server = require_follow_manager(database, body.dest_channel_id, current_user.id)
    row = Channel_follow(source_channel_id=source.id, dest_channel_id=dest.id, created_by=current_user.id)
    database.add(row)
    try:
        database.flush()
    except IntegrityError:
        database.rollback()
        raise HTTPException(status_code=400, detail="This channel is already following that one.")
    write_audit_log(database, dest_server.id, current_user.id, "follow_channel", "channel", dest.id, {
        "name": dest.name or "announcements",
        "source_server": source_server.name or "Server",
        "source_channel": source.name or "announcements",
    })
    database.commit()
    database.refresh(row)
    return follow_row_payload(database, row)


def load_follow(database, follow_id, user_id):
    row = database.query(Channel_follow).filter(Channel_follow.id == follow_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Follow not found")
    dest, dest_server = require_follow_manager(database, row.dest_channel_id, user_id)
    return row, dest, dest_server


@router.post("/unfollow_channel")
def unfollow_channel(body: Channel_follow_move, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    row, dest, dest_server = load_follow(database, body.follow_id, current_user.id)
    info = follow_row_payload(database, row)
    write_audit_log(database, dest_server.id, current_user.id, "unfollow_channel", "channel", dest.id, {
        "name": dest.name or "announcements",
        "source_server": info["server_name"],
        "source_channel": info["channel_name"],
    })
    database.delete(row)
    database.commit()
    return {"ok": True, "follow_id": body.follow_id}


@router.post("/move_channel_follow")
def move_channel_follow(body: Channel_follow_move, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    row, dest, dest_server = load_follow(database, body.follow_id, current_user.id)
    if body.dest_channel_id == row.source_channel_id:
        raise HTTPException(status_code=400, detail="A channel cannot follow itself.")
    target, target_server = require_follow_manager(database, body.dest_channel_id, current_user.id)
    if target_server.id != dest_server.id:
        raise HTTPException(status_code=400, detail="Move a follow within the same server.")
    if target.id == dest.id:
        return follow_row_payload(database, row)
    clash = database.query(Channel_follow).filter(
        Channel_follow.source_channel_id == row.source_channel_id,
        Channel_follow.dest_channel_id == target.id,
    ).first()
    if clash:
        raise HTTPException(status_code=400, detail="That channel already follows this source.")
    info = follow_row_payload(database, row)
    row.dest_channel_id = target.id
    write_audit_log(database, dest_server.id, current_user.id, "move_channel_follow", "channel", target.id, {
        "name": target.name or "announcements",
        "from": dest.name or "announcements",
        "to": target.name or "announcements",
        "source_server": info["server_name"],
        "source_channel": info["channel_name"],
    })
    database.commit()
    database.refresh(row)
    return follow_row_payload(database, row)


@router.get("/channel_follows/{channel_id}")
def list_channel_follows(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    dest, _server = require_follow_manager(database, channel_id, current_user.id)
    follows = database.query(Channel_follow).filter(Channel_follow.dest_channel_id == dest.id).all()
    listed = [follow_row_payload(database, row) for row in follows]
    followed_ids = {row["source_channel_id"] for row in listed}
    sources = [
        row for row in visible_follow_sources(database, current_user)
        if row["channel_id"] != dest.id and row["channel_id"] not in followed_ids
    ]
    return {"follows": listed, "sources": sources}


def visible_follow_sources(database, user):
    found = []
    memberships = database.query(Server_members).filter(Server_members.user_id == user.id).all()
    for member in memberships:
        server = database.query(Servers).filter(Servers.id == member.server_id).first()
        if not server or not source_can_publish(server):
            continue
        is_owner = server.owner_id == user.id
        categories = database.query(Server_categories).filter(Server_categories.server_id == server.id).all()
        for category in categories:
            if category.is_private and not is_owner:
                continue
            channels = database.query(Server_channels).filter(
                Server_channels.category_id == category.id,
                Server_channels.channel_type == "announcements",
            ).all()
            for channel in channels:
                if channel.is_private and not is_owner:
                    continue
                perms = effective_perms_for_user_in_channel(database, server, user.id, channel.id)
                if not channel_type_visible(perms, "announcements"):
                    continue
                found.append({
                    "channel_id": channel.id,
                    "channel_name": channel.name or "announcements",
                    "server_name": server.name or "Server",
                })
    found.sort(key=lambda row: ((row["server_name"] or "").lower(), (row["channel_name"] or "").lower(), row["channel_id"]))
    return found


@router.get("/server_follows/{server_id}")
def server_follows(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = database.query(Servers).filter(Servers.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    require_server_perm(database, server, current_user.id, "update_server", "You do not have permission to view this page.")
    categories = database.query(Server_categories).filter(Server_categories.server_id == server.id).all()
    channel_ids = []
    channels_out = []
    for category in categories:
        for channel in database.query(Server_channels).filter(Server_channels.category_id == category.id, Server_channels.channel_type == "announcements").all():
            channel_ids.append(channel.id)
            channels_out.append({"channel_id": channel.id, "channel_name": channel.name or "announcements"})
    follows = database.query(Channel_follow).filter(Channel_follow.dest_channel_id.in_(channel_ids or [-1])).all()
    channels_out.sort(key=lambda row: (row["channel_name"].lower(), row["channel_id"]))
    return {"server_id": server.id, "follows": [follow_row_payload(database, row) for row in follows], "channels": channels_out}


def source_info_for_posts(database, posts):
    out = {}
    cache = {}
    for post in posts:
        source_id = getattr(post, "followed_from_id", None)
        if not source_id:
            continue
        if source_id in cache:
            out[post.id] = cache[source_id]
            continue
        source = database.query(Announcement_post).filter(Announcement_post.id == source_id).first()
        channel = database.query(Server_channels).filter(Server_channels.id == source.channel_id).first() if source else None
        server = server_for_channel(database, channel)
        info = {
            "source_post_id": source_id,
            "source_deleted": source is None,
            "source_channel_id": channel.id if channel else None,
            "source_channel_name": (channel.name if channel and channel.name else "announcements"),
            "source_server_id": server.id if server else "",
            "source_server_name": (server.name if server and server.name else "Server"),
            "source_server_icon": public_url_for(server.icon_key) if server and getattr(server, "icon_key", None) else "",
        }
        cache[source_id] = info
        out[post.id] = info
    return out


def copy_post_payload(database, copy, dest, author, info):
    return {
        "id": copy.id,
        "channel_id": dest.id,
        "title": copy.title,
        "body": copy.body,
        "attachment": post_attachments_public(copy.attachment),
        "created_at": str(copy.created_at),
        "sender_id": author.id if author else copy.sender_id,
        "username": author.username if author else "",
        "avatar": public_avatar(author) if author else None,
        "reactions": [],
        "edited": bool(copy.edited),
        "is_public": False,
        "comments_open": comments_are_open(copy),
        "highlighted": False,
        "followed": True,
        "followed_from": info,
        "mention_users": {},
        "mention_roles": {},
        "mentioned_ids": [],
        "name_role": None,
    }


async def fan_out_published(database, source_post, author):
    follows = database.query(Channel_follow).filter(Channel_follow.source_channel_id == source_post.channel_id).all()
    plain_body = public_plain(database, source_post.body)
    plain_title = public_plain(database, source_post.title)
    copies = []
    for follow in follows:
        dest = database.query(Server_channels).filter(Server_channels.id == follow.dest_channel_id).first()
        if not dest or dest.channel_type != "announcements":
            continue
        dest_server = server_for_channel(database, dest)
        if not dest_server:
            continue
        copy = Announcement_post(
            channel_id=dest.id,
            title=plain_title,
            body=plain_body,
            sender_id=source_post.sender_id,
            attachment=source_post.attachment,
            followed_from_id=source_post.id,
            is_public=False,
            comments_open=comments_are_open(source_post),
        )
        database.add(copy)
        note_channel_unread(database, dest_server.id, dest.id, source_post.sender_id)
        copies.append((copy, dest, dest_server))
    if not copies:
        database.commit()
        return 0
    database.commit()
    info = source_info_for_posts(database, [copies[0][0]]).get(copies[0][0].id)
    for copy, dest, dest_server in copies:
        database.refresh(copy)
        await server_broadcast(server_id=dest_server.id, payload={
            "type": "announcement_created",
            "server_id": dest_server.id,
            "post": copy_post_payload(database, copy, dest, author, info),
        }, database=database)
    return len(copies)


async def publish_post(database, post, channel, server, actor):
    if getattr(post, "followed_from_id", None):
        raise HTTPException(status_code=400, detail="A followed post cannot be published again.")
    if not source_can_publish(server):
        raise HTTPException(status_code=400, detail="Private servers cannot publish to followers.")
    if getattr(post, "published_at", None):
        raise HTTPException(status_code=400, detail="This post is already published.")
    since = datetime.utcnow() - timedelta(hours=1)
    recent = database.query(Announcement_post).filter(
        Announcement_post.channel_id == channel.id,
        Announcement_post.published_at.isnot(None),
        Announcement_post.published_at > since,
    ).count()
    if recent >= PUBLISH_LIMIT:
        raise HTTPException(status_code=429, detail=f"Only {PUBLISH_LIMIT} posts can be published per hour in this channel.")
    post.published_at = datetime.utcnow()
    write_audit_log(database, server.id, actor.id, "publish_announcement", "announcement_post", post.id, {
        "title": post.title,
        "name": channel.name or "announcements",
    })
    database.commit()
    author = database.query(UserInfo).filter(UserInfo.id == post.sender_id).first()
    delivered = await fan_out_published(database, post, author or actor)
    return delivered


@router.post("/publish_announcement")
async def publish_announcement(body: Announcement_publish, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    post = database.query(Announcement_post).filter(Announcement_post.id == body.post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    channel, server = load_joined_announcement(database, post.channel_id, current_user.id)
    perms = effective_perms_for_user_in_channel(database, server, current_user.id, channel.id)
    own = post.sender_id == current_user.id and bool(perms.get("create_announcements"))
    if not own and not perms.get("manage_announcements"):
        raise HTTPException(status_code=403, detail="You do not have permission to publish this post.")
    delivered = await publish_post(database, post, channel, server, current_user)
    payload = {"type": "announcement_published", "channel_id": channel.id, "post_id": post.id, "published_at": str(post.published_at)}
    await server_broadcast(server_id=server.id, payload=payload, database=database, exclude_user_id=current_user.id)
    return {"post_id": post.id, "published_at": str(post.published_at), "delivered": delivered}


async def sync_followed_edit(database, source_post):
    copies = database.query(Announcement_post).filter(Announcement_post.followed_from_id == source_post.id).all()
    if not copies:
        return
    plain_body = public_plain(database, source_post.body)
    plain_title = public_plain(database, source_post.title)
    for copy in copies:
        copy.title = plain_title
        copy.body = plain_body
        copy.attachment = source_post.attachment
        copy.edited = True
        copy.comments_open = comments_are_open(source_post)
    database.commit()
    for copy in copies:
        dest = database.query(Server_channels).filter(Server_channels.id == copy.channel_id).first()
        dest_server = server_for_channel(database, dest)
        if not dest_server:
            continue
        await server_broadcast(server_id=dest_server.id, payload={
            "type": "announcement_edited",
            "channel_id": copy.channel_id,
            "post_id": copy.id,
            "title": copy.title,
            "body": copy.body,
            "attachment": post_attachments_public(copy.attachment),
            "edited": True,
            "comments_open": comments_are_open(copy),
            "mention_users": {},
            "mention_roles": {},
        }, database=database)


async def sync_followed_delete(database, source_post_id):
    copies = database.query(Announcement_post).filter(Announcement_post.followed_from_id == source_post_id).all()
    if not copies:
        return
    for copy in copies:
        copy.title = "Original post deleted"
        copy.body = ""
        copy.attachment = None
        copy.edited = True
    database.commit()
    for copy in copies:
        dest = database.query(Server_channels).filter(Server_channels.id == copy.channel_id).first()
        dest_server = server_for_channel(database, dest)
        if not dest_server:
            continue
        await server_broadcast(server_id=dest_server.id, payload={
            "type": "announcement_edited",
            "channel_id": copy.channel_id,
            "post_id": copy.id,
            "title": copy.title,
            "body": copy.body,
            "attachment": [],
            "edited": True,
            "comments_open": comments_are_open(copy),
            "mention_users": {},
            "mention_roles": {},
            "source_deleted": True,
        }, database=database)
