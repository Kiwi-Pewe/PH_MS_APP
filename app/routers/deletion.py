from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import UserInfo, Message, Party_messages, Party_members, Channel_messages, Forum_messages, Forum_post, Servers, Server_members, Server_categories, Server_channels, Audit_log
from app.schemas import Delete_message
from app.database import get_db, SessionLocal
from app.auth import get_current_user
from app.r2 import delete_attachment
from app.routers.realtime import active_connections, server_broadcast
from app.routers.mentions import clear_mentions
from datetime import datetime, timedelta
import json
import asyncio

router = APIRouter()

DELETION_WINDOW = timedelta(hours=24)

def write_audit_log(database, server_id, actor_id, action, target_type, target_id, detail):
    row = Audit_log(
        server_id = server_id,
        actor_id = actor_id,
        action = action,
        target_type = target_type,
        target_id = target_id,
        detail = json.dumps(detail) if detail is not None else None,
    )
    database.add(row)

def pending_is_expired(row):
    if row.deletion_state != "pending" or not row.deletion_requested_at:
        return False
    return datetime.utcnow() - row.deletion_requested_at >= DELETION_WINDOW

def finalize_soft_delete(database, row):
    from app.routers.reactions import clear_reactions
    kind = "party" if hasattr(row, "party_id") else "dm"
    clear_reactions(database, kind, row.id)
    if kind == "party":
        clear_mentions(database, "party", row.id)
    delete_attachment(row.attachment)
    row.content = ""
    row.attachment = None
    row.deletion_state = "deleted"

def refresh_pending_messages(database, rows):
    changed = False
    for row in rows:
        if pending_is_expired(row):
            finalize_soft_delete(database, row)
            changed = True
    if changed:
        database.commit()

def deletion_fields(row, public_attachment):
    requested = str(row.deletion_requested_at) if row.deletion_requested_at else None
    if row.deletion_state == "deleted":
        return {"content": "", "attachment": None, "deletion_state": "deleted", "deletion_requested_at": requested, "edited": bool(row.edited)}
    return {
        "content": row.content,
        "attachment": public_attachment,
        "deletion_state": row.deletion_state,
        "deletion_requested_at": requested,
        "edited": bool(row.edited),
    }

async def notify_user(user_id, payload):
    if user_id in active_connections:
        await active_connections[user_id].send_json(payload)

async def notify_party(party_id, payload, database, exclude_user_id=None):
    all_members = database.query(Party_members).filter(Party_members.party_id == party_id).all()
    for member in all_members:
        if member.user_id != exclude_user_id:
            await notify_user(member.user_id, payload)

def author_name(database, user_id):
    if user_id == None:
        return None
    account = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    return account.username if account else None

