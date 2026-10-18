from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from app.models import UserInfo, Parties, Party_messages, Party_members, Message_mention
from app.schemas import Party_create, Party_message_schema, Conversation_mute_in
from app.database import get_db
from app.auth import get_current_user
from app.r2 import attachment_public, require_message_body, store_attachment
from app.routers.deletion import deletion_fields, refresh_pending_messages
from app.routers.reactions import reactions_for_messages
from app.routers.realtime import party_broadcast, serialize_member
from app.routers.profile import avatar_lookup
from app.routers.mentions import apply_party_mentions, decorate_history, accepted_reply_parent, reply_map_for
from app.routers.feed import notify_activity_reply
from app.site_moderation import mask_message_payloads
from app.privacy import drop_blocked_rows
from app.routers.messages import mute_until_for, mute_public
from datetime import datetime
import random

router = APIRouter()

@router.post("/create_party")
async def create_party(party: Party_create, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    while True:
        potential_id = random.randint(1000, 9999)
        id_check = database.query(Parties).filter(Parties.id == potential_id).first()
        if not id_check:
            break

    new_party = Parties(
        id=potential_id,
        party_name=party.party_name,
        created_by_id=current_user.id
    )
    database.add(new_party)

    owner_member = Party_members(party_id=potential_id, user_id=current_user.id)
    database.add(owner_member)

    unseen = datetime(1970, 1, 1)
    for user in party.member_ids:
        if not user == current_user.id:
            invited_member = Party_members(party_id=potential_id, user_id=user, last_activity=unseen)
            database.add(invited_member)

    created_line = Party_messages(
        party_id=potential_id,
        sender_id=None,
        content=current_user.username + " created the party.",
    )
    database.add(created_line)
    database.commit()
    database.refresh(created_line)
    await party_broadcast(party_id=potential_id, payload={
        "type": "party_message",
        "id": created_line.id,
        "party_id": potential_id,
        "party_name": new_party.party_name,
        "sender_id": None,
        "username": "",
        "content": created_line.content,
        "timestamp": str(created_line.timestamp),
        "is_system": True,
    }, database=database, exclude_user_id=current_user.id)
    return {"id": potential_id, "party_name": new_party.party_name}

@router.get("/get_parties")
def get_parties(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    my_memberships = database.query(Party_members).filter(Party_members.user_id == current_user.id).all()
    party_ids = [row.party_id for row in my_memberships]
    parties = {row.id: row for row in database.query(Parties).filter(Parties.id.in_(party_ids)).all()} if party_ids else {}
    member_counts = {}
    latest_times = {}
    unread_counts = {}
    mention_counts = {}
    if party_ids:
        for party_id, count in database.query(Party_members.party_id, func.count(Party_members.id)).filter(
            Party_members.party_id.in_(party_ids)
        ).group_by(Party_members.party_id).all():
            member_counts[party_id] = int(count or 0)
        for party_id, latest in database.query(Party_messages.party_id, func.max(Party_messages.timestamp)).filter(
            Party_messages.party_id.in_(party_ids)
        ).group_by(Party_messages.party_id).all():
            latest_times[party_id] = latest
        for party_id, count in database.query(Party_messages.party_id, func.count(Party_messages.id)).join(
            Party_members,
            and_(
                Party_members.party_id == Party_messages.party_id,
                Party_members.user_id == current_user.id,
            ),
        ).filter(
            Party_messages.party_id.in_(party_ids),
            Party_messages.timestamp > Party_members.last_activity,
            Party_messages.sender_id != current_user.id,
        ).group_by(Party_messages.party_id).all():
            unread_counts[party_id] = int(count or 0)
        for party_id, count in database.query(Message_mention.party_id, func.count(Message_mention.id)).join(
            Party_members,
            and_(
                Party_members.party_id == Message_mention.party_id,
                Party_members.user_id == current_user.id,
            ),
        ).filter(
            Message_mention.kind == "party",
            Message_mention.party_id.in_(party_ids),
            Message_mention.user_id == current_user.id,
            Message_mention.created_at > Party_members.last_activity,
        ).group_by(Message_mention.party_id).all():
            mention_counts[party_id] = int(count or 0)

    parties_out = []
    for membership in my_memberships:
        party_info = parties.get(membership.party_id)
        if not party_info:
            continue
        sort_timestamp = latest_times.get(membership.party_id) or membership.joined_at
        mute_info = mute_public(membership.muted_until)
        parties_out.append({
            "type": "party",
            "id": membership.party_id,
            "name": party_info.party_name,
            "member_count": member_counts.get(membership.party_id, 0),
            "last_activity": str(sort_timestamp),
            "unread_count": unread_counts.get(membership.party_id, 0),
            "mention_count": mention_counts.get(membership.party_id, 0),
            "muted": mute_info["muted"],
            "muted_until": mute_info["muted_until"],
        })

    return {"parties": parties_out}

@router.get("/get_party_members/{party_id}")
def get_party_members(party_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    in_party = database.query(Party_members).filter(Party_members.party_id == party_id, Party_members.user_id == current_user.id).first()
    if not in_party:
        raise HTTPException(status_code=404, detail="User not in party")

    party = database.query(Parties).filter(Parties.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")

    memberships = database.query(Party_members).filter(Party_members.party_id == party_id).all()
    user_ids = [row.user_id for row in memberships]
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(user_ids)).all()
    account_lookup = {account.id: account for account in accounts}

    members = []
    for row in memberships:
        account = account_lookup.get(row.user_id)
        if account:
            members.append(serialize_member(account, account.id == party.created_by_id))
    return {"party_id": party_id, "members": members}

@router.post("/party/{party_id}/mute")
def mute_party(party_id: int, body: Conversation_mute_in, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    membership = database.query(Party_members).filter(Party_members.party_id == party_id, Party_members.user_id == current_user.id).first()
    if not membership:
        raise HTTPException(status_code=404, detail="User not in party")
    until = mute_until_for(body.duration)
    membership.muted_until = until
    database.commit()
    return mute_public(until)
    
@router.post("/send_party_message")
async def message_party(party_msg: Party_message_schema, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    in_Party = database.query(Party_members).filter(Party_members.user_id == current_user.id, Party_members.party_id == party_msg.party_id).first()

    if not in_Party:
        raise HTTPException(status_code=404, detail="Party not found.")

    require_message_body(party_msg.content, party_msg.attachment)
    parent = None
    if party_msg.reply_to_id:
        candidate = database.query(Party_messages).filter(Party_messages.id == party_msg.reply_to_id, Party_messages.party_id == party_msg.party_id).first()
        parent = accepted_reply_parent(candidate)
    new_party_msg = Party_messages(
        party_id=party_msg.party_id,
        sender_id=current_user.id,
        content=party_msg.content,
        attachment=store_attachment(party_msg.attachment, current_user),
        reply_to_id= parent.id if parent else None,
    )
    database.add(new_party_msg)
    database.flush()
    member_ids = [row.user_id for row in database.query(Party_members).filter(Party_members.party_id == party_msg.party_id).all()]
    apply_party_mentions(database, new_party_msg, member_ids, reply_author_id= parent.sender_id if parent else None)

    database.query(Party_members).filter(Party_members.party_id == party_msg.party_id, Party_members.user_id == current_user.id).update(
        {"last_activity": datetime.utcnow()}
    )
    database.commit()
    database.refresh(new_party_msg)
    if parent and parent.sender_id:
        await notify_activity_reply(
            database,
            receiver_id=parent.sender_id,
            actor_id=current_user.id,
            message_kind="party",
            message_id=new_party_msg.id,
        )

    return new_party_msg

@router.get("/get_party_messages/{party_id}")
def get_party_messages(party_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user), before_id: int = None, around_id: int = None):

    target_membership = database.query(Party_members).filter(Party_members.party_id == party_id, Party_members.user_id == current_user.id).first()
    if not target_membership:
        raise HTTPException(status_code=404, detail="User not in party")

    party_info = database.query(Parties).filter(Parties.id == party_id).first()

    base = database.query(Party_messages).filter(Party_messages.party_id == party_id)
    around_mode = False
    if around_id:
        target = base.filter(Party_messages.id == around_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="No message found")
        before = base.filter(Party_messages.id < around_id).order_by(Party_messages.timestamp.desc()).limit(12).all()
        after = base.filter(Party_messages.id > around_id).order_by(Party_messages.timestamp.asc()).limit(12).all()
        party_history = list(reversed(before)) + [target] + after
        around_mode = True
    elif before_id:
        party_history = base.filter(Party_messages.id < before_id).order_by(Party_messages.timestamp.desc()).limit(25).all()
    else:
        party_history = base.order_by(Party_messages.timestamp.desc()).limit(25).all()

    party_history = drop_blocked_rows(database, current_user.id, party_history)

    refresh_pending_messages(database, party_history)
    reaction_map = reactions_for_messages(database, "party", [message.id for message in party_history], current_user.id)
    mention_meta = decorate_history(database, "party", party_history, current_user.id)
    reply_map = reply_map_for(database, Party_messages, party_history)
    sender_ids = list({message.sender_id for message in party_history})
    accounts = database.query(UserInfo).filter(UserInfo.id.in_(sender_ids)).all()
    username_lookup = {account.id: account.username for account in accounts}
    faces = avatar_lookup(accounts)

    message_history = []

    for index, message in enumerate(party_history):
        fields = deletion_fields(message, attachment_public(message.attachment))
        message_history.append({
            "id": message.id,
            "sender_id": message.sender_id,
            "username": "" if message.sender_id == None else username_lookup.get(message.sender_id, ""),
            "content": fields["content"],
            "attachment": fields["attachment"],
            "timestamp": str(message.timestamp),
            "deletion_state": fields["deletion_state"],
            "deletion_requested_at": fields["deletion_requested_at"],
            "edited": fields["edited"],
            "reactions": reaction_map.get(message.id, []),
            "mentioned": mention_meta[index]["mentioned"],
            "mention_users": mention_meta[index]["mention_users"],
            "reply_to": reply_map.get(message.reply_to_id) if message.reply_to_id else None,
            "avatar": faces.get(message.sender_id),
        })

    if not around_mode:
        message_history.reverse()
    mask_message_payloads(database, message_history)
    return {"party_name": party_info.party_name, "party_id": party_id, "session_username": current_user.username, "messages": message_history}

@router.post("/leave_party")
async def leave_party(party_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    membership_to_leave = database.query(Party_members).filter(Party_members.party_id == party_id, Party_members.user_id == current_user.id).first()

    if not membership_to_leave:
        raise HTTPException(status_code=404, detail="No party with user_id found")

    server_message = Party_messages(
        party_id=party_id,
        sender_id=None,
        content=f"{current_user.username} has left the party.",
    )
    database.add(server_message)
    database.delete(membership_to_leave)
    database.flush() 

    remaining_count = database.query(Party_members).filter(Party_members.party_id == party_id).count()
    if remaining_count == 0:
        database.query(Party_messages).filter(Party_messages.party_id == party_id).delete()
        empty_party = database.query(Parties).filter(Parties.id == party_id).first()
        if empty_party:
            database.delete(empty_party)

    database.commit()
    database.refresh(server_message)
    if remaining_count > 0:
        await party_broadcast(party_id= party_id, payload= {
            "type": "member_left",
            "scope": "party",
            "scope_id": party_id,
            "user_id": current_user.id
        }, database= database, exclude_user_id= current_user.id)

    return {"success": True, "message": server_message}
