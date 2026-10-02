from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
import json

from app.models import UserInfo, Feed_alert, Servers
from app.schemas import Feed_alert_prefs_in
from app.database import get_db
from app.auth import get_current_user
from app.routers.profile import public_display_name, public_avatar

router = APIRouter()

ALERT_FAMILIES = ("activity", "profile", "moderation", "feedback")

ALERT_TYPE_LABELS = {
    "reaction": "Reaction",
    "reply": "Reply",
    "post_comment": "Post comment",
    "event_invite": "Event invite",
    "widget_comment": "Profile comment",
    "widget_update": "Subscription update",
    "profile_event": "Profile event",
    "friend_accept": "Friend request accepted",
    "friend_deny": "Friend request declined",
    "kick": "Removed from server",
    "ban": "Banned from server",
    "timeout": "Timed out",
    "feedback_status": "Feedback update",
    "report_status": "Report update",
}

FAMILY_FOR_TYPE = {
    "reaction": "activity",
    "reply": "activity",
    "post_comment": "activity",
    "event_invite": "activity",
    "widget_comment": "profile",
    "widget_update": "profile",
    "profile_event": "profile",
    "friend_accept": "profile",
    "friend_deny": "profile",
    "kick": "moderation",
    "ban": "moderation",
    "timeout": "moderation",
    "feedback_status": "feedback",
    "report_status": "feedback",
}

FEED_PREF_TYPES = (
    "reaction",
    "reply",
    "post_comment",
    "event_invite",
    "widget_comment",
    "friend_accept",
    "friend_deny",
    "kick",
    "ban",
    "timeout",
    "feedback_status",
    "report_status",
)


def default_feed_alert_prefs():
    return {kind: True for kind in FEED_PREF_TYPES}


def feed_alert_prefs_for(user):
    prefs = default_feed_alert_prefs()
    raw = getattr(user, "feed_alert_prefs", None) if user else None
    data = None
    if isinstance(raw, dict):
        data = raw
    elif raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                data = parsed
        except (TypeError, ValueError, json.JSONDecodeError):
            data = None
    if data:
        for kind, value in data.items():
            key = str(kind or "").strip().lower()
            if key in prefs:
                prefs[key] = bool(value)
    return prefs


def feed_alert_type_enabled(user, alert_type):
    kind = (alert_type or "").strip().lower()
    if kind not in FEED_PREF_TYPES:
        return True
    return bool(feed_alert_prefs_for(user).get(kind, True))


def normalize_feed_alert_prefs(payload):
    prefs = default_feed_alert_prefs()
    data = payload if isinstance(payload, dict) else {}
    for kind in FEED_PREF_TYPES:
        if kind in data:
            prefs[kind] = bool(data[kind])
    return prefs


def normalize_alert_family(family, alert_type):
    kind = (family or "").strip().lower()
    if kind in ALERT_FAMILIES:
        return kind
    mapped = FAMILY_FOR_TYPE.get((alert_type or "").strip().lower())
    if mapped:
        return mapped
    return "activity"


def parse_alert_context(raw):
    if not raw:
        return None
    if isinstance(raw, dict):
        return raw
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except (TypeError, ValueError, json.JSONDecodeError):
        return None


def parse_legacy_until(text):
    value = (text or "").strip()
    lower = value.lower()
    if lower.startswith("until "):
        return value[6:].strip()
    if lower.startswith("can rejoin after "):
        return value[len("Can rejoin after "):].strip()
    return None


def legacy_moderation_facts(raw, created_at=None):
    text = (raw or "").strip()
    if not text:
        return None
    data = parse_alert_context(text)
    if data:
        until = data.get("until")
        duration = data.get("duration_seconds")
        if duration is None and until and created_at:
            try:
                end = datetime.fromisoformat(str(until).replace("Z", "+00:00"))
                if getattr(end, "tzinfo", None):
                    end = end.replace(tzinfo=None)
                start = created_at.replace(tzinfo=None) if getattr(created_at, "tzinfo", None) else created_at
                duration = max(0, int((end - start).total_seconds()))
            except (TypeError, ValueError):
                duration = None
        return {
            "server_id": data.get("server_id"),
            "server_name": data.get("server_name"),
            "reason": (data.get("reason") or "").strip() or None,
            "duration_seconds": int(duration) if duration else None,
        }
    if text[:1] == "{":
        return None
    parts = [part.strip() for part in text.split(" — ") if part.strip()]
    if not parts:
        return None
    server_name = parts[0] or "Server"
    reason = None
    until = None
    if len(parts) >= 2:
        until = parse_legacy_until(parts[1])
        if until is None:
            reason = parts[1] or None
    if len(parts) >= 3:
        until = parse_legacy_until(parts[2]) or until
    duration = None
    if until and created_at:
        try:
            end = datetime.fromisoformat(until.replace("Z", "+00:00"))
            if getattr(end, "tzinfo", None):
                end = end.replace(tzinfo=None)
            start = created_at.replace(tzinfo=None) if getattr(created_at, "tzinfo", None) else created_at
            duration = max(0, int((end - start).total_seconds()))
        except (TypeError, ValueError):
            duration = None
    return {
        "server_id": None,
        "server_name": server_name,
        "reason": reason,
        "duration_seconds": duration,
    }