@router.post("/delete_message")
async def delete_message(target: Delete_message, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    if target.kind == "dm":
        msg = database.query(Message).filter(Message.id == target.message_id).first()
        if not msg or (current_user.id != msg.sender_id and current_user.id != msg.receiver_id):
            raise HTTPException(status_code=404, detail="No message found")
        if msg.sender_id == None or current_user.id != msg.sender_id:
            raise HTTPException(status_code=403, detail="Not authorized to delete message")
        if msg.deletion_state == "deleted":
            raise HTTPException(status_code=400, detail="Message already deleted")
        if pending_is_expired(msg):
            finalize_soft_delete(database, msg)
            database.commit()
            raise HTTPException(status_code=400, detail="Message already deleted")
        if msg.deletion_state != "pending":
            msg.deletion_state = "pending"
            msg.deletion_requested_at = datetime.utcnow()
            database.commit()
        payload = {
            "type": "message_pending_delete",
            "kind": "dm",
            "message_id": msg.id,
            "sender_id": msg.sender_id,
            "receiver_id": msg.receiver_id,
            "deletion_requested_at": str(msg.deletion_requested_at)
        }
        other_id = msg.receiver_id if current_user.id == msg.sender_id else msg.sender_id
        await notify_user(other_id, payload)
        return {"id": msg.id, "deletion_state": "pending", "deletion_requested_at": str(msg.deletion_requested_at)}

    if target.kind == "party":
        msg = database.query(Party_messages).filter(Party_messages.id == target.message_id).first()
        if not msg:
            raise HTTPException(status_code=404, detail="No message found")
        in_party = database.query(Party_members).filter(Party_members.party_id == msg.party_id, Party_members.user_id == current_user.id).first()
        if not in_party:
            raise HTTPException(status_code=404, detail="No message found")
        if msg.sender_id == None or current_user.id != msg.sender_id:
            raise HTTPException(status_code=403, detail="Not authorized to delete message")
        if msg.deletion_state == "deleted":
            raise HTTPException(status_code=400, detail="Message already deleted")
        if pending_is_expired(msg):
            finalize_soft_delete(database, msg)
            database.commit()
            raise HTTPException(status_code=400, detail="Message already deleted")
        if msg.deletion_state != "pending":
            msg.deletion_state = "pending"
            msg.deletion_requested_at = datetime.utcnow()
            database.commit()
        payload = {
            "type": "message_pending_delete",
            "kind": "party",
            "message_id": msg.id,
            "party_id": msg.party_id,
            "deletion_requested_at": str(msg.deletion_requested_at)
        }
        await notify_party(msg.party_id, payload, database, exclude_user_id= current_user.id)
        return {"id": msg.id, "deletion_state": "pending", "deletion_requested_at": str(msg.deletion_requested_at)}

    if target.kind == "channel":
        msg = database.query(Channel_messages).filter(Channel_messages.id == target.message_id).first()
        if not msg:
            raise HTTPException(status_code=404, detail="No message found")
        channel = database.query(Server_channels).filter(Server_channels.id == msg.channel_id).first()
        category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
        server = database.query(Servers).filter(Servers.id == category.server_id).first()
        is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()
        if not is_member:
            raise HTTPException(status_code=404, detail="No message found")
        if msg.sender_id == None:
            raise HTTPException(status_code=403, detail="Not authorized to delete message")
        from app.routers.roles import effective_perms_for_user
        if current_user.id != msg.sender_id and not effective_perms_for_user(database, server, current_user.id).get("manage_messages"):
            raise HTTPException(status_code=403, detail="You do not have permission to delete this message.")

        write_audit_log(database, server.id, current_user.id, "delete_message", "channel_message", msg.id, {
            "content": msg.content,
            "author_id": msg.sender_id,
            "author_username": author_name(database, msg.sender_id),
            "channel_id": msg.channel_id
        })
        from app.routers.reactions import clear_reactions
        clear_reactions(database, "channel", msg.id)
        clear_mentions(database, "channel", msg.id)
        delete_attachment(msg.attachment)
        channel_id = msg.channel_id
        message_id = msg.id
        database.delete(msg)
        database.commit()
        payload = {
            "type": "message_deleted",
            "kind": "channel",
            "message_id": message_id,
            "channel_id": channel_id,
            "tombstone": False
        }
        await server_broadcast(server_id= server.id, payload= payload, database= database, exclude_user_id= current_user.id)
        return {"id": message_id, "deleted": True}

    if target.kind == "forum":
        msg = database.query(Forum_messages).filter(Forum_messages.id == target.message_id).first()
        if not msg:
            raise HTTPException(status_code=404, detail="No message found")
        post = database.query(Forum_post).filter(Forum_post.id == msg.post_id).first()
        channel = database.query(Server_channels).filter(Server_channels.id == post.channel_id).first()
        category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
        server = database.query(Servers).filter(Servers.id == category.server_id).first()
        is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()
        if not is_member:
            raise HTTPException(status_code=404, detail="No message found")
        if msg.author_id == None or (current_user.id != msg.author_id and current_user.id != server.owner_id):
            raise HTTPException(status_code=403, detail="Not authorized to delete message")

        write_audit_log(database, server.id, current_user.id, "delete_message", "forum_message", msg.id, {
            "content": msg.content,
            "author_id": msg.author_id,
            "author_username": author_name(database, msg.author_id),
            "post_id": msg.post_id,
            "channel_id": channel.id
        })
        from app.routers.reactions import clear_reactions
        clear_reactions(database, "forum", msg.id)
        clear_mentions(database, "forum", msg.id)
        delete_attachment(msg.attachment)
        post_id = msg.post_id
        message_id = msg.id
        database.delete(msg)
        post.message_count = max(0, (post.message_count or 0) - 1)
        database.commit()
        payload = {
            "type": "message_deleted",
            "kind": "forum",
            "message_id": message_id,
            "post_id": post_id,
            "channel_id": channel.id,
            "tombstone": False
        }
        await server_broadcast(server_id= server.id, payload= payload, database= database, exclude_user_id= current_user.id)
        await server_broadcast(server_id= server.id, payload= {
            "type": "forum_post_updated",
            "channel_id": post.channel_id,
            "post_id": post.id,
            "message_count": post.message_count,
            "last_activity": str(post.last_activity_at)
        }, database= database)
        return {"id": message_id, "deleted": True}

    raise HTTPException(status_code=400, detail="Unknown message kind")

@router.post("/reinstate_message")
async def reinstate_message(target: Delete_message, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    if target.kind == "dm":
        msg = database.query(Message).filter(Message.id == target.message_id).first()
        if not msg or (current_user.id != msg.sender_id and current_user.id != msg.receiver_id):
            raise HTTPException(status_code=404, detail="No message found")
        if current_user.id != msg.sender_id:
            raise HTTPException(status_code=403, detail="Not authorized to reinstate message")
        if pending_is_expired(msg):
            finalize_soft_delete(database, msg)
            database.commit()
            raise HTTPException(status_code=400, detail="Message already deleted")
        if msg.deletion_state != "pending":
            raise HTTPException(status_code=400, detail="Message is not pending deletion")
        msg.deletion_state = None
        msg.deletion_requested_at = None
        database.commit()
        payload = {
            "type": "message_reinstated",
            "kind": "dm",
            "message_id": msg.id,
            "sender_id": msg.sender_id,
            "receiver_id": msg.receiver_id
        }
        other_id = msg.receiver_id if current_user.id == msg.sender_id else msg.sender_id
        await notify_user(other_id, payload)
        return {"id": msg.id, "deletion_state": None}

    if target.kind == "party":
        msg = database.query(Party_messages).filter(Party_messages.id == target.message_id).first()
        if not msg:
            raise HTTPException(status_code=404, detail="No message found")
        in_party = database.query(Party_members).filter(Party_members.party_id == msg.party_id, Party_members.user_id == current_user.id).first()
        if not in_party:
            raise HTTPException(status_code=404, detail="No message found")
        if current_user.id != msg.sender_id:
            raise HTTPException(status_code=403, detail="Not authorized to reinstate message")
        if pending_is_expired(msg):
            finalize_soft_delete(database, msg)
            database.commit()
            raise HTTPException(status_code=400, detail="Message already deleted")
        if msg.deletion_state != "pending":
            raise HTTPException(status_code=400, detail="Message is not pending deletion")
        msg.deletion_state = None
        msg.deletion_requested_at = None
        database.commit()
        payload = {
            "type": "message_reinstated",
            "kind": "party",
            "message_id": msg.id,
            "party_id": msg.party_id
        }
        await notify_party(msg.party_id, payload, database, exclude_user_id= current_user.id)
        return {"id": msg.id, "deletion_state": None}

    raise HTTPException(status_code=400, detail="Only DM and party messages can be reinstated")

async def sweep_pending_deletes():
    while True:
        await asyncio.sleep(1800)
        database = SessionLocal()
        cutoff = datetime.utcnow() - DELETION_WINDOW
        dm_rows = database.query(Message).filter(Message.deletion_state == "pending", Message.deletion_requested_at != None, Message.deletion_requested_at <= cutoff).all()
        party_rows = database.query(Party_messages).filter(Party_messages.deletion_state == "pending", Party_messages.deletion_requested_at != None, Party_messages.deletion_requested_at <= cutoff).all()

        for row in dm_rows:
            finalize_soft_delete(database, row)
        for row in party_rows:
            finalize_soft_delete(database, row)
        database.commit()

        for row in dm_rows:
            payload = {
                "type": "message_deleted",
                "kind": "dm",
                "message_id": row.id,
                "sender_id": row.sender_id,
                "receiver_id": row.receiver_id,
                "tombstone": True
            }
            await notify_user(row.sender_id, payload)
            await notify_user(row.receiver_id, payload)
        for row in party_rows:
            payload = {
                "type": "message_deleted",
                "kind": "party",
                "message_id": row.id,
                "party_id": row.party_id,
                "tombstone": True
            }
            await notify_party(row.party_id, payload, database)

        database.close()
