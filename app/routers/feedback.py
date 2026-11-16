from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import UserInfo, Feedback_report, Feedback_event, Feed_alert
from app.schemas import Feedback_submit, Feedback_reply_in
from app.database import get_db, SessionLocal
from app.auth import get_current_user
from app.routers.account import public_display_name
from app.r2 import (
    ALLOWED_MIME,
    FEEDBACK_KEY_RE,
    max_upload_bytes,
    normalize_mime,
    public_url_for,
)
import json

router = APIRouter()

FEEDBACK_TYPES = {
    "bug": "Bug Report",
    "feature": "Feature Request",
    "inquiry": "General Inquiries",
    "report": "Report",
}
REPORT_KINDS = {
    "harassment": "Harassment",
    "privacy": "Privacy",
    "scam": "Scam",
    "inappropriate": "Inappropriate content",
    "other": "Other",
}
FEEDBACK_TEXT_MIN = 10
FEEDBACK_TEXT_MAX = 1500
FEEDBACK_FILE_MAX = 3
CONTEXT_VIEWS = ("home", "server", "profile", "settings", "room", "post", "phone")
FEEDBACK_SCORE_BASE = {
    "inquiry": 1,
    "feature": 2,
    "bug": 3,
    "report": 4,
}


def clean_feedback_text(value):
    text = (value or "").replace("\r\n", "\n").strip()
    if len(text) < FEEDBACK_TEXT_MIN:
        raise HTTPException(status_code=400, detail="Write at least 10 characters.")
    if len(text) > FEEDBACK_TEXT_MAX:
        raise HTTPException(status_code=400, detail="Feedback is over the character limit.")
    return text


def clean_feedback_type(value):
    key = (value or "").strip().lower()
    if key not in FEEDBACK_TYPES:
        raise HTTPException(status_code=400, detail="Choose a feedback category.")
    return key


def clean_report_kind(category, value):
    if category != "report":
        return None
    key = (value or "").strip().lower()
    if key not in REPORT_KINDS:
        raise HTTPException(status_code=400, detail="Choose a report type.")
    return key


def feedback_file_count(raw):
    if not raw:
        return 0
    if isinstance(raw, list):
        return min(FEEDBACK_FILE_MAX, len(raw))
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return 0
    if isinstance(data, list):
        return min(FEEDBACK_FILE_MAX, len(data))
    return 0


def feedback_score(category, text, file_count):
    key = (category or "").strip().lower()
    base = FEEDBACK_SCORE_BASE.get(key, 1)
    if key != "report":
        return base
    n = len((text or "").replace("\r\n", "\n").strip())
    detail = 0
    if n >= 1500:
        detail = 3
    elif n >= 1000:
        detail = 2
    elif n >= 500:
        detail = 1
    files = max(0, min(FEEDBACK_FILE_MAX, int(file_count or 0)))
    score = base + files + detail
    if score > 10:
        return 10
    if score < 1:
        return 1
    return score


def backfill_feedback_scores():
    database = SessionLocal()
    try:
        rows = database.query(Feedback_report).filter(Feedback_report.report_score.is_(None)).all()
        if not rows:
            return
        for row in rows:
            row.report_score = feedback_score(
                row.feedback_type,
                row.report,
                feedback_file_count(row.attachments),
            )
        database.commit()
    except Exception:
        database.rollback()
    finally:
        database.close()


def store_feedback_attachments(atts, user):
    if not atts:
        return None
    if len(atts) > FEEDBACK_FILE_MAX:
        raise HTTPException(status_code=400, detail="At most 3 files.")
    packed = []
    for att in atts:
        mime = normalize_mime(att.mime)
        if mime not in ALLOWED_MIME:
            raise HTTPException(status_code=400, detail="File type not allowed.")
        kind = ALLOWED_MIME[mime][1]
        if kind == "audio":
            raise HTTPException(status_code=400, detail="Feedback cannot take mp3 files.")
        cap = max_upload_bytes(user, "feedback", mime)
        if att.size < 1 or att.size > cap:
            raise HTTPException(status_code=400, detail="File too large.")
        if not FEEDBACK_KEY_RE.match(att.key):
            raise HTTPException(status_code=400, detail="Invalid upload key.")
        expected_ext = ALLOWED_MIME[mime][0]
        if not att.key.endswith(expected_ext):
            raise HTTPException(status_code=400, detail="Upload key does not match type.")
        name = (att.name or "").replace("\\", "/").split("/")[-1][:200]
        packed.append({
            "key": att.key,
            "url": public_url_for(att.key),
            "kind": kind,
            "mime": mime,
            "size": att.size,
            "name": name,
        })
    return json.dumps(packed)


