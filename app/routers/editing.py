from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import UserInfo, Message, Party_messages, Party_members, Channel_messages, Forum_messages, Forum_post, Servers, Server_members, Server_categories, Server_channels
from app.schemas import Delete_message, Edit_message
from app.database import get_db
from app.auth import get_current_user
from app.r2 import attachment_public, delete_attachment, store_attachment
from app.routers.deletion import delete_message, notify_party, notify_user
from app.routers.realtime import server_broadcast
from app.routers.mentions import apply_channel_mentions, apply_party_mentions, apply_server_text_mentions, mention_user_map, mention_role_map, message_mentioned

router = APIRouter()

def file_key(value):
    if value is None:
        return None
    if hasattr(value, "key"):
        return value.key
    data = value if isinstance(value, dict) else attachment_public(value)
    if isinstance(data, dict):
        return data.get("key")
    return None

def apply_edit(row, content, new_attachment, current_user):
    old_key = file_key(row.attachment)
    new_key = file_key(new_attachment)
    same_text = (row.content or "") == content
    if same_text and old_key == new_key:
        return False

    if old_key != new_key:
        if old_key:
            delete_attachment(row.attachment)
        row.attachment = store_attachment(new_attachment, current_user) if new_attachment else None

    row.content = content
    row.edited = True
    return True

