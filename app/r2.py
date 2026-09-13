# R2 helpers: presign, validate, store JSON, public URL.
# Max bytes is one lookup so a later tier is a new number, not a rewrite.
import json
import os
import re
import uuid
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

ALLOWED_MIMES = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
}

KEY_RE = re.compile(
    r"^u(\d+)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\."
    r"(jpg|png|gif|webp|mp4|webm)$"
)


def max_upload_bytes(_user=None):
    return 20 * 1024 * 1024


def r2_configured():
    return bool(
        os.getenv("R2_ACCOUNT_ID")
        and os.getenv("R2_ACCESS_KEY_ID")
        and os.getenv("R2_SECRET_ACCESS_KEY")
        and os.getenv("R2_BUCKET")
    )


def _client():
    if not r2_configured():
        raise HTTPException(status_code=503, detail="File storage is not configured")
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def public_base():
    return (os.getenv("R2_PUBLIC_BASE") or "").rstrip("/")


def require_message_body(content, attachment):
    text = (content or "").strip()
    if not text and attachment is None:
        raise HTTPException(status_code=400, detail="Message is empty")


def require_post_body(title, body, attachment):
    if not (title or "").strip():
        raise HTTPException(status_code=400, detail="Title is required")
    if not (body or "").strip() and attachment is None:
        raise HTTPException(status_code=400, detail="Post needs a body or a file")


def presign_put(user, mime, size, name=""):
    mime = (mime or "").lower().strip()
    ext = ALLOWED_MIMES.get(mime)
    if not ext:
        raise HTTPException(status_code=400, detail="File type not allowed")
    if size < 1 or size > max_upload_bytes(user):
        raise HTTPException(status_code=400, detail="File is too large")
    if not r2_configured():
        raise HTTPException(status_code=503, detail="File storage is not configured")

    key = f"u{user.id}/{uuid.uuid4()}.{ext}"
    upload_url = _client().generate_presigned_url(
        "put_object",
        Params={
            "Bucket": os.environ["R2_BUCKET"],
            "Key": key,
            "ContentType": mime,
        },
        ExpiresIn=300,
    )
    base = public_base()
    return {
        "upload_url": upload_url,
        "key": key,
        "public_url": f"{base}/{key}" if base else "",
        "max_bytes": max_upload_bytes(user),
    }


def store_attachment(attachment, user):
    if attachment is None:
        return None
    mime = (attachment.mime or "").lower().strip()
    if mime not in ALLOWED_MIMES:
        raise HTTPException(status_code=400, detail="File type not allowed")
    if attachment.size < 1 or attachment.size > max_upload_bytes(user):
        raise HTTPException(status_code=400, detail="File is too large")
    match = KEY_RE.fullmatch(attachment.key or "")
    if not match or match.group(1) != str(user.id):
        raise HTTPException(status_code=400, detail="Invalid file key")
    if ALLOWED_MIMES[mime] != match.group(2):
        raise HTTPException(status_code=400, detail="File type does not match key")
    name = (attachment.name or "")[:100]
    return json.dumps({
        "key": attachment.key,
        "mime": mime,
        "size": attachment.size,
        "name": name,
    })


def attachment_public(raw):
    if not raw:
        return None
    if isinstance(raw, dict):
        data = dict(raw)
    else:
        try:
            data = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            return None
    key = data.get("key")
    base = public_base()
    if key and base:
        data["url"] = f"{base}/{key}"
    return data


def delete_attachment(raw):
    data = attachment_public(raw)
    if not data or not data.get("key") or not r2_configured():
        return
    try:
        _client().delete_object(Bucket=os.environ["R2_BUCKET"], Key=data["key"])
    except Exception:
        pass
