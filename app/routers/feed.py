from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session
from datetime import datetime
import json

from app.models import Community_post, UserInfo, Feed_alert, Servers
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
    "event_created": "New event",
    "widget_comment": "Profile comment",
    "widget_update": "Subscription update",
    "profile_event": "Profile event",
    "friend_accept": "Friend request accepted",
    "friend_deny": "Friend request declined",
    "dm_request": "Message request",
    "dm_request_accept": "Message request accepted",
    "kick": "Removed from server",
    "ban": "Banned from server",
    "timeout": "Timed out",
    "feedback_status": "Feedback update",
    "report_status": "Report update",
    "application_submitted": "Application submitted",
    "community_post": "Your post received engagement",
    "community_follow": "New follower",
    "community_applications": "Server applications",
}

FAMILY_FOR_TYPE = {
    "reaction": "activity",
    "reply": "activity",
    "post_comment": "activity",
    "event_invite": "activity",
    "event_created": "activity",
    "widget_comment": "profile",
    "widget_update": "profile",
    "profile_event": "profile",
    "friend_accept": "profile",
    "friend_deny": "profile",
    "dm_request": "profile",
    "dm_request_accept": "profile",
    "kick": "moderation",
    "ban": "moderation",
    "timeout": "moderation",
    "feedback_status": "feedback",
    "report_status": "feedback",
    "application_submitted": "activity",
    "community_post": "activity",
    "community_follow": "profile",
    "community_applications": "activity",
}

FEED_PREF_TYPES = (
    "reaction",
    "reply",
    "post_comment",
    "event_invite",
    "event_created",
    "widget_comment",
    "friend_accept",
    "friend_deny",
    "dm_request",
    "dm_request_accept",
    "kick",
    "ban",
    "timeout",
    "feedback_status",
    "report_status",
    "community_post",
    "community_follow",
    "community_applications",
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


def pack_alert_context(fields):
    data = {}
    for key, value in (fields or {}).items():
        if value is None or value == "":
            continue
        data[key] = value
    return json.dumps(data) if data else None


def serialize_feed_alert(row, sender=None, server=None, extra_users=None):
    family = normalize_alert_family(row.alert_family, row.alert_type)
    kind = (row.alert_type or "").strip().lower()
    from app.routers.servers import server_icon_url
    face_kind = "server" if family == "moderation" else "user"
    ctx = parse_alert_context(row.context) or {}
    extra_users = extra_users or {}
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
        "owner_id": None,
        "owner_username": None,
        "owner_display_name": None,
        "target": None,
    }
    if kind == "application_submitted" or kind == "community_applications":
        face_kind = "server"
        payload["face_kind"] = "server"
    if kind == "community_post":
        payload["post_code"] = ctx.get("post_code")
        payload["counts"] = {
            "likes": int(ctx.get("likes") or 0),
            "dislikes": int(ctx.get("dislikes") or 0),
            "comments": int(ctx.get("comments") or 0),
        }
    if kind == "community_follow":
        payload["followers"] = int(ctx.get("followers") or 0)
    if kind == "community_applications":
        payload["pending"] = int(ctx.get("pending") or 0)
    if face_kind == "server":
        if server:
            payload["subject_name"] = server.name or "Server"
            payload["subject_icon_url"] = server_icon_url(server) or ""
            payload["server_id"] = server.id
        else:
            payload["subject_name"] = payload.get("reason") or "Unknown server"
            payload["subject_icon_url"] = ""
    else:
        payload["subject_name"] = payload["sender_display_name"] or payload["sender_username"] or "Someone"
    target = {}
    for key in (
        "kind", "message_id", "channel_id", "party_id", "post_id", "peer_id",
        "item_id", "event_id", "comment_id", "owner_id", "name", "report_id",
        "feedback_type", "post_code", "likes", "dislikes", "comments",
        "pending", "followers",
    ):
        if ctx.get(key) is not None:
            target[key] = ctx[key]
    owner_id = ctx.get("owner_id")
    if owner_id is not None:
        try:
            owner_id = int(owner_id)
        except (TypeError, ValueError):
            owner_id = None
    if owner_id is not None:
        owner = extra_users.get(owner_id)
        payload["owner_id"] = owner_id
        target["owner_id"] = owner_id
        if owner:
            payload["owner_username"] = owner.username
            payload["owner_display_name"] = public_display_name(owner)
            target["owner_name"] = public_display_name(owner) or owner.username
    payload["target"] = target or None
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