def clip_label(value, limit):
    text = (value or "").strip()
    if len(text) > limit:
        return text[:limit]
    return text or None


@router.post("/submit_feedback")
def submit_feedback(body: Feedback_submit, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    feedback_type = clean_feedback_type(body.feedback_type)
    report_kind = clean_report_kind(feedback_type, body.report_kind)
    report = clean_feedback_text(body.report)
    attachments = store_feedback_attachments(body.attachments, current_user)
    score = feedback_score(feedback_type, report, feedback_file_count(body.attachments))
    view = (body.context_view or "").strip().lower()
    if view not in CONTEXT_VIEWS:
        view = "home"
    if view == "phone":
        from app.routers.community_phone import active_phone_call, phone_other_id
        call = active_phone_call(database, current_user.id)
        partner = database.query(UserInfo).filter(UserInfo.id == phone_other_id(call, current_user.id)).first() if call else None
        if partner:
            body.server_name = public_display_name(partner)
            body.channel_id = partner.id
            body.channel_name = "@" + (partner.username or "")
    row = Feedback_report(
        user_id=current_user.id,
        username=current_user.username,
        display_name=public_display_name(current_user),
        feedback_type=feedback_type,
        report_kind=report_kind,
        report_score=score,
        report=report,
        attachments=attachments,
        status="new",
        context_view=view,
        server_id=clip_label(body.server_id, 10),
        server_name=clip_label(body.server_name, 80),
        channel_id=body.channel_id if isinstance(body.channel_id, int) and body.channel_id > 0 else None,
        channel_name=clip_label(body.channel_name, 80),
        channel_type=clip_label(body.channel_type, 32),
    )
    database.add(row)
    database.commit()
    database.refresh(row)
    return {"id": row.id, "status": row.status}


@router.post("/feedback/{report_id}/reply")
async def reply_feedback_request(
    report_id: int,
    body: Feedback_reply_in,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    from app.routers.feed import emit_feed_alert_ws, parse_alert_context, serialize_feed_alert, decorate_feed_alerts
    text = (body.text or "").replace("\r\n", "\n").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Write a reply.")
    if len(text) > FEEDBACK_TEXT_MAX:
        raise HTTPException(status_code=400, detail="Reply is over the character limit.")
    row = database.query(Feedback_report).filter(Feedback_report.id == report_id).first()
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Report not found.")
    if not row.requests_info:
        raise HTTPException(status_code=400, detail="This request is closed.")
    latest = (
        database.query(Feedback_event)
        .filter(Feedback_event.report_id == row.id, Feedback_event.kind == "requests_info")
        .order_by(Feedback_event.id.desc())
        .first()
    )
    if not latest:
        raise HTTPException(status_code=400, detail="This request is closed.")
    later = (
        database.query(Feedback_event)
        .filter(
            Feedback_event.report_id == row.id,
            Feedback_event.kind == "user_reply",
            Feedback_event.id > latest.id,
        )
        .first()
    )
    if later:
        raise HTTPException(status_code=400, detail="This request is closed.")
    alert = None
    if body.alert_id:
        alert = database.query(Feed_alert).filter(
            Feed_alert.id == body.alert_id,
            Feed_alert.receiver_id == current_user.id,
            Feed_alert.alert_type == "requests_info",
        ).first()
        ctx = parse_alert_context(alert.context) if alert else {}
        try:
            event_id = int((ctx or {}).get("event_id") or 0)
        except (TypeError, ValueError):
            event_id = 0
        if not alert or event_id != latest.id:
            raise HTTPException(status_code=400, detail="This request is closed.")
    database.add(Feedback_event(
        report_id=row.id,
        actor_id=current_user.id,
        actor_username=current_user.username or "",
        kind="user_reply",
        text=json.dumps({"report": text}),
    ))
    row.requests_info = False
    if alert:
        ctx = parse_alert_context(alert.context) or {}
        ctx["reply_text"] = text
        alert.context = json.dumps(ctx)
    database.commit()
    packed = None
    if alert:
        database.refresh(alert)
        await emit_feed_alert_ws(database, alert)
        sender = database.query(UserInfo).filter(UserInfo.id == alert.sender_id).first() if alert.sender_id else None
        packed = serialize_feed_alert(alert, sender)
        decorate_feed_alerts(database, [packed], current_user.id)
    return {"ok": True, "alert": packed}
