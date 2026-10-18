from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import UserInfo
from app.privacy import blocked_user_ids
from app.routers.friends import get_friends
from app.routers.messages import conversation_history
from app.routers.notify_prefs import notify_bundle_for_user
from app.routers.parties import get_parties
from app.routers.servers import get_user_servers

router = APIRouter()


def path_parts(path):
    raw = unquote((path or "").split("?")[0] or "")
    parts = [part for part in raw.split("/") if part]
    if parts and parts[0] == "main":
        parts = parts[1:]
    if parts and parts[0] in ("app.html", "app"):
        parts = parts[1:]
    return parts


def last_place_payload(database, current_user, path, chat, chat_id):
    from app.routers.messages import get_conversation
    from app.routers.parties import get_party_members, get_party_messages
    from app.routers.profile import get_own_profile_layout, get_public_profile, user_by_username
    from app.routers.servers import RESERVED_SERVER_SLUGS, clean_server_slug, get_server_contents, server_by_slug

    parts = path_parts(path)
    try:
        if not parts or parts[0] in ("messages", "home"):
            kind = (chat or "").strip().lower()
            if kind == "dm" and chat_id:
                data = get_conversation(user_id=int(chat_id), database=database, current_user=current_user)
                return {
                    "kind": "dm",
                    "id": int(chat_id),
                    "name": data.get("other_username") or "",
                    "messages": data.get("messages") or [],
                    "other_username": data.get("other_username") or "",
                    "other_avatar": data.get("other_avatar"),
                    "permaban": bool(data.get("permaban")),
                }
            if kind == "party" and chat_id:
                data = get_party_messages(party_id=int(chat_id), database=database, current_user=current_user)
                members = get_party_members(party_id=int(chat_id), database=database, current_user=current_user)
                return {
                    "kind": "party",
                    "id": int(chat_id),
                    "name": data.get("party_name") or "",
                    "messages": data.get("messages") or [],
                    "members": members.get("members") or [],
                }
            return {"kind": "home"}
        if parts[0] == "profile" and len(parts) > 1:
            info = user_by_username(username=parts[1], database=database, current_user=current_user)
            uid = info.get("id")
            if uid == current_user.id:
                profile = get_own_profile_layout(current_user=current_user, database=database)
            else:
                profile = get_public_profile(user_id=uid, current_user=current_user, database=database)
            return {"kind": "profile", "id": uid, "username": info.get("username") or "", "profile": profile}
        if parts[0] == "server" and len(parts) > 1:
            sid = parts[1]
            contents = get_server_contents(server_id=sid, database=database, current_user=current_user, land=1)
            return {"kind": "server", "id": sid, "server": contents}
        if len(parts) == 1:
            slug = clean_server_slug(parts[0])
            if not slug or slug.lower() in RESERVED_SERVER_SLUGS:
                return {"kind": "home"}
            info = server_by_slug(slug=slug, database=database, current_user=current_user)
            sid = info.get("id")
            contents = get_server_contents(server_id=sid, database=database, current_user=current_user, land=1)
            return {"kind": "server", "id": sid, "server": contents}
    except (HTTPException, TypeError, ValueError):
        return None
    return None


@router.get("/ready")
def boot_ready(
    path: str = "",
    chat: str = "",
    chat_id: int = None,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    servers = get_user_servers(database=database, current_user=current_user)
    conversations = conversation_history(database=database, current_user=current_user)
    parties = get_parties(database=database, current_user=current_user)
    friends = get_friends(database=database, current_user=current_user)
    return {
        "servers": servers.get("servers") or [],
        "conversations": conversations.get("conversations") or [],
        "parties": parties.get("parties") or [],
        "friends": friends,
        "blocked_ids": list(blocked_user_ids(database, current_user.id)),
        "notify": notify_bundle_for_user(database, current_user.id),
        "place": last_place_payload(database, current_user, path, chat, chat_id),
    }
