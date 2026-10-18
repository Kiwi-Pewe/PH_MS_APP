from fastapi import APIRouter, Depends
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


@router.get("/ready")
def boot_ready(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
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
    }
