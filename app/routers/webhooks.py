import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Channel_messages, Server_channels, Server_members, Server_webhooks, UserInfo
from app.routers.channel_follows import server_for_channel
from app.routers.deletion import write_audit_log
from app.routers.mentions import seed_channel_unread
from app.routers.realtime import server_broadcast
from app.routers.roles import (
    effective_perms_for_user,
    effective_perms_for_user_in_channel,
    require_server_member,
)

router = APIRouter()

WEBHOOK_NAME_MAX = 80
WEBHOOK_CONTENT_MAX = 2000
WEBHOOK_CAP = 15
WEBHOOK_DEFAULT_NAME = "Captain Hook"


class Webhook_create(BaseModel):
    server_id: str
    channel_id: int
    name: str = ""


class Webhook_update(BaseModel):
    webhook_id: int
    name: Optional[str] = None
    channel_id: Optional[int] = None


class Webhook_delete(BaseModel):
    webhook_id: int


class Webhook_test(BaseModel):
    webhook_id: int


def webhook_channel_ok(channel):
    return bool(channel and (channel.channel_type or "").lower() == "text")


def clean_webhook_name(raw):
    name = " ".join(str(raw or "").split())
    if not name:
        return None
    if len(name) > WEBHOOK_NAME_MAX:
        name = name[:WEBHOOK_NAME_MAX].rstrip()
    return name or None


def default_webhook_name(database, server_id):
    existing = {
        row.name for row in database.query(Server_webhooks.name).filter(
            Server_webhooks.server_id == server_id
        ).all()
    }
    if WEBHOOK_DEFAULT_NAME not in existing:
        return WEBHOOK_DEFAULT_NAME
    n = 2
    while f"{WEBHOOK_DEFAULT_NAME} {n}" in existing:
        n += 1
        if n > 9999:
            return WEBHOOK_DEFAULT_NAME
    return f"{WEBHOOK_DEFAULT_NAME} {n}"


def require_webhook_manager(database, server, user_id, channel_id=None):
    if channel_id is not None:
        perms = effective_perms_for_user_in_channel(database, server, user_id, channel_id)
    else:
        perms = effective_perms_for_user(database, server, user_id)
    if perms.get("update_server") or perms.get("manage_webhooks"):
        return perms
    raise HTTPException(status_code=403, detail="You do not have permission to manage webhooks.")


def load_staff_webhook(database, webhook_id, user_id):
    hook = database.query(Server_webhooks).filter(Server_webhooks.id == webhook_id).first()
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found.")
    server = require_server_member(database, hook.server_id, user_id)
    require_webhook_manager(database, server, user_id, hook.channel_id)
    return hook, server


def load_public_webhook(database, webhook_id, token):
    hook = database.query(Server_webhooks).filter(Server_webhooks.id == webhook_id).first()
    if not hook or not hook.token or not secrets.compare_digest(str(hook.token), str(token or "")):
        raise HTTPException(status_code=404, detail="Unknown Webhook.")
    return hook


def load_text_channel(database, server, channel_id):
    channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
    owner = server_for_channel(database, channel)
    if not channel or not owner or owner.id != server.id:
        raise HTTPException(status_code=404, detail="Channel not found.")
    if not webhook_channel_ok(channel):
        raise HTTPException(status_code=400, detail="Webhooks can only post in text channels.")
    return channel


def serialize_webhook(database, hook):
    channel = database.query(Server_channels).filter(Server_channels.id == hook.channel_id).first()
    creator = database.query(UserInfo).filter(UserInfo.id == hook.creator_id).first() if hook.creator_id else None
    return {
        "id": hook.id,
        "server_id": hook.server_id,
        "channel_id": hook.channel_id,
        "channel_name": channel.name if channel else "deleted-channel",
        "name": hook.name or WEBHOOK_DEFAULT_NAME,
        "token": hook.token,
        "url": f"/webhooks/{hook.id}/{hook.token}",
        "created_at": hook.created_at.isoformat() + "Z" if hook.created_at else None,
        "creator_id": hook.creator_id,
        "creator_name": creator.username if creator else "",
    }


async def read_webhook_body(request: Request):
    ctype = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if ctype == "application/json":
        try:
            body = await request.json()
        except Exception:
            return "", None
        if not isinstance(body, dict):
            return "", None
        content = body.get("content")
        username = body.get("username")
        return str(content or ""), (str(username) if username else None)
    try:
        form = await request.form()
    except Exception:
        return "", None
    content = form.get("content")
    username = form.get("username")
    return str(content or ""), (str(username) if username else None)


def clip_webhook_content(raw):
    text = str(raw or "").replace("\x00", "")
    if len(text) > WEBHOOK_CONTENT_MAX:
        text = text[:WEBHOOK_CONTENT_MAX]
    return text.strip()


