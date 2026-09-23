from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import UserInfo, Feedback_report
from app.schemas import Feedback_submit
from app.database import get_db
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
}
FEEDBACK_TEXT_MIN = 10
FEEDBACK_TEXT_MAX = 1500
FEEDBACK_FILE_MAX = 3
CONTEXT_VIEWS = ("home", "server", "profile", "settings")


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
        raise HTTPException(status_code=400, detail="Choose a feedback type.")
    return key


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
    report = clean_feedback_text(body.report)
    attachments = store_feedback_attachments(body.attachments, current_user)
    view = (body.context_view or "").strip().lower()
    if view not in CONTEXT_VIEWS:
        view = "home"
    row = Feedback_report(
        user_id=current_user.id,
        username=current_user.username,
        display_name=public_display_name(current_user),
        feedback_type=feedback_type,
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
