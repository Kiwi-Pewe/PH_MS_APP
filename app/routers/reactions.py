from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import UserInfo, Message, Party_messages, Party_members, Channel_messages, Message_reaction, Announcement_post, Announcement_comment, Forum_post, Forum_messages, Servers, Server_members, Server_categories, Server_channels
from app.schemas import React_message
from app.database import get_db
from app.auth import get_current_user
from app.routers.deletion import notify_party, notify_user
from app.routers.realtime import server_broadcast

router = APIRouter()

def clear_reactions(database, kind, message_id):
    database.query(Message_reaction).filter(Message_reaction.kind == kind, Message_reaction.message_id == message_id).delete()

def summarize_reactions(rows, current_user_id):
    grouped = {}
    for row in rows:
        if row.emoji not in grouped:
            grouped[row.emoji] = {"emoji": row.emoji, "count": 0, "user_ids": []}
        grouped[row.emoji]["count"] += 1
        grouped[row.emoji]["user_ids"].append(row.user_id)
    out = list(grouped.values())
    for item in out:
        item["me"] = current_user_id in item["user_ids"]
    return out

def reactions_for_messages(database, kind, message_ids, current_user_id):
    if not message_ids:
        return {}
    rows = database.query(Message_reaction).filter(Message_reaction.kind == kind, Message_reaction.message_id.in_(message_ids)).all()
    by_msg = {}
    for row in rows:
        by_msg.setdefault(row.message_id, []).append(row)
    return { message_id: summarize_reactions(by_msg.get(message_id, []), current_user_id) for message_id in message_ids }

def reactions_for_one(database, kind, message_id, current_user_id):
    return reactions_for_messages(database, kind, [message_id], current_user_id).get(message_id, [])

