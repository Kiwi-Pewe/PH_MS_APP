from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.models import UserInfo
from app.auth import get_current_user
from app.r2 import (
    ALLOWED_MIME,
    PROFILE_IMAGE_MIME,
    PROFILE_VIDEO_MIME,
    max_upload_bytes,
    new_object_key,
    normalize_mime,
    presign_put,
    public_url_for,
    r2_is_configured,
)

router = APIRouter()


class UploadIntent(BaseModel):
    content_type: str
    size: int
    filename: str = ""
    purpose: str = "chat"


@router.post("/upload_intent")
def upload_intent(body: UploadIntent, current_user: UserInfo = Depends(get_current_user)):
    mime = normalize_mime(body.content_type)
    purpose = (body.purpose or "chat").strip().lower()
    if purpose not in ("chat", "profile"):
        purpose = "chat"
    if mime not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="File type not allowed. Use jpeg, png, gif, webp, mp4, or webm.")
    if purpose == "profile" and mime not in PROFILE_IMAGE_MIME and mime not in PROFILE_VIDEO_MIME:
        raise HTTPException(status_code=400, detail="Profile files must be jpeg, png, gif, webp, mp4, or webm.")
    cap = max_upload_bytes(current_user, purpose, mime)
    if body.size < 1 or body.size > cap:
        raise HTTPException(status_code=400, detail=f"File too large. Max is {cap // (1024 * 1024)} MB.")
    if not r2_is_configured():
        raise HTTPException(status_code=503, detail="File uploads are not configured.")

    key, kind = new_object_key(mime, purpose)
    return {
        "upload_url": presign_put(key, mime if mime != "image/jpg" else "image/jpeg"),
        "key": key,
        "public_url": public_url_for(key),
        "kind": kind,
        "mime": mime if mime != "image/jpg" else "image/jpeg",
        "max_bytes": cap,
    }