def find_feed_alert(database, receiver_id, alert_type, server_id=None, post_code=None):
    kind = (alert_type or "").strip().lower()
    if not receiver_id or not kind:
        return None
    query = database.query(Feed_alert).filter(
        Feed_alert.receiver_id == receiver_id,
        Feed_alert.alert_type == kind,
    )
    if server_id:
        query = query.filter(Feed_alert.server_id == server_id)
    rows = query.order_by(Feed_alert.created_at.desc(), Feed_alert.id.desc()).all()
    if post_code:
        code = str(post_code)
        for row in rows:
            ctx = parse_alert_context(row.context) or {}
            if str(ctx.get("post_code") or "") == code:
                return row
        return None
    return rows[0] if rows else None


def decorate_feed_alerts(database, alerts, viewer_id):
    payloads = alerts or []
    codes = []
    for payload in payloads:
        if str(payload.get("alert_type") or "").lower() != "community_post":
            continue
        code = str(payload.get("post_code") or "").strip()
        if not code:
            ctx = parse_alert_context(payload.get("context")) or {}
            code = str(ctx.get("post_code") or "").strip()
            payload["post_code"] = code or None
        if code:
            codes.append(code)
    if not codes:
        return payloads
    from app.routers.community_posts import author_map, comment_counts, pack_community_post, votes_for
    rows = database.query(Community_post).filter(Community_post.code.in_(list(set(codes)))).all()
    people = author_map(database, [row.author_id for row in rows])
    replies = comment_counts(database, [row.id for row in rows])
    votes = votes_for(database, viewer_id, [row.id for row in rows])
    by_code = {row.code: row for row in rows}
    for payload in payloads:
        if str(payload.get("alert_type") or "").lower() != "community_post":
            continue
        row = by_code.get(payload.get("post_code"))
        if not row:
            payload["post"] = None
            continue
        payload["post"] = pack_community_post(
            row,
            people,
            viewer_id,
            replies=replies.get(row.id, 0),
            comments=[],
            vote=votes.get(row.id),
        )
    return payloads


async def emit_feed_alert_ws(database, row):
    from app.routers.realtime import notify_user
    sender = database.query(UserInfo).filter(UserInfo.id == row.sender_id).first() if row.sender_id else None
    server = database.query(Servers).filter(Servers.id == row.server_id).first() if row.server_id else None
    extra_users = {}
    if sender:
        extra_users[sender.id] = sender
    ctx = parse_alert_context(row.context) or {}
    owner_id = ctx.get("owner_id")
    if owner_id is not None:
        try:
            owner_id = int(owner_id)
        except (TypeError, ValueError):
            owner_id = None
    if owner_id and owner_id not in extra_users:
        owner = database.query(UserInfo).filter(UserInfo.id == owner_id).first()
        if owner:
            extra_users[owner.id] = owner
    payload = serialize_feed_alert(row, sender, server, extra_users)
    decorate_feed_alerts(database, [payload], row.receiver_id)
    await notify_user(row.receiver_id, {
        "type": "feed_alert",
        "alert": payload,
    })


async def delete_feed_alert_row(database, row):
    if not row:
        return
    from app.routers.realtime import notify_user
    receiver_id = row.receiver_id
    alert_id = row.id
    database.delete(row)
    database.commit()
    await notify_user(receiver_id, {"type": "feed_alert_removed", "id": alert_id})