def migrate_moderation_row(database, row):
    family = normalize_alert_family(row.alert_family, row.alert_type)
    if family != "moderation":
        return False
    changed = False
    if not getattr(row, "server_id", None) or not getattr(row, "reason", None) or getattr(row, "duration_seconds", None) is None:
        facts = legacy_moderation_facts(row.context, row.created_at)
        if facts:
            if not row.server_id and facts.get("server_id"):
                row.server_id = facts["server_id"]
                changed = True
            if not row.server_id and facts.get("server_name"):
                server = database.query(Servers).filter(Servers.name == facts["server_name"]).first()
                if server:
                    row.server_id = server.id
                    changed = True
            if not row.reason and facts.get("reason"):
                row.reason = facts["reason"]
                changed = True
            if row.duration_seconds is None and facts.get("duration_seconds") is not None:
                row.duration_seconds = facts["duration_seconds"]
                changed = True
    if row.context:
        row.context = None
        changed = True
    if changed and database is not None:
        database.add(row)
    return changed


def serialize_feed_alert(row, sender=None, server=None):
    family = normalize_alert_family(row.alert_family, row.alert_type)
    kind = (row.alert_type or "").strip().lower()
    from app.routers.servers import server_icon_url
    face_kind = "server" if family == "moderation" else "user"
    payload = {
        "id": row.id,
        "alert_family": family,
        "alert_type": kind,
        "alert_type_label": ALERT_TYPE_LABELS.get(kind, kind or "Alert"),
        "reason": (row.reason or "").strip() or None,
        "duration_seconds": row.duration_seconds,
        "server_id": row.server_id,
        "context": row.context,
        "created_at": row.created_at.isoformat() + "Z" if row.created_at else None,
        "sender_id": row.sender_id,
        "sender_username": sender.username if sender else None,
        "sender_display_name": public_display_name(sender) if sender else None,
        "sender_avatar": public_avatar(sender) if sender else None,
        "face_kind": face_kind,
        "subject_name": None,
        "subject_icon_url": None,
    }
    if face_kind == "server":
        if server:
            payload["subject_name"] = server.name or "Server"
            payload["subject_icon_url"] = server_icon_url(server) or ""
            payload["server_id"] = server.id
        else:
            payload["subject_name"] = "Unknown server"
            payload["subject_icon_url"] = ""
    else:
        payload["subject_name"] = payload["sender_display_name"] or payload["sender_username"] or "Someone"
    return payload


def create_feed_alert(
    database,
    receiver_id,
    alert_type,
    sender_id=None,
    alert_family=None,
    server_id=None,
    reason=None,
    duration_seconds=None,
    context=None,
):
    kind = (alert_type or "").strip().lower()
    family = normalize_alert_family(alert_family, kind)
    row = Feed_alert(
        receiver_id=receiver_id,
        sender_id=sender_id,
        alert_family=family,
        alert_type=kind,
        server_id=server_id,
        reason=(reason or "").strip() or None,
        duration_seconds=int(duration_seconds) if duration_seconds else None,
        context=context,
    )
    database.add(row)
    database.commit()
    database.refresh(row)
    return row


async def notify_feed_alert(
    database,
    receiver_id,
    alert_type,
    sender_id=None,
    alert_family=None,
    server_id=None,
    reason=None,
    duration_seconds=None,
    context=None,
):
    from app.routers.realtime import notify_user
    receiver = database.query(UserInfo).filter(UserInfo.id == receiver_id).first() if receiver_id else None
    if receiver and not feed_alert_type_enabled(receiver, alert_type):
        return None
    row = create_feed_alert(
        database,
        receiver_id=receiver_id,
        alert_type=alert_type,
        sender_id=sender_id,
        alert_family=alert_family,
        server_id=server_id,
        reason=reason,
        duration_seconds=duration_seconds,
        context=context,
    )
    sender = database.query(UserInfo).filter(UserInfo.id == sender_id).first() if sender_id else None
    server = database.query(Servers).filter(Servers.id == server_id).first() if server_id else None
    await notify_user(receiver_id, {
        "type": "feed_alert",
        "alert": serialize_feed_alert(row, sender, server),
    })
    return row


