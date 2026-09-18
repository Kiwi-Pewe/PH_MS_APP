from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import json
from app.models import UserInfo
from app.schemas import Language_time_prefs
from app.database import get_db
from app.auth import get_current_user

router = APIRouter()

LANGUAGES = {"en-US"}
TIME_FORMATS = {"auto", "12", "24"}


def language_time_defaults():
    return {
        "language": "en-US",
        "time_format": "auto",
    }


def normalize_language_time(raw):
    data = raw if isinstance(raw, dict) else {}
    out = language_time_defaults()
    language = str(data.get("language") or "en-US")
    out["language"] = language if language in LANGUAGES else "en-US"
    clock = str(data.get("time_format") or "auto")
    out["time_format"] = clock if clock in TIME_FORMATS else "auto"
    return out


def language_time_payload(user):
    raw = {}
    try:
        raw = json.loads(user.language_time_prefs or "{}")
    except (TypeError, ValueError):
        raw = {}
    return normalize_language_time(raw)


@router.get("/language_time_settings")
def get_language_time_settings(current_user: UserInfo = Depends(get_current_user)):
    return language_time_payload(current_user)


@router.post("/language_time_settings")
def update_language_time_settings(prefs: Language_time_prefs, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    normalized = normalize_language_time(prefs.model_dump())
    current_user.language_time_prefs = json.dumps(normalized)
    database.commit()
    return normalized