async def upsert_feed_alert(
    database,
    receiver_id,
    alert_type,
    sender_id=None,
    alert_family=None,
    server_id=None,
    reason=None,
    duration_seconds=None,
    context=None,
    force=False,
    post_code=None,
):
    receiver = database.query(UserInfo).filter(UserInfo.id == receiver_id).first() if receiver_id else None
    if receiver and not force and not feed_alert_type_enabled(receiver, alert_type):
        return None
    kind = (alert_type or "").strip().lower()
    family = normalize_alert_family(alert_family, kind)
    row = find_feed_alert(
        database,
        receiver_id,
        kind,
        server_id=server_id,
        post_code=post_code,
    )
    if row:
        row.sender_id = sender_id
        row.alert_family = family
        row.alert_type = kind
        row.server_id = server_id
        row.reason = (reason or "").strip() or None
        row.duration_seconds = int(duration_seconds) if duration_seconds else None
        row.context = context
        row.created_at = datetime.utcnow()
        database.add(row)
        database.commit()
        database.refresh(row)
    else:
        row = create_feed_alert(
            database,
            receiver_id=receiver_id,
            alert_type=kind,
            sender_id=sender_id,
            alert_family=family,
            server_id=server_id,
            reason=reason,
            duration_seconds=duration_seconds,
            context=context,
        )
    await emit_feed_alert_ws(database, row)
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
    force=False,
):
    receiver = database.query(UserInfo).filter(UserInfo.id == receiver_id).first() if receiver_id else None
    if receiver and not force and not feed_alert_type_enabled(receiver, alert_type):
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
    await emit_feed_alert_ws(database, row)
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
    party_id=None,
    post_id=None,
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
        context=pack_alert_context({
            "kind": message_kind,
            "message_id": message_id,
            "channel_id": channel_id,
            "party_id": party_id,
            "post_id": post_id,
            "peer_id": actor_id if message_kind == "dm" else None,
        }),
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
    party_id=None,
    post_id=None,
    item_id=None,
    event_id=None,
    name=None,
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
        context=pack_alert_context({
            "kind": message_kind,
            "message_id": message_id,
            "channel_id": channel_id,
            "party_id": party_id,
            "post_id": post_id,
            "item_id": item_id,
            "event_id": event_id,
            "name": name,
            "peer_id": actor_id if message_kind == "dm" else None,
        }),
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
        context=pack_alert_context({
            "kind": post_kind,
            "post_id": post_id,
            "channel_id": channel_id,
            "item_id": post_id if post_kind == "media" else None,
        }),
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
    muted = [kind for kind, enabled in prefs.items() if not enabled and kind != "dm_request"]
    query = database.query(Feed_alert).filter(Feed_alert.receiver_id == current_user.id)
    if muted:
        query = query.filter(~Feed_alert.alert_type.in_(muted))
    if before_id:
        pivot = database.query(Feed_alert).filter(
            Feed_alert.id == int(before_id),
            Feed_alert.receiver_id == current_user.id,
        ).first()
        if pivot and pivot.created_at:
            query = query.filter(
                or_(
                    Feed_alert.created_at < pivot.created_at,
                    and_(Feed_alert.created_at == pivot.created_at, Feed_alert.id < pivot.id),
                )
            )
        else:
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
    owner_ids = set()
    for row in rows:
        ctx = parse_alert_context(row.context) or {}
        owner_id = ctx.get("owner_id")
        if owner_id is None:
            continue
        try:
            owner_ids.add(int(owner_id))
        except (TypeError, ValueError):
            pass
    senders = {}
    servers = {}
    extra_users = {}
    load_ids = set(sender_ids) | owner_ids
    if load_ids:
        for user in database.query(UserInfo).filter(UserInfo.id.in_(load_ids)).all():
            extra_users[user.id] = user
            if user.id in sender_ids:
                senders[user.id] = user
    if server_ids:
        for server in database.query(Servers).filter(Servers.id.in_(server_ids)).all():
            servers[server.id] = server
    alerts = [
        serialize_feed_alert(row, senders.get(row.sender_id), servers.get(row.server_id), extra_users)
        for row in rows
    ]
    decorate_feed_alerts(database, alerts, current_user.id)
    return {"alerts": alerts}


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