@router.post("/react_message")
async def react_message(target: React_message, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    emoji = (target.emoji or "").strip()
    if not emoji or len(emoji) > 16:
        raise HTTPException(status_code=400, detail="Invalid reaction")

    if target.kind == "dm":
        msg = database.query(Message).filter(Message.id == target.message_id).first()
        if not msg or (current_user.id != msg.sender_id and current_user.id != msg.receiver_id):
            raise HTTPException(status_code=404, detail="No message found")
        if msg.deletion_state == "pending" or msg.deletion_state == "deleted":
            raise HTTPException(status_code=400, detail="Cannot react to this message")
        existing = database.query(Message_reaction).filter(Message_reaction.kind == "dm", Message_reaction.message_id == msg.id, Message_reaction.user_id == current_user.id, Message_reaction.emoji == emoji).first()
        if existing:
            database.delete(existing)
        else:
            database.add(Message_reaction(kind= "dm", message_id= msg.id, user_id= current_user.id, emoji= emoji))
        database.commit()
        reactions = reactions_for_one(database, "dm", msg.id, current_user.id)
        payload = {
            "type": "message_reacted",
            "kind": "dm",
            "message_id": msg.id,
            "sender_id": msg.sender_id,
            "receiver_id": msg.receiver_id,
            "reactions": reactions_for_one(database, "dm", msg.id, None)
        }
        other_id = msg.receiver_id if current_user.id == msg.sender_id else msg.sender_id
        await notify_user(other_id, payload)
        return {"id": msg.id, "reactions": reactions}

    if target.kind == "party":
        msg = database.query(Party_messages).filter(Party_messages.id == target.message_id).first()
        if not msg:
            raise HTTPException(status_code=404, detail="No message found")
        in_party = database.query(Party_members).filter(Party_members.party_id == msg.party_id, Party_members.user_id == current_user.id).first()
        if not in_party:
            raise HTTPException(status_code=404, detail="No message found")
        if msg.deletion_state == "pending" or msg.deletion_state == "deleted":
            raise HTTPException(status_code=400, detail="Cannot react to this message")
        existing = database.query(Message_reaction).filter(Message_reaction.kind == "party", Message_reaction.message_id == msg.id, Message_reaction.user_id == current_user.id, Message_reaction.emoji == emoji).first()
        if existing:
            database.delete(existing)
        else:
            database.add(Message_reaction(kind= "party", message_id= msg.id, user_id= current_user.id, emoji= emoji))
        database.commit()
        reactions = reactions_for_one(database, "party", msg.id, current_user.id)
        await notify_party(msg.party_id, {
            "type": "message_reacted",
            "kind": "party",
            "message_id": msg.id,
            "party_id": msg.party_id,
            "reactions": reactions_for_one(database, "party", msg.id, None)
        }, database, exclude_user_id= current_user.id)
        return {"id": msg.id, "reactions": reactions}

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
        from app.routers.moderation import require_not_timed_out
        require_not_timed_out(is_member)
        existing = database.query(Message_reaction).filter(Message_reaction.kind == "channel", Message_reaction.message_id == msg.id, Message_reaction.user_id == current_user.id, Message_reaction.emoji == emoji).first()
        if existing:
            database.delete(existing)
        else:
            database.add(Message_reaction(kind= "channel", message_id= msg.id, user_id= current_user.id, emoji= emoji))
        database.commit()
        reactions = reactions_for_one(database, "channel", msg.id, current_user.id)
        await server_broadcast(server_id= server.id, payload= {
            "type": "message_reacted",
            "kind": "channel",
            "message_id": msg.id,
            "channel_id": msg.channel_id,
            "reactions": reactions_for_one(database, "channel", msg.id, None)
        }, database= database, exclude_user_id= current_user.id)
        return {"id": msg.id, "reactions": reactions}

    if target.kind == "forum":
        msg = database.query(Forum_messages).filter(Forum_messages.id == target.message_id).first()
        if not msg:
            raise HTTPException(status_code=404, detail="No message found")
        post = database.query(Forum_post).filter(Forum_post.id == msg.post_id).first()
        if not post:
            raise HTTPException(status_code=404, detail="No message found")
        channel = database.query(Server_channels).filter(Server_channels.id == post.channel_id).first()
        category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
        server = database.query(Servers).filter(Servers.id == category.server_id).first()
        is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()
        if not is_member:
            raise HTTPException(status_code=404, detail="No message found")
        from app.routers.moderation import require_not_timed_out
        require_not_timed_out(is_member)
        existing = database.query(Message_reaction).filter(Message_reaction.kind == "forum", Message_reaction.message_id == msg.id, Message_reaction.user_id == current_user.id, Message_reaction.emoji == emoji).first()
        if existing:
            database.delete(existing)
        else:
            database.add(Message_reaction(kind= "forum", message_id= msg.id, user_id= current_user.id, emoji= emoji))
        database.commit()
        reactions = reactions_for_one(database, "forum", msg.id, current_user.id)
        await server_broadcast(server_id= server.id, payload= {
            "type": "message_reacted",
            "kind": "forum",
            "message_id": msg.id,
            "post_id": msg.post_id,
            "channel_id": post.channel_id,
            "reactions": reactions_for_one(database, "forum", msg.id, None)
        }, database= database, exclude_user_id= current_user.id)
        return {"id": msg.id, "reactions": reactions}

    if target.kind == "announcement":
        post = database.query(Announcement_post).filter(Announcement_post.id == target.message_id).first()
        if not post:
            raise HTTPException(status_code=404, detail="No message found")
        channel = database.query(Server_channels).filter(Server_channels.id == post.channel_id).first()
        category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
        server = database.query(Servers).filter(Servers.id == category.server_id).first()
        is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()
        if not is_member:
            raise HTTPException(status_code=404, detail="No message found")
        from app.routers.roles import require_server_perm
        require_server_perm(database, server, current_user.id, "view_announcements", "You do not have permission to view announcements.")
        from app.routers.moderation import require_not_timed_out
        require_not_timed_out(is_member)
        existing = database.query(Message_reaction).filter(Message_reaction.kind == "announcement", Message_reaction.message_id == post.id, Message_reaction.user_id == current_user.id, Message_reaction.emoji == emoji).first()
        if existing:
            database.delete(existing)
        else:
            database.add(Message_reaction(kind= "announcement", message_id= post.id, user_id= current_user.id, emoji= emoji))
        database.commit()
        reactions = reactions_for_one(database, "announcement", post.id, current_user.id)
        await server_broadcast(server_id= server.id, payload= {
            "type": "announcement_reacted",
            "kind": "announcement",
            "post_id": post.id,
            "channel_id": post.channel_id,
            "reactions": reactions_for_one(database, "announcement", post.id, None)
        }, database= database, exclude_user_id= current_user.id)
        return {"id": post.id, "reactions": reactions}

    if target.kind == "forum_post":
        post = database.query(Forum_post).filter(Forum_post.id == target.message_id).first()
        if not post:
            raise HTTPException(status_code=404, detail="No message found")
        channel = database.query(Server_channels).filter(Server_channels.id == post.channel_id).first()
        category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
        server = database.query(Servers).filter(Servers.id == category.server_id).first()
        is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()
        if not is_member:
            raise HTTPException(status_code=404, detail="No message found")
        from app.routers.moderation import require_not_timed_out
        require_not_timed_out(is_member)
        existing = database.query(Message_reaction).filter(Message_reaction.kind == "forum_post", Message_reaction.message_id == post.id, Message_reaction.user_id == current_user.id, Message_reaction.emoji == emoji).first()
        if existing:
            database.delete(existing)
        else:
            database.add(Message_reaction(kind= "forum_post", message_id= post.id, user_id= current_user.id, emoji= emoji))
        database.commit()
        reactions = reactions_for_one(database, "forum_post", post.id, current_user.id)
        await server_broadcast(server_id= server.id, payload= {
            "type": "forum_post_reacted",
            "kind": "forum_post",
            "post_id": post.id,
            "channel_id": post.channel_id,
            "reactions": reactions_for_one(database, "forum_post", post.id, None)
        }, database= database, exclude_user_id= current_user.id)
        return {"id": post.id, "reactions": reactions}

    if target.kind == "comment":
        comment = database.query(Announcement_comment).filter(Announcement_comment.id == target.message_id).first()
        if not comment:
            raise HTTPException(status_code=404, detail="No message found")
        post = database.query(Announcement_post).filter(Announcement_post.id == comment.post_id).first()
        if not post:
            raise HTTPException(status_code=404, detail="No message found")
        channel = database.query(Server_channels).filter(Server_channels.id == post.channel_id).first()
        category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
        server = database.query(Servers).filter(Servers.id == category.server_id).first()
        is_member = database.query(Server_members).filter(Server_members.server_id == server.id, Server_members.user_id == current_user.id).first()
        if not is_member:
            raise HTTPException(status_code=404, detail="No message found")
        from app.routers.roles import require_server_perm
        require_server_perm(database, server, current_user.id, "view_announcements", "You do not have permission to view announcements.")
        from app.routers.moderation import require_not_timed_out
        require_not_timed_out(is_member)
        existing = database.query(Message_reaction).filter(Message_reaction.kind == "comment", Message_reaction.message_id == comment.id, Message_reaction.user_id == current_user.id, Message_reaction.emoji == emoji).first()
        if existing:
            database.delete(existing)
        else:
            database.add(Message_reaction(kind= "comment", message_id= comment.id, user_id= current_user.id, emoji= emoji))
        database.commit()
        reactions = reactions_for_one(database, "comment", comment.id, current_user.id)
        await server_broadcast(server_id= server.id, payload= {
            "type": "comment_reacted",
            "kind": "comment",
            "comment_id": comment.id,
            "post_id": comment.post_id,
            "reactions": reactions_for_one(database, "comment", comment.id, None)
        }, database= database, exclude_user_id= current_user.id)
        return {"id": comment.id, "reactions": reactions}

    raise HTTPException(status_code=400, detail="This message type cannot be reacted to yet")
