# R2 client, upload caps, and attachment JSON. One lookup for max bytes
# so a later tier is a new number, not a rewrite.
from fastapi import HTTPException
from botocore.config import Config
from datetime import datetime
from dotenv import load_dotenv
from pathlib import Path
import boto3
import json
import os
import re
import uuid

_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


def _env(name, default=""):
    load_dotenv(_ENV_PATH, override=True)
    return (os.getenv(name) or default).strip()


def _endpoint():
    explicit = _env("R2_ENDPOINT")
    if explicit:
        return explicit.rstrip("/")
    account = _env("R2_ACCOUNT_ID")
    return f"https://{account}.r2.cloudflarestorage.com" if account else ""


R2_ACCOUNT_ID = _env("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = _env("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = _env("R2_SECRET_ACCESS_KEY")
R2_BUCKET = _env("R2_BUCKET")
R2_ENDPOINT = _endpoint()
R2_PUBLIC_BASE = _env("R2_PUBLIC_BASE").rstrip("/")

BASE_UPLOAD_BYTES = 20 * 1024 * 1024

ALLOWED_MIME = {
    "image/jpeg": (".jpg", "image"),
    "image/jpg": (".jpg", "image"),
    "image/png": (".png", "image"),
    "image/gif": (".gif", "image"),
    "image/webp": (".webp", "image"),
    "video/mp4": (".mp4", "video"),
    "video/webm": (".webm", "video"),
}

KEY_RE = re.compile(
    r"^chat/\d{4}/\d{2}/\d{2}/[0-9a-f]{32}\.(jpg|png|gif|webp|mp4|webm)$"
)


def max_upload_bytes(user=None):
    return BASE_UPLOAD_BYTES


def r2_is_configured():
    return bool(
        _env("R2_ACCESS_KEY_ID")
        and _env("R2_SECRET_ACCESS_KEY")
        and _env("R2_BUCKET")
        and _endpoint()
        and _env("R2_PUBLIC_BASE")
    )


def normalize_mime(raw):
    return (raw or "").lower().split(";")[0].strip()


def public_url_for(key):
    return f"{_env('R2_PUBLIC_BASE').rstrip('/')}/{key}"


def new_object_key(mime):
    ext, kind = ALLOWED_MIME[mime]
    now = datetime.utcnow()
    key = f"chat/{now.year:04d}/{now.month:02d}/{now.day:02d}/{uuid.uuid4().hex}{ext}"
    return key, kind


def get_r2_client():
    if not r2_is_configured():
        raise HTTPException(status_code=503, detail="File uploads are not configured.")
    return boto3.client(
        "s3",
        endpoint_url=_endpoint(),
        aws_access_key_id=_env("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=_env("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    )


def presign_put(key, mime):
    client = get_r2_client()
    return client.generate_presigned_url(
        "put_object",
        Params={"Bucket": _env("R2_BUCKET"), "Key": key, "ContentType": mime},
        ExpiresIn=300,
    )


def require_message_body(content, attachment):
    if (content or "").strip() or attachment is not None:
        return
    raise HTTPException(status_code=400, detail="Message is empty.")


def store_attachment(att, user=None):
    if att is None:
        return None
    mime = normalize_mime(att.mime)
    if mime not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="File type not allowed.")
    cap = max_upload_bytes(user)
    if att.size < 1 or att.size > cap:
        raise HTTPException(status_code=400, detail="File too large.")
    if not KEY_RE.match(att.key):
        raise HTTPException(status_code=400, detail="Invalid upload key.")
    expected_ext = ALLOWED_MIME[mime][0]
    if not att.key.endswith(expected_ext):
        raise HTTPException(status_code=400, detail="Upload key does not match type.")
    _, kind = ALLOWED_MIME[mime]
    name = (att.name or "").replace("\\", "/").split("/")[-1][:200]
    return json.dumps({
        "key": att.key,
        "url": public_url_for(att.key),
        "kind": kind,
        "mime": mime,
        "size": att.size,
        "name": name,
    })


def attachment_public(raw):
    if not raw:
        return None
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


def delete_r2_object(key):
    if not key or not r2_is_configured():
        return
    try:
        get_r2_client().delete_object(Bucket=_env("R2_BUCKET"), Key=key)
    except Exception:
        pass
