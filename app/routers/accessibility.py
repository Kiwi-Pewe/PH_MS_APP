from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import json
from app.models import UserInfo
from app.schemas import Accessibility_prefs
from app.database import get_db
from app.auth import get_current_user

router = APIRouter()

UI_DENSITY = {"compact", "default", "spacious"}
CHAT_DISPLAY = {"default", "compact"}
ROLE_COLORS = {"names", "next", "off"}
OFFICIAL_MESSAGES = {"default", "role", "off"}
STICKER_ANIM = {"always", "interaction", "never"}


def clamp(value, low, high, fallback):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    if number < low:
        return low
    if number > high:
        return high
    return number


def accessibility_defaults():
    return {
        "text_size": 15,
        "underline_links": False,
        "display_name_styles": False,
        "ui_density": "default",
        "chat_display": "default",
        "group_spacing": 20,
        "zoom": 100,
        "saturation": 100,
        "saturation_custom": False,
        "high_contrast": False,
        "sync_contrast": True,
        "role_colors": "names",
        "official_messages": "default",
        "toggle_indicators": False,
        "reduced_motion": False,
        "sync_motion": True,
        "gifs_when_focused": True,
        "animated_emoji": True,
        "sticker_anim": "always",
        "tts_rate": 1.0,
        "image_descriptions": False,
        "legacy_input": False,
    }


def normalize_accessibility(raw):
    data = raw if isinstance(raw, dict) else {}
    out = accessibility_defaults()
    out["text_size"] = int(clamp(data.get("text_size"), 12, 24, 15))
    out["underline_links"] = bool(data.get("underline_links", False))
    out["display_name_styles"] = bool(data.get("display_name_styles", False))
    density = str(data.get("ui_density") or "default")
    out["ui_density"] = density if density in UI_DENSITY else "default"
    chat = str(data.get("chat_display") or "default")
    out["chat_display"] = chat if chat in CHAT_DISPLAY else "default"
    out["group_spacing"] = int(clamp(data.get("group_spacing"), 0, 24, 20))
    out["zoom"] = int(clamp(data.get("zoom"), 50, 200, 100))
    out["saturation"] = int(clamp(data.get("saturation"), 0, 100, 100))
    out["saturation_custom"] = bool(data.get("saturation_custom", False))
    out["high_contrast"] = bool(data.get("high_contrast", False))
    out["sync_contrast"] = bool(data.get("sync_contrast", True)) if "sync_contrast" in data else True
    roles = str(data.get("role_colors") or "names")
    out["role_colors"] = roles if roles in ROLE_COLORS else "names"
    official = str(data.get("official_messages") or "default")
    out["official_messages"] = official if official in OFFICIAL_MESSAGES else "default"
    out["toggle_indicators"] = bool(data.get("toggle_indicators", False))
    out["reduced_motion"] = bool(data.get("reduced_motion", False))
    out["sync_motion"] = bool(data.get("sync_motion", True)) if "sync_motion" in data else True
    out["gifs_when_focused"] = bool(data.get("gifs_when_focused", True)) if "gifs_when_focused" in data else True
    out["animated_emoji"] = bool(data.get("animated_emoji", True)) if "animated_emoji" in data else True
    sticker = str(data.get("sticker_anim") or "always")
    out["sticker_anim"] = sticker if sticker in STICKER_ANIM else "always"
    out["tts_rate"] = round(float(clamp(data.get("tts_rate"), 0.5, 2, 1)), 1)
    out["image_descriptions"] = bool(data.get("image_descriptions", False))
    out["legacy_input"] = bool(data.get("legacy_input", False))
    return out


def accessibility_payload(user):
    raw = {}
    try:
        raw = json.loads(user.accessibility_prefs or "{}")
    except (TypeError, ValueError):
        raw = {}
    return normalize_accessibility(raw)


@router.get("/accessibility_settings")
def get_accessibility_settings(current_user: UserInfo = Depends(get_current_user)):
    return accessibility_payload(current_user)


@router.post("/accessibility_settings")
def update_accessibility_settings(prefs: Accessibility_prefs, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    normalized = normalize_accessibility(prefs.model_dump())
    current_user.accessibility_prefs = json.dumps(normalized)
    database.commit()
    return normalized