async def post_webhook_message(database, hook, content, username=None):
    channel = database.query(Server_channels).filter(Server_channels.id == hook.channel_id).first()
    server = server_for_channel(database, channel)
    if not channel or not server or server.id != hook.server_id:
        raise HTTPException(status_code=404, detail="Unknown Webhook.")
    if not webhook_channel_ok(channel):
        raise HTTPException(status_code=400, detail="Webhooks can only post in text channels.")
    body = clip_webhook_content(content)
    if not body:
        raise HTTPException(status_code=400, detail="Cannot send an empty message.")
    display = clean_webhook_name(username) or hook.name or WEBHOOK_DEFAULT_NAME
    message = Channel_messages(
        sender_id=None,
        channel_id=channel.id,
        content=body,
        webhook_id=hook.id,
        webhook_name=display,
    )
    database.add(message)
    database.flush()
    member_ids = [row.user_id for row in database.query(Server_members).filter(Server_members.server_id == server.id).all()]
    seed_channel_unread(database, channel.id, member_ids, None, message.timestamp)
    database.commit()
    database.refresh(message)
    await server_broadcast(server_id=server.id, payload={
        "type": "channel_message",
        "id": message.id,
        "server_id": server.id,
        "channel_id": channel.id,
        "sender_id": None,
        "username": display,
        "nickname": "",
        "content": message.content,
        "attachment": None,
        "timestamp": str(message.timestamp),
        "mentioned": False,
        "mention_users": {},
        "mention_roles": {},
        "reply_to": None,
        "avatar": None,
        "name_role": None,
        "is_webhook": True,
        "webhook_id": hook.id,
        "webhook_name": display,
    }, database=database)
    return message


@router.get("/server_webhooks/{server_id}")
def list_server_webhooks(server_id: str, channel_id: Optional[int] = None, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, server_id, current_user.id)
    require_webhook_manager(database, server, current_user.id, channel_id)
    query = database.query(Server_webhooks).filter(Server_webhooks.server_id == server_id)
    if channel_id is not None:
        query = query.filter(Server_webhooks.channel_id == channel_id)
    rows = query.order_by(Server_webhooks.id.desc()).all()
    return {"webhooks": [serialize_webhook(database, row) for row in rows]}


@router.post("/create_server_webhook")
def create_server_webhook(body: Webhook_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, body.server_id, current_user.id)
    require_webhook_manager(database, server, current_user.id, body.channel_id)
    channel = load_text_channel(database, server, body.channel_id)
    count = database.query(Server_webhooks.id).filter(
        Server_webhooks.server_id == server.id,
        Server_webhooks.channel_id == channel.id,
    ).count()
    if count >= WEBHOOK_CAP:
        raise HTTPException(status_code=400, detail="This channel already has the maximum number of webhooks.")
    name = clean_webhook_name(body.name) or default_webhook_name(database, server.id)
    hook = Server_webhooks(
        server_id=server.id,
        channel_id=channel.id,
        creator_id=current_user.id,
        name=name,
        token=secrets.token_urlsafe(32),
    )
    database.add(hook)
    database.flush()
    write_audit_log(database, server.id, current_user.id, "create_webhook", "webhook", hook.id, {
        "name": hook.name,
        "channel": channel.name,
    })
    database.commit()
    database.refresh(hook)
    return serialize_webhook(database, hook)


@router.post("/update_server_webhook")
def update_server_webhook(body: Webhook_update, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    hook, server = load_staff_webhook(database, body.webhook_id, current_user.id)
    channel = database.query(Server_channels).filter(Server_channels.id == hook.channel_id).first()
    if body.name is not None:
        name = clean_webhook_name(body.name)
        if not name:
            raise HTTPException(status_code=400, detail="Webhook name is required.")
        hook.name = name
    if body.channel_id is not None and body.channel_id != hook.channel_id:
        require_webhook_manager(database, server, current_user.id, body.channel_id)
        channel = load_text_channel(database, server, body.channel_id)
        count = database.query(Server_webhooks.id).filter(
            Server_webhooks.server_id == server.id,
            Server_webhooks.channel_id == channel.id,
            Server_webhooks.id != hook.id,
        ).count()
        if count >= WEBHOOK_CAP:
            raise HTTPException(status_code=400, detail="This channel already has the maximum number of webhooks.")
        hook.channel_id = channel.id
    write_audit_log(database, server.id, current_user.id, "update_webhook", "webhook", hook.id, {
        "name": hook.name,
        "channel": channel.name if channel else "",
    })
    database.commit()
    database.refresh(hook)
    return serialize_webhook(database, hook)


@router.post("/delete_server_webhook")
def delete_server_webhook(body: Webhook_delete, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    hook, server = load_staff_webhook(database, body.webhook_id, current_user.id)
    channel = database.query(Server_channels).filter(Server_channels.id == hook.channel_id).first()
    write_audit_log(database, server.id, current_user.id, "delete_webhook", "webhook", hook.id, {
        "name": hook.name,
        "channel": channel.name if channel else "",
    })
    database.delete(hook)
    database.commit()
    return {"ok": True}


@router.post("/server_webhook_test")
async def server_webhook_test(body: Webhook_test, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    hook, _server = load_staff_webhook(database, body.webhook_id, current_user.id)
    name = hook.name or WEBHOOK_DEFAULT_NAME
    message = await post_webhook_message(database, hook, f"This is a test message from {name}.")
    return {"ok": True, "message_id": message.id, "channel_id": hook.channel_id}


@router.get("/webhooks/{webhook_id}/{token}")
def get_public_webhook(webhook_id: int, token: str, database: Session = Depends(get_db)):
    hook = load_public_webhook(database, webhook_id, token)
    return {
        "id": hook.id,
        "name": hook.name or WEBHOOK_DEFAULT_NAME,
        "channel_id": hook.channel_id,
        "server_id": hook.server_id,
        "token": hook.token,
    }


@router.post("/webhooks/{webhook_id}/{token}")
async def execute_webhook(webhook_id: int, token: str, request: Request, database: Session = Depends(get_db)):
    hook = load_public_webhook(database, webhook_id, token)
    content, username = await read_webhook_body(request)
    await post_webhook_message(database, hook, content, username)
    return Response(status_code=204)
