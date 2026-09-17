from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import re
from app.models import UserInfo
from app.schemas import Appearance_prefs
from app.database import get_db
from app.auth import get_current_user
from app.privacy import flag_on

router = APIRouter()

THEME_IDS = {
    "midnight-purple", "light", "midnight", "paper", "cyberpunk", "retrowave",
    "forest", "ocean", "ume", "copper", "terminal", "organs", "lavender",
    "gpt", "claude", "cute", "ash", "custom",
}
BRIGHTNESS_IDS = {"dark", "light"}
SEARCH_STYLES = {"compact", "fullscreen", "auto"}
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


def clean_hex(value):
    text = (value or "").strip()
    if HEX.fullmatch(text):
        return text.lower()
    return ""


def appearance_payload(user):
    theme = (user.appearance_theme or "").strip()
    if theme not in THEME_IDS:
        theme = "midnight-purple"
    brightness = (user.appearance_brightness or "").strip()
    if brightness not in BRIGHTNESS_IDS:
        brightness = "dark"
    search_style = (user.appearance_search or "").strip()
    if search_style not in SEARCH_STYLES:
        search_style = "auto"
    return {
        "theme": theme,
        "brightness": brightness,
        "color_bg": clean_hex(user.appearance_color_bg),
        "color_surface": clean_hex(user.appearance_color_surface),
        "color_accent": clean_hex(user.appearance_color_accent),
        "color_highlight": clean_hex(user.appearance_color_highlight),
        "show_link_media": flag_on(user, "appearance_show_link_media", True),
        "show_uploads": flag_on(user, "appearance_show_uploads", True),
        "show_embeds": flag_on(user, "appearance_show_embeds", True),
        "show_reactions": flag_on(user, "appearance_show_reactions", True),
        "show_send": bool(user.appearance_show_send) if user.appearance_show_send is not None else False,
        "search_style": search_style,
    }


@router.get("/appearance_settings")
def get_appearance_settings(current_user: UserInfo = Depends(get_current_user)):
    return appearance_payload(current_user)


@router.post("/appearance_settings")
def update_appearance_settings(prefs: Appearance_prefs, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    theme = (prefs.theme or "").strip()
    if theme not in THEME_IDS:
        raise HTTPException(status_code=400, detail="Pick a valid theme.")
    brightness = (prefs.brightness or "").strip()
    if brightness not in BRIGHTNESS_IDS:
        raise HTTPException(status_code=400, detail="Pick a valid brightness.")
    search_style = (prefs.search_style or "").strip()
    if search_style not in SEARCH_STYLES:
        raise HTTPException(status_code=400, detail="Pick a valid search layout.")
    colors = [
        clean_hex(prefs.color_bg),
        clean_hex(prefs.color_surface),
        clean_hex(prefs.color_accent),
        clean_hex(prefs.color_highlight),
    ]
    if theme == "custom" and not all(colors):
        raise HTTPException(status_code=400, detail="Custom themes need four colors.")
    current_user.appearance_theme = theme
    current_user.appearance_brightness = brightness
    current_user.appearance_color_bg = colors[0] or None
    current_user.appearance_color_surface = colors[1] or None
    current_user.appearance_color_accent = colors[2] or None
    current_user.appearance_color_highlight = colors[3] or None
    current_user.appearance_show_link_media = bool(prefs.show_link_media)
    current_user.appearance_show_uploads = bool(prefs.show_uploads)
    current_user.appearance_show_embeds = bool(prefs.show_embeds)
    current_user.appearance_show_reactions = bool(prefs.show_reactions)
    current_user.appearance_show_send = bool(prefs.show_send)
    current_user.appearance_search = search_style
    database.commit()
    return appearance_payload(current_user)
