# Server audit log list — reads existing audit_logs rows (no new table).
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import json

from app.models import UserInfo, Audit_log
from app.database import get_db
from app.auth import get_current_user
from app.routers.roles import require_server_member, require_server_perm
from app.routers.profile import public_avatar, public_display_name

router = APIRouter()

ACTION_LABELS = {
    "member_joined": "Member Joined",
    "member_left": "Member Left",
    "create_invite": "Invite Created",
    "pause_invite": "Invite Paused",
    "unpause_invite": "Invite Unpaused",
    "revoke_invite": "Invite Revoked",
    "kick_member": "Member Kicked",
    "ban_member": "Member Banned",
    "unban_member": "Member Unbanned",
    "timeout_member": "Member Timed Out",
    "timeout_clear": "Timeout Cleared",
    "roles_modified": "Roles Updated",
    "role_deleted": "Role Deleted",
    "role_member_updated": "Member Roles Updated",
    "delete_message": "Message Deleted",
    "delete_post": "Post Deleted",
    "delete_comment": "Comment Deleted",
    "delete_channel": "Channel Deleted",
    "delete_category": "Category Deleted",
    "create_channel": "Channel Created",
    "create_category": "Category Created",
    "update_channel": "Channel Updated",
    "update_category": "Category Updated",
    "update_server": "Server Updated",
    "update_privacy": "Privacy Updated",
    "create_emoji": "Emoji Created",
    "rename_emoji": "Emoji Updated",
    "delete_emoji": "Emoji Deleted",
    "transfer_owner": "Ownership Transferred",
    "update_nickname": "Nickname Updated",
    "update_channel_perms": "Channel Permissions Updated",
    "delete_media": "Media Deleted",
    "delete_doc": "Document Deleted",
    "delete_list_item": "List Item Deleted",
    "create_forum_tag": "Forum Tag Created",
    "update_forum_tag": "Forum Tag Updated",
    "delete_forum_tag": "Forum Tag Deleted",
    "delete_schedule": "Availability Removed",
    "follow_channel": "Channel Followed",
    "unfollow_channel": "Channel Unfollowed",
    "move_channel_follow": "Follow Moved",
    "publish_announcement": "Announcement Published",
    "voice_mute": "Member Server Muted",
    "voice_unmute": "Member Server Unmuted",
    "voice_deafen": "Member Server Deafened",
    "voice_undeafen": "Member Server Undeafened",
    "voice_disconnect": "Member Disconnected",
    "voice_move": "Member Moved",
}


def parse_detail(raw):
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}


def detail_summary(action, target_type, detail):
    d = detail or {}
    if action in ("kick_member", "ban_member", "unban_member", "timeout_member", "timeout_clear", "member_joined", "member_left", "voice_mute", "voice_unmute", "voice_deafen", "voice_undeafen"):
        name = d.get("username") or ""
        reason = (d.get("reason") or "").strip()
        bits = [name] if name else []
        if reason:
            bits.append(reason)
        return " — ".join(bits) if bits else (target_type or "")
    if action in ("create_invite", "pause_invite", "unpause_invite", "revoke_invite"):
        code = d.get("code") or ""
        return f"Code {code}" if code else "Invite link"
    if action == "roles_modified":
        created = d.get("created_ids") or []
        updated = d.get("updated_ids") or []
        parts = []
        if created:
            parts.append(f"{len(created)} created")
        if updated:
            parts.append(f"{len(updated)} updated")
        return ", ".join(parts) if parts else "Roles saved"
    if action == "role_deleted":
        roles = d.get("roles") or []
        if roles and isinstance(roles[0], dict) and roles[0].get("name"):
            return roles[0]["name"]
        return d.get("name") or "Role"
    if action == "role_member_updated":
        role = d.get("role_name") or "role"
        user = d.get("username") or "member"
        verb = "assigned" if d.get("assigned") else "removed"
        return f"{role} {verb} for {user}"
    if action in ("delete_message", "delete_post", "delete_comment"):
        author = d.get("author_username") or ""
        content = (d.get("content") or d.get("title") or "").strip()
        if content and len(content) > 80:
            content = content[:77] + "..."
        bits = [b for b in (author, content) if b]
        return " — ".join(bits) if bits else (target_type or "Deleted")
    if action == "update_channel_perms":
        role = d.get("role_name") or "Role"
        channel = d.get("name") or "channel"
        return f"{role} in {channel}"
    if action in ("delete_media", "delete_doc", "delete_list_item"):
        return d.get("title") or d.get("name") or target_type or ""
    if action in ("create_forum_tag", "update_forum_tag", "delete_forum_tag"):
        return d.get("name") or "Tag"
    if action == "delete_schedule":
        user = d.get("username") or "member"
        return f"Removed for {user}"
    if action in ("follow_channel", "unfollow_channel", "move_channel_follow"):
        source = f"{d.get('source_server') or 'Server'} / #{d.get('source_channel') or 'announcements'}"
        return f"{source} → #{d.get('name') or 'announcements'}"
    if action == "publish_announcement":
        return d.get("title") or "Announcement"
    if action == "voice_disconnect":
        name = d.get("username") or "member"
        channel = d.get("name") or "Voice"
        return f"{name} from {channel}"
    if action == "voice_move":
        name = d.get("username") or "member"
        return f"{name}: {d.get('from') or 'Voice'} → {d.get('to') or 'Voice'}"
    if action in ("delete_channel", "delete_category", "create_channel", "create_category", "update_channel", "update_category", "create_emoji", "rename_emoji", "delete_emoji"):
        return d.get("name") or target_type or ""
    if action in ("update_server", "update_privacy"):
        return d.get("field") or d.get("name") or "Server"
    if action == "transfer_owner":
        user = d.get("username") or "member"
        return f"Transferred to {user}"
    # Fallback: short JSON-ish without dumping secrets.
    name = d.get("username") or d.get("name") or d.get("title") or ""
    return name or (target_type or "")


def serialize_audit_row(row, actor):
    detail = parse_detail(row.detail)
    action = row.action or ""
    return {
        "id": row.id,
        "actor_id": row.actor_id,
        "actor_username": actor.username if actor else None,
        "actor_display_name": public_display_name(actor) if actor else None,
        "actor_avatar": public_avatar(actor) if actor else None,
        "action": action,
        "action_label": ACTION_LABELS.get(action, action.replace("_", " ").title() if action else "Event"),
        "target_type": row.target_type,
        "target_id": row.target_id,
        "detail": detail,
        "summary": detail_summary(action, row.target_type, detail),
        "created_at": str(row.created_at) if row.created_at else None,
    }


@router.get("/server_audit_log/{server_id}")
def server_audit_log(server_id: str, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    server = require_server_member(database, server_id, current_user.id)
    require_server_perm(database, server, current_user.id, "update_server", "You do not have permission to view the audit log.")
    rows = (
        database.query(Audit_log)
        .filter(Audit_log.server_id == server_id)
        .order_by(Audit_log.id.desc())
        .limit(200)
        .all()
    )
    actor_ids = {row.actor_id for row in rows if row.actor_id}
    actors = {}
    if actor_ids:
        for user in database.query(UserInfo).filter(UserInfo.id.in_(actor_ids)).all():
            actors[user.id] = user
    return {
        "server_id": server_id,
        "entries": [serialize_audit_row(row, actors.get(row.actor_id)) for row in rows],
    }
