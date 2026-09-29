from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import json

from app.models import UserInfo, Feed_alert
from app.database import get_db
from app.auth import get_current_user
from app.routers.profile import public_display_name, public_avatar

router = APIRouter()

ALERT_FAMILIES = ("activity", "profile", "moderation", "feedback")

ALERT_TYPE_LABELS = {
    "reaction": "Reaction",
    "reply": "Reply",
    "post_comment": "Post comment",
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


def serialize_feed_alert(row, sender=None):
    family = normalize_alert_family(row.alert_family, row.alert_type)
    kind = (row.alert_type or "").strip().lower()
    detail = parse_alert_context(row.context)
    return {
        "id": row.id,
        "alert_family": family,
        "alert_type": kind,
        "alert_type_label": ALERT_TYPE_LABELS.get(kind, kind or "Alert"),
        "context": row.context if not detail else None,
        "detail": detail,
        "created_at": row.created_at.isoformat() + "Z" if row.created_at else None,
        "sender_id": row.sender_id,
        "sender_username": sender.username if sender else None,
        "sender_display_name": public_display_name(sender) if sender else None,
        "sender_avatar": public_avatar(sender) if sender else None,
    }


def create_feed_alert(database, receiver_id, alert_type, context=None, sender_id=None, alert_family=None):
    kind = (alert_type or "").strip().lower()
    family = normalize_alert_family(alert_family, kind)
    row = Feed_alert(
        receiver_id=receiver_id,
        sender_id=sender_id,
        alert_family=family,
        alert_type=kind,
        context=context,
    )
    database.add(row)
    database.commit()
    database.refresh(row)
    return row


async def notify_feed_alert(database, receiver_id, alert_type, context=None, sender_id=None, alert_family=None):
    from app.routers.realtime import notify_user
    row = create_feed_alert(
        database,
        receiver_id=receiver_id,
        alert_type=alert_type,
        context=context,
        sender_id=sender_id,
        alert_family=alert_family,
    )
    sender = None
    if sender_id:
        sender = database.query(UserInfo).filter(UserInfo.id == sender_id).first()
    await notify_user(receiver_id, {
        "type": "feed_alert",
        "alert": serialize_feed_alert(row, sender),
    })
    return row


def moderation_alert_context(server, reason=None, until_iso=None, duration_seconds=None):
    from app.routers.servers import server_icon_url
    payload = {
        "server_id": getattr(server, "id", None),
        "server_name": (getattr(server, "name", None) or "").strip() or "Server",
        "server_icon_url": server_icon_url(server) or "",
        "reason": (reason or "").strip(),
        "until": until_iso,
        "duration_seconds": int(duration_seconds) if duration_seconds else None,
    }
    return json.dumps(payload)


@router.get("/feed_alerts")
def list_feed_alerts(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    rows = (
        database.query(Feed_alert)
        .filter(Feed_alert.receiver_id == current_user.id)
        .order_by(Feed_alert.created_at.asc(), Feed_alert.id.asc())
        .limit(100)
        .all()
    )
    sender_ids = {row.sender_id for row in rows if row.sender_id}
    senders = {}
    if sender_ids:
        for user in database.query(UserInfo).filter(UserInfo.id.in_(sender_ids)).all():
            senders[user.id] = user
    return {
        "alerts": [serialize_feed_alert(row, senders.get(row.sender_id)) for row in rows]
    }


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
