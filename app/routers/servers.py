from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import UserInfo, Servers, Server_members, Server_categories, Server_channels, Channel_messages, Channel_last_viewed, Announcement_post, Announcement_comment, Forum_post, Forum_messages, Doc_page
from app.schemas import Server_create, Server_message, Category_create, Channel_create, Server_icon_update, Server_banner_update, Server_name_update, Server_about_update, Server_url_update, Server_type_update
from app.database import get_db
from app.auth import get_current_user
from app.r2 import ALLOWED_MIME, PROFILE_IMAGE_BYTES, SERVER_KEY_RE, attachment_public, delete_attachment, delete_r2_object, normalize_mime, public_url_for, require_message_body, store_attachment
from app.routers.deletion import write_audit_log
from app.routers.reactions import clear_reactions, reactions_for_messages
from app.routers.realtime import serialize_member, server_broadcast
from app.routers.mentions import apply_channel_mentions, decorate_history, server_notice, channel_notice, stamp_channel_view, clear_mentions, seed_channel_unread, clear_channel_mentions, accepted_reply_parent, reply_map_for
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
    is_owner = server.owner_id == current_user.id
    server_info = []

    for category in all_categories:
        channel_info = []
        if category.is_private == False or is_owner:
            all_channels = database.query(Server_channels).filter(Server_channels.category_id == category.id).order_by(Server_channels.position).all()

            for channel in all_channels:
                if channel.is_private == False or is_owner:
                    notice = channel_notice(database, channel.id, current_user.id)
                    channel_info.append({
                        "id": channel.id,
                        "category_id": channel.category_id,
                        "name": channel.name,
                        "channel_type": channel.channel_type,
                        "position": channel.position,
                        "is_private": channel.is_private,
                        "unread": notice["unread"],
                        "mention_count": notice["mention_count"]
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
        **server_banner_fields(server)
    }


@router.post("/update_server_icon")
async def update_server_icon(body: Server_icon_update, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = database.query(Servers).filter(Servers.id == body.server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the server owner can change the icon.")

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
    server = database.query(Servers).filter(Servers.id == body.server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the server owner can change the banner.")

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
    server = database.query(Servers).filter(Servers.id == body.server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the server owner can change the name.")

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
    server = database.query(Servers).filter(Servers.id == body.server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the server owner can change the about text.")

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
    server = database.query(Servers).filter(Servers.id == body.server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the server owner can change the URL.")

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
    server = database.query(Servers).filter(Servers.id == body.server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the server owner can change the type.")

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


@router.get("/get_server_members/{server_id}")
def get_server_members(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    in_server = database.query(Server_members).filter(Server_members.server_id == server_id, Server_members.user_id == current_user.id).first()
    if not in_server:
        raise HTTPException(status_code=404, detail="Server membership not found")

    server = database.query(Servers).filter(Servers.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    memberships = database.query(Server_members).filter(Server_members.server_id == server_id).all()
    user_ids = [row.user_id for row in memberships]
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(user_ids)).all()
    account_lookup = {account.id: account for account in accounts}

    members = []
    for row in memberships:
        account = account_lookup.get(row.user_id)
        if account:
            members.append(serialize_member(account, account.id == server.owner_id))
    return {"server_id": server_id, "members": members}

@router.post("/message_server_channel")
def message_server_channel(server_msg: Server_message, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel = database.query(Server_channels).filter(Server_channels.id == server_msg.channel_id).first()
    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()

    if not is_member:
        raise HTTPException(status_code=404, detail= "Server membership not found.")

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
    return new_message    

@router.get("/get_channel_history/{channel_id}")
def get_channel_history(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user), before_id: int = None):

    target_channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not target_channel:
        raise HTTPException(status_code= 404, detail="Channel not found.")

    category = database.query(Server_categories).filter(Server_categories.id == target_channel.category_id).first()
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()

    if not is_member:
        raise HTTPException(status_code= 404, detail="Server membership not found")

    if before_id:
        channel_history = database.query(Channel_messages).filter(Channel_messages.channel_id == channel_id, Channel_messages.id < before_id).order_by(Channel_messages.timestamp.desc()).limit(25).all()
    else:
        stamp_channel_view(database, channel_id, current_user.id)
        database.commit()
        channel_history = database.query(Channel_messages).filter(Channel_messages.channel_id == channel_id).order_by(Channel_messages.timestamp.desc()).limit(25).all()

    sender_ids = list({message.sender_id for message in channel_history})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(sender_ids)).all()
    username_lookup = {account.id: account.username for account in accounts}
    reaction_map = reactions_for_messages(database, "channel", [message.id for message in channel_history], current_user.id)
    mention_meta = decorate_history(database, "channel", channel_history, current_user.id)
    reply_map = reply_map_for(database, Channel_messages, channel_history)

    message_history = []
    for index, message in enumerate(channel_history):
        message_history.append({
            "id": message.id,
            "sender_id": message.sender_id,
            "username": "" if message.sender_id == None else username_lookup[message.sender_id],
            "content": message.content,
            "attachment": attachment_public(message.attachment),
            "timestamp": str(message.timestamp),
            "edited": bool(message.edited),
            "reactions": reaction_map.get(message.id, []),
            "mentioned": mention_meta[index]["mentioned"],
            "mention_users": mention_meta[index]["mention_users"],
            "reply_to": reply_map.get(message.reply_to_id) if message.reply_to_id else None,
        })

    message_history.reverse()
    return {"server_name": server.name, "server_id": server.id, "channel_id": channel_id, "session_username": current_user.username, "messages": message_history}

@router.post("/create_category")
async def create_category(category_info: Category_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = database.query(Servers).filter(Servers.id == category_info.server_id).first()
    if not server or not server.owner_id == current_user.id:
        raise HTTPException(status_code= 403, detail= "Server or owner doesnt match")
    
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

    if not server.owner_id == current_user.id:
        raise HTTPException(status_code= 403, detail="Owner doesn't match")

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
        "channel": {"channel_type": new_channel.channel_type, "id": new_channel.id, "name": new_channel.name, "position": new_channel.position, "is_private": new_channel.is_private, "category_id": new_channel.category_id}
    }
    await server_broadcast(server_id= server.id, payload= payload, database= database, exclude_user_id= current_user.id)
    return "success"

def purge_channel_contents(database, channel):
    messages = database.query(Channel_messages).filter(Channel_messages.channel_id == channel.id).all()
    for message in messages:
        clear_reactions(database, "channel", message.id)
        clear_mentions(database, "channel", message.id)
        delete_attachment(message.attachment)
        database.delete(message)
    database.query(Channel_last_viewed).filter(Channel_last_viewed.channel_id == channel.id).delete()

    posts = database.query(Announcement_post).filter(Announcement_post.channel_id == channel.id).all()
    for post in posts:
        comments = database.query(Announcement_comment).filter(Announcement_comment.post_id == post.id).all()
        for comment in comments:
            clear_reactions(database, "comment", comment.id)
            clear_mentions(database, "comment", comment.id)
            database.delete(comment)
        clear_reactions(database, "announcement", post.id)
        clear_mentions(database, "announcement", post.id)
        delete_attachment(post.attachment)
        database.delete(post)

    forum_posts = database.query(Forum_post).filter(Forum_post.channel_id == channel.id).all()
    for post in forum_posts:
        thread_messages = database.query(Forum_messages).filter(Forum_messages.post_id == post.id).all()
        for message in thread_messages:
            clear_reactions(database, "forum", message.id)
            clear_mentions(database, "forum", message.id)
            delete_attachment(message.attachment)
            database.delete(message)
        clear_reactions(database, "forum_post", post.id)
        clear_mentions(database, "forum_post", post.id)
        delete_attachment(post.attachment)
        database.delete(post)

    page = database.query(Doc_page).filter(Doc_page.channel_id == channel.id).first()
    if page:
        database.delete(page)

    clear_channel_mentions(database, channel.id)
    database.delete(channel)

@router.post("/delete_channel/{channel_id}")
async def delete_channel(channel_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    server = database.query(Servers).filter(Servers.id == category.server_id).first()
    if not server or not server.owner_id == current_user.id:
        raise HTTPException(status_code=403, detail="Owner doesn't match")

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
    if not server or not server.owner_id == current_user.id:
        raise HTTPException(status_code=403, detail="Owner doesn't match")

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

    database.delete(membership)
    database.commit()
    await server_broadcast(server_id= server_id, payload= {
        "type": "member_left",
        "scope": "server",
        "scope_id": server_id,
        "user_id": current_user.id
    }, database= database, exclude_user_id= current_user.id)
    return {"server_id": server_id}