@router.post("/edit_message")
async def edit_message(edit: Edit_message, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    content = (edit.content or "").strip()

    if not content and edit.attachment is None:
        return await delete_message(Delete_message(kind= edit.kind, message_id= edit.message_id), database= database, current_user= current_user)

    if edit.kind == "dm":
        msg = database.query(Message).filter(Message.id == edit.message_id).first()
        if not msg or (current_user.id != msg.sender_id and current_user.id != msg.receiver_id):
            raise HTTPException(status_code=404, detail="No message found")
        if msg.sender_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to edit message")
        if msg.deletion_state == "pending" or msg.deletion_state == "deleted":
            raise HTTPException(status_code=400, detail="Cannot edit a deleted message")
        changed = apply_edit(msg, content, edit.attachment, current_user)
        database.commit()
        if changed:
            payload = {
                "type": "message_edited",
                "kind": "dm",
                "message_id": msg.id,
                "sender_id": msg.sender_id,
                "receiver_id": msg.receiver_id,
                "content": msg.content,
                "attachment": attachment_public(msg.attachment),
                "edited": True
            }
            other_id = msg.receiver_id if current_user.id == msg.sender_id else msg.sender_id
            await notify_user(other_id, payload)
        return {"id": msg.id, "content": msg.content, "attachment": attachment_public(msg.attachment), "edited": bool(msg.edited), "unchanged": not changed}

    if edit.kind == "party":
        msg = database.query(Party_messages).filter(Party_messages.id == edit.message_id).first()
        if not msg:
            raise HTTPException(status_code=404, detail="No message found")
        in_party = database.query(Party_members).filter(Party_members.party_id == msg.party_id, Party_members.user_id == current_user.id).first()
        if not in_party:
            raise HTTPException(status_code=404, detail="No message found")
        if msg.sender_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to edit message")
        if msg.deletion_state == "pending" or msg.deletion_state == "deleted":
            raise HTTPException(status_code=400, detail="Cannot edit a deleted message")
        changed = apply_edit(msg, content, edit.attachment, current_user)
        if changed:
            member_ids = [row.user_id for row in database.query(Party_members).filter(Party_members.party_id == msg.party_id).all()]
            apply_party_mentions(database, msg, member_ids)
        database.commit()
        if changed:
            payload = {
                "type": "message_edited",
                "kind": "party",
                "message_id": msg.id,
                "party_id": msg.party_id,
                "content": msg.content,
                "attachment": attachment_public(msg.attachment),
                "edited": True,
                "mention_users": mention_user_map(database, msg.content)
            }
            await notify_party(msg.party_id, payload, database, exclude_user_id= current_user.id)
        return {"id": msg.id, "content": msg.content, "attachment": attachment_public(msg.attachment), "edited": bool(msg.edited), "unchanged": not changed, "mentioned": message_mentioned(database, "party", msg.id, current_user.id), "mention_users": mention_user_map(database, msg.content)}

    if edit.kind == "channel":
        msg = database.query(Channel_messages).filter(Channel_messages.id == edit.message_id).first()
        if not msg:
            raise HTTPException(status_code=404, detail="No message found")
        channel = database.query(Server_channels).filter(Server_channels.id == msg.channel_id).first()
        category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
        server = database.query(Servers).filter(Servers.id == category.server_id).first()
        is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()
        if not is_member:
            raise HTTPException(status_code=404, detail="No message found")
        if msg.sender_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to edit message")
        if file_key(msg.attachment) != file_key(edit.attachment) and file_key(edit.attachment):
            from app.routers.roles import require_server_perm
            require_server_perm(database, server, current_user.id, "upload_chat_media", "You do not have permission to upload media.")
        changed = apply_edit(msg, content, edit.attachment, current_user)
        if changed:
            member_ids = [row.user_id for row in database.query(Server_members).filter(Server_members.server_id == server.id).all()]
            apply_channel_mentions(database, msg, server, member_ids)
        database.commit()
        if changed:
            payload = {
                "type": "message_edited",
                "kind": "channel",
                "message_id": msg.id,
                "channel_id": msg.channel_id,
                "content": msg.content,
                "attachment": attachment_public(msg.attachment),
                "edited": True,
                "mention_users": mention_user_map(database, msg.content),
                "mention_roles": mention_role_map(database, msg.content)
            }
            await server_broadcast(server_id= server.id, payload= payload, database= database, exclude_user_id= current_user.id)
        return {"id": msg.id, "content": msg.content, "attachment": attachment_public(msg.attachment), "edited": bool(msg.edited), "unchanged": not changed, "mentioned": message_mentioned(database, "channel", msg.id, current_user.id), "mention_users": mention_user_map(database, msg.content), "mention_roles": mention_role_map(database, msg.content)}

    if edit.kind == "forum":
        msg = database.query(Forum_messages).filter(Forum_messages.id == edit.message_id).first()
        if not msg:
            raise HTTPException(status_code=404, detail="No message found")
        post = database.query(Forum_post).filter(Forum_post.id == msg.post_id).first()
        channel = database.query(Server_channels).filter(Server_channels.id == post.channel_id).first()
        category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
        server = database.query(Servers).filter(Servers.id == category.server_id).first()
        is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()
        if not is_member:
            raise HTTPException(status_code=404, detail="No message found")
        if msg.author_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to edit message")
        if getattr(post, "locked", False):
            raise HTTPException(status_code=403, detail="This topic is locked.")
        changed = apply_edit(msg, content, edit.attachment, current_user)
        if changed:
            msg.content = apply_server_text_mentions(database, msg.content, "forum", msg.id, server, post.channel_id)
        database.commit()
        if changed:
            payload = {
                "type": "message_edited",
                "kind": "forum",
                "message_id": msg.id,
                "post_id": msg.post_id,
                "channel_id": post.channel_id,
                "content": msg.content,
                "attachment": attachment_public(msg.attachment),
                "edited": True,
                "mention_users": mention_user_map(database, msg.content),
                "mention_roles": mention_role_map(database, msg.content)
            }
            await server_broadcast(server_id= server.id, payload= payload, database= database, exclude_user_id= current_user.id)
        return {"id": msg.id, "content": msg.content, "attachment": attachment_public(msg.attachment), "edited": bool(msg.edited), "unchanged": not changed, "mentioned": message_mentioned(database, "forum", msg.id, current_user.id), "mention_users": mention_user_map(database, msg.content), "mention_roles": mention_role_map(database, msg.content)}

    raise HTTPException(status_code=400, detail="This message type cannot be edited yet")
