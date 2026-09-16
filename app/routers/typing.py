# Live "is typing" pings. Not stored — just membership-checked and
# forwarded to whoever is currently connected. Clients drop the label
# after ~8s without a refresh, or immediately on active=False.
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from app.models import (
    UserInfo, Block_user, Friend_request, Party_members,
    Servers, Server_members, Server_categories, Server_channels, Forum_post,
)
from app.routers.realtime import active_connections, party_broadcast, server_broadcast


def _as_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _payload(current_user, kind, active, **ids):
    out = {
        "type": "typing",
        "kind": kind,
        "active": bool(active),
        "user_id": current_user.id,
        "username": current_user.username,
    }
    out.update(ids)
    return out


async def relay_typing(data, current_user: UserInfo, database: Session):
    kind = data.get("kind")
    active = bool(data.get("active", True))

    if kind == "dm":
        receiver_id = _as_int(data.get("receiver_id"))
        if not receiver_id or receiver_id == current_user.id:
            return
        blocked = database.query(Block_user).filter(or_(
            and_(Block_user.initiated_by == current_user.id, Block_user.blocked_user == receiver_id),
            and_(Block_user.initiated_by == receiver_id, Block_user.blocked_user == current_user.id),
        )).first()
        if blocked:
            return
        friendship = database.query(Friend_request).filter(or_(
            and_(Friend_request.user_1 == current_user.id, Friend_request.user_2 == receiver_id),
            and_(Friend_request.user_1 == receiver_id, Friend_request.user_2 == current_user.id),
        )).first()
        if not friendship or friendship.pending == True:
            return
        if receiver_id in active_connections:
            await active_connections[receiver_id].send_json(
                _payload(current_user, "dm", active, receiver_id=receiver_id)
            )
        return

    if kind == "party":
        party_id = _as_int(data.get("party_id"))
        if not party_id:
            return
        in_party = database.query(Party_members).filter(
            Party_members.party_id == party_id,
            Party_members.user_id == current_user.id,
        ).first()
        if not in_party:
            return
        await party_broadcast(party_id, _payload(current_user, "party", active, party_id=party_id), database, exclude_user_id=current_user.id)
        return

    if kind == "channel":
        channel_id = _as_int(data.get("channel_id"))
        if not channel_id:
            return
        channel = database.query(Server_channels).filter(Server_channels.id == channel_id).first()
        if not channel or channel.channel_type != "text":
            return
        category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
        if not category:
            return
        server = database.query(Servers).filter(Servers.id == category.server_id).first()
        if not server:
            return
        is_member = database.query(Server_members).filter(
            Server_members.server_id == server.id,
            Server_members.user_id == current_user.id,
        ).first()
        if not is_member:
            return
        await server_broadcast(server.id, _payload(current_user, "channel", active, channel_id=channel.id), database, exclude_user_id=current_user.id)
        return

    if kind == "forum":
        post_id = _as_int(data.get("post_id"))
        if not post_id:
            return
        post = database.query(Forum_post).filter(Forum_post.id == post_id).first()
        if not post:
            return
        channel = database.query(Server_channels).filter(Server_channels.id == post.channel_id).first()
        if not channel:
            return
        category = database.query(Server_categories).filter(Server_categories.id == channel.category_id).first()
        if not category:
            return
        server = database.query(Servers).filter(Servers.id == category.server_id).first()
        if not server:
            return
        is_member = database.query(Server_members).filter(
            Server_members.server_id == server.id,
            Server_members.user_id == current_user.id,
        ).first()
        if not is_member:
            return
        await server_broadcast(
            server.id,
            _payload(current_user, "forum", active, post_id=post.id, channel_id=channel.id),
            database,
            exclude_user_id=current_user.id,
        )