def reaction_pref_allows(user, kind):
    value = ((user.notify_reactions if user else "") or "").strip()
    if value not in ("all", "dms", "off"):
        value = "all"
    if value == "off":
        return False
    if value == "dms":
        return kind == "dm"
    return True


SURFACE_REACTION_KINDS = {"announcement", "forum", "forum_post", "comment", "media_comment", "calendar_event"}


def watching_surface(user_id, channel_id):
    from app.routers.realtime import viewer_is_watching_channel
    return bool(channel_id) and viewer_is_watching_channel(user_id, channel_id)


async def notify_activity_reply(
    database,
    *,
    receiver_id,
    actor_id,
    message_kind,
    message_id,
    server_id=None,
    channel_id=None,
):
    if not receiver_id or not actor_id or receiver_id == actor_id:
        return
    if message_kind == "forum" and watching_surface(receiver_id, channel_id):
        return
    await notify_feed_alert(
        database,
        receiver_id=receiver_id,
        alert_type="reply",
        sender_id=actor_id,
        alert_family="activity",
        server_id=server_id,
        context=json.dumps({"kind": message_kind, "message_id": message_id}),
    )


async def notify_activity_reaction(
    database,
    *,
    receiver_id,
    actor_id,
    message_kind,
    message_id,
    emoji,
    server_id=None,
    channel_id=None,
):
    if not receiver_id or not actor_id or receiver_id == actor_id:
        return
    if message_kind in SURFACE_REACTION_KINDS and watching_surface(receiver_id, channel_id):
        return
    owner = database.query(UserInfo).filter(UserInfo.id == receiver_id).first()
    if not reaction_pref_allows(owner, message_kind):
        return
    await notify_feed_alert(
        database,
        receiver_id=receiver_id,
        alert_type="reaction",
        sender_id=actor_id,
        alert_family="activity",
        server_id=server_id,
        reason=(emoji or "").strip() or None,
        context=json.dumps({"kind": message_kind, "message_id": message_id}),
    )


async def notify_activity_post_comment(
    database,
    *,
    receiver_id,
    actor_id,
    post_kind,
    post_id,
    server_id=None,
    channel_id=None,
):
    if not receiver_id or not actor_id or receiver_id == actor_id:
        return
    if watching_surface(receiver_id, channel_id):
        return
    await notify_feed_alert(
        database,
        receiver_id=receiver_id,
        alert_type="post_comment",
        sender_id=actor_id,
        alert_family="activity",
        server_id=server_id,
        context=json.dumps({"kind": post_kind, "post_id": post_id}),
    )


@router.get("/feed_alerts")
def list_feed_alerts(
    before_id: int = None,
    limit: int = 25,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    size = max(1, min(int(limit or 25), 50))
    prefs = feed_alert_prefs_for(current_user)
    muted = [kind for kind, enabled in prefs.items() if not enabled]
    query = database.query(Feed_alert).filter(Feed_alert.receiver_id == current_user.id)
    if muted:
        query = query.filter(~Feed_alert.alert_type.in_(muted))
    if before_id:
        query = query.filter(Feed_alert.id < int(before_id))
    rows = (
        query.order_by(Feed_alert.created_at.desc(), Feed_alert.id.desc())
        .limit(size)
        .all()
    )
    dirty = False
    for row in rows:
        if migrate_moderation_row(database, row):
            dirty = True
    if dirty:
        database.commit()
        for row in rows:
            database.refresh(row)

    sender_ids = {row.sender_id for row in rows if row.sender_id}
    server_ids = {row.server_id for row in rows if row.server_id}
    senders = {}
    servers = {}
    if sender_ids:
        for user in database.query(UserInfo).filter(UserInfo.id.in_(sender_ids)).all():
            senders[user.id] = user
    if server_ids:
        for server in database.query(Servers).filter(Servers.id.in_(server_ids)).all():
            servers[server.id] = server
    return {
        "alerts": [
            serialize_feed_alert(row, senders.get(row.sender_id), servers.get(row.server_id))
            for row in rows
        ]
    }


@router.get("/feed_alert_prefs")
def get_feed_alert_prefs(current_user: UserInfo = Depends(get_current_user)):
    return {"prefs": feed_alert_prefs_for(current_user)}


@router.post("/feed_alert_prefs")
def save_feed_alert_prefs(
    body: Feed_alert_prefs_in,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    prefs = normalize_feed_alert_prefs(body.prefs if body else {})
    current_user.feed_alert_prefs = json.dumps(prefs)
    database.commit()
    return {"prefs": prefs}


@router.post("/feed_alerts/{alert_id}/delete")
def delete_feed_alert(alert_id: int, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    row = database.query(Feed_alert).filter(
        Feed_alert.id == alert_id,
        Feed_alert.receiver_id == current_user.id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Alert not found.")
    database.delete(row)
    database.commit()
    return {"ok": True}
