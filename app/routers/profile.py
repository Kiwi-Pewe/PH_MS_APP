from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
import json
import re
import uuid
import random
import colorsys
from app.models import UserInfo, Friend_request
from app.schemas import Profile_layout_in, Profile_identity_in
from app.database import get_db
from app.auth import get_current_user
from app.privacy import can_see_full_profile
from app.routers.account import parse_display_name_history

router = APIRouter()

GRID_COLS = 32
OLD_GRID_COLS = 12
TILE_TYPES = {
    "banner", "avatar", "display_name", "member_since", "bio", "friends", "header", "body", "footnote", "list",
    "divider", "spacer", "link_tree",
    "spoiler", "stats", "callout", "button",
    "details", "interests", "looking_for", "fun_facts", "schedule", "setup",
    "connections", "featured_friend", "mutuals",
    "frame", "color_block", "icon", "meter", "clock", "countdown",
    "image", "video", "music", "twitch", "gallery", "slideshow", "youtube", "gif", "artwork",
    "comments", "server_list", "featured_server",
    "achievements", "recently_played", "favorite_game", "currently_playing",
    "want_to_play", "games_played", "game_stats", "library", "review",
}
PAGE_VIS = {"public", "owner"}
HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
BIO_MAX = 1000
HEADER_MAX = 120
FOOTNOTE_MAX = 300
LIST_ITEM_MAX = 200
LIST_MAX_ITEMS = 20
LINK_MAX = 12
LINK_USER_MAX = 32
LINK_URL_MAX = 500
TITLE_MAX = 32
STATUS_MAX = 80
PRONOUNS_MAX = 32
HEADER_LEVELS = {1, 2, 3}
LIST_STYLES = {"bullet", "number"}
DIVIDER_STYLES = {"solid", "dashed", "dotted"}
CALLOUT_TONES = {"tip", "warning"}
STAT_MAX_ROWS = 20
STAT_FIELD_MAX = 80
BUTTON_ACTIONS = {"link", "page", "friend"}
BUTTON_LABEL_MAX = 48
TEXT_SIZES = (8, 9, 10, 11, 12, 14, 18, 24)
TEXT_ALIGNS = {"left", "center", "right"}
BORDER_STYLES = {"solid", "dashed", "dotted", "double"}
LINK_PLATFORMS = (
    "YouTube", "Twitch", "Steam", "Discord", "X", "Instagram", "TikTok",
    "GitHub", "Spotify", "Reddit", "Roblox", "Battle.net", "PlayStation",
    "Patreon", "Bluesky", "Crunchyroll", "eBay", "Other",
)

STARTER_PAGES = (
    ("profile", "Profile", "public"),
    ("games", "Games", "public"),
    ("media", "Media", "public"),
    ("servers", "Servers", "owner"),
    ("friends", "Friends", "owner"),
    ("applications", "Applications", "owner"),
    ("events", "Events", "owner"),
)

# Midnight Purple background family sits around hue 265.
PURPLE_HUE_MIN = 250
PURPLE_HUE_MAX = 285


def new_id(prefix):
    return prefix + "_" + uuid.uuid4().hex[:10]


def public_display_name(user):
    return (user.display_name or user.username or "").strip() or user.username


def random_banner_hex():
    for _ in range(24):
        hue = random.random()
        deg = hue * 360
        if PURPLE_HUE_MIN <= deg <= PURPLE_HUE_MAX:
            continue
        sat = 0.45 + random.random() * 0.40
        light = 0.32 + random.random() * 0.20
        r, g, b = colorsys.hls_to_rgb(hue, light, sat)
        return "#{:02x}{:02x}{:02x}".format(int(r * 255), int(g * 255), int(b * 255))
    return "#1e6b8a"


# Bounds are (min_w, min_h, max_w, max_h).
def tile_bounds(kind):
    return {
        "banner": (6, 3, 32, 5),
        "avatar": (2, 2, 4, 4),
        "display_name": (3, 2, 5, 5),
        "member_since": (4, 2, 10, 3),
        "bio": (6, 5, 14, 6),
        "friends": (4, 11, 6, 15),
        "header": (4, 1, 32, 3),
        "body": (6, 2, 32, 12),
        "footnote": (4, 1, 32, 3),
        "list": (6, 3, 20, 16),
        "divider": (6, 1, 32, 2),
        "spacer": (2, 1, 32, 8),
        "link_tree": (5, 6, 8, 12),
        "spoiler": (6, 2, 20, 10),
        "stats": (6, 2, 20, 10),
        "callout": (6, 2, 24, 8),
        "button": (4, 2, 16, 3),
        "details": (6, 3, 16, 10),
        "interests": (6, 2, 20, 8),
        "looking_for": (6, 2, 16, 8),
        "fun_facts": (6, 3, 16, 12),
        "schedule": (6, 2, 16, 8),
        "setup": (6, 2, 16, 10),
        "connections": (8, 4, 16, 14),
        "featured_friend": (6, 3, 12, 8),
        "mutuals": (6, 3, 16, 12),
        "frame": (6, 4, 32, 18),
        "color_block": (2, 2, 32, 12),
        "icon": (2, 2, 6, 6),
        "meter": (6, 1, 24, 4),
        "clock": (4, 2, 12, 5),
        "countdown": (6, 2, 16, 6),
        "image": (4, 3, 24, 16),
        "video": (8, 4, 24, 16),
        "music": (6, 3, 20, 8),
        "twitch": (8, 4, 24, 16),
        "gallery": (8, 4, 24, 16),
        "slideshow": (8, 4, 24, 16),
        "youtube": (8, 4, 24, 16),
        "gif": (4, 3, 16, 12),
        "artwork": (6, 4, 20, 16),
        "comments": (8, 5, 24, 18),
        "server_list": (8, 4, 16, 18),
        "featured_server": (8, 4, 16, 10),
        "achievements": (8, 3, 24, 12),
        "recently_played": (6, 3, 20, 10),
        "favorite_game": (6, 3, 20, 10),
        "currently_playing": (6, 3, 20, 10),
        "want_to_play": (6, 3, 20, 12),
        "games_played": (8, 3, 24, 12),
        "game_stats": (6, 3, 16, 10),
        "library": (8, 4, 24, 14),
        "review": (6, 3, 16, 10),
    }.get(kind, (1, 1, GRID_COLS, 24))


def default_sizes(kind):
    return {
        "banner": (32, 3),
        "avatar": (4, 4),
        "display_name": (5, 2),
        "member_since": (6, 2),
        "bio": (14, 5),
        "friends": (6, 11),
        "header": (16, 2),
        "body": (14, 4),
        "footnote": (12, 1),
        "list": (10, 6),
        "divider": (32, 1),
        "spacer": (8, 2),
        "link_tree": (8, 10),
        "spoiler": (10, 3),
        "stats": (10, 4),
        "callout": (12, 3),
        "button": (8, 2),
        "details": (10, 5),
        "interests": (10, 3),
        "looking_for": (10, 3),
        "fun_facts": (10, 5),
        "schedule": (10, 3),
        "setup": (10, 4),
        "connections": (10, 6),
        "featured_friend": (8, 4),
        "mutuals": (10, 5),
        "frame": (12, 8),
        "color_block": (8, 4),
        "icon": (3, 3),
        "meter": (10, 2),
        "clock": (6, 3),
        "countdown": (8, 3),
        "image": (10, 6),
        "video": (12, 7),
        "music": (10, 4),
        "twitch": (12, 7),
        "gallery": (12, 6),
        "slideshow": (12, 6),
        "youtube": (12, 7),
        "gif": (8, 6),
        "artwork": (10, 7),
        "comments": (12, 8),
        "server_list": (10, 8),
        "featured_server": (10, 5),
        "achievements": (12, 5),
        "recently_played": (10, 4),
        "favorite_game": (10, 5),
        "currently_playing": (10, 4),
        "want_to_play": (10, 5),
        "games_played": (12, 5),
        "game_stats": (10, 5),
        "library": (12, 6),
        "review": (10, 5),
    }.get(kind, (8, 3))


def seed_layout():
    banner = random_banner_hex()
    return {
        "grid_cols": GRID_COLS,
        "pages": [
            {
                "id": page_id,
                "title": title,
                "visibility": vis,
                "tiles": default_profile_tiles(banner) if page_id == "profile" else [],
            }
            for page_id, title, vis in STARTER_PAGES
        ]
    }


def default_profile_tiles(banner_hex):
    return [
        {"id": new_id("tile"), "type": "banner", "x": 0, "y": 0, "w": 32, "h": 3, "props": {"color": banner_hex}, "allow_overlap": False},
        {"id": new_id("tile"), "type": "avatar", "x": 14, "y": 3, "w": 4, "h": 4, "props": {}, "allow_overlap": True},
        {"id": new_id("tile"), "type": "display_name", "x": 13, "y": 6, "w": 5, "h": 2, "props": {}, "allow_overlap": True},
        {"id": new_id("tile"), "type": "bio", "x": 7, "y": 10, "w": 14, "h": 5, "props": {"text": ""}, "allow_overlap": False},
        {"id": new_id("tile"), "type": "friends", "x": 26, "y": 10, "w": 6, "h": 11, "props": {}, "allow_overlap": False},
    ]


def scale_tile_cols(tile, from_cols, to_cols):
    if from_cols == to_cols or from_cols < 1:
        return tile
    out = dict(tile)
    try:
        x = int(out.get("x") or 0)
    except (TypeError, ValueError):
        x = 0
    try:
        w = int(out.get("w") or 1)
    except (TypeError, ValueError):
        w = 1
    out["x"] = int(round(x * to_cols / from_cols))
    out["w"] = max(1, int(round(w * to_cols / from_cols)))
    if out["x"] + out["w"] > to_cols:
        out["x"] = max(0, to_cols - out["w"])
    return out


def layout_col_count(data):
    if not isinstance(data, dict) or "grid_cols" not in data:
        return OLD_GRID_COLS
    try:
        cols = int(data.get("grid_cols"))
    except (TypeError, ValueError):
        return OLD_GRID_COLS
    return cols if cols > 0 else OLD_GRID_COLS


def tiles_overlap(a, b):
    return not (a["x"] + a["w"] <= b["x"] or b["x"] + b["w"] <= a["x"] or a["y"] + a["h"] <= b["y"] or b["y"] + b["h"] <= a["y"])


def tile_blocked(tile, others):
    hits = [other for other in others if tiles_overlap(tile, other)]
    return [other for other in hits if not tile.get("allow_overlap") and not other.get("allow_overlap")]


def find_open_spot(kept, tile):
    w = tile["w"]
    h = tile["h"]
    max_y = max((row["y"] + row["h"] for row in kept), default=0) + 12
    for y in range(0, max_y + 1):
        for x in range(0, GRID_COLS - w + 1):
            probe = dict(tile, x=x, y=y)
            if not tile_blocked(probe, kept):
                return x, y
    return None


def clamp_int(value, lo, hi, fallback):
    try:
        num = int(value)
    except (TypeError, ValueError):
        return fallback
    if num < lo:
        return lo
    if num > hi:
        return hi
    return num


def clean_hex(value, fallback):
    text = str(value or "").strip()
    if HEX_COLOR.match(text):
        return text.lower()
    return fallback


def clip_text(value, cap):
    text = str(value or "")
    if len(text) > cap:
        return text[:cap]
    return text


def normalize_list_items(data):
    items = []
    raw = data.get("items")
    if isinstance(raw, list):
        source = raw
    else:
        source = str(data.get("text") or "").split("\n")
    for row in source:
        items.append(clip_text(row, LIST_ITEM_MAX))
        if len(items) >= LIST_MAX_ITEMS:
            break
    return items


def normalize_stat_rows(data):
    rows = []
    raw = data.get("rows")
    if not isinstance(raw, list):
        return rows
    for row in raw:
        if not isinstance(row, dict):
            continue
        label = clip_text(row.get("label"), STAT_FIELD_MAX).strip()
        value = clip_text(row.get("value"), STAT_FIELD_MAX).strip()
        if not label and not value:
            continue
        rows.append({"label": label, "value": value})
        if len(rows) >= STAT_MAX_ROWS:
            break
    return rows


def clean_link_url(value):
    text = str(value or "").strip()
    if not text:
        return ""
    if "://" not in text:
        text = "https://" + text
    lower = text.lower()
    if not (lower.startswith("https://") or lower.startswith("http://")):
        return ""
    if any(ch in text for ch in (" ", "<", ">", '"', "'")):
        return ""
    return text[:LINK_URL_MAX]


def normalize_links(data):
    out = []
    raw = data.get("links")
    if not isinstance(raw, list):
        return out
    allowed = set(LINK_PLATFORMS)
    for row in raw:
        if not isinstance(row, dict):
            continue
        url = clean_link_url(row.get("url"))
        if not url:
            continue
        platform = clip_text(row.get("platform"), 32).strip() or "Other"
        if platform not in allowed:
            platform = platform[:32]
        username = clip_text(row.get("username"), LINK_USER_MAX).strip()
        out.append({"platform": platform, "username": username, "url": url})
        if len(out) >= LINK_MAX:
            break
    return out


def snap_text_size(value, default=14):
    try:
        size = int(value)
    except (TypeError, ValueError):
        size = default
    if size in TEXT_SIZES:
        return size
    return min(TEXT_SIZES, key=lambda item: abs(item - size))


def normalize_text_chrome(data, default_size=14, default_surface=False):
    if "text_size" in data:
        size = snap_text_size(data.get("text_size"), default_size)
    else:
        try:
            old = int(data.get("text_scale") or 0)
        except (TypeError, ValueError):
            old = 0
        size = {1: 12, 2: 14, 3: 18}.get(old, default_size)
    align = str(data.get("text_align") or "left")
    if align not in TEXT_ALIGNS:
        align = "left"
    if "show_background" in data:
        show_bg = bool(data.get("show_background"))
    else:
        show_bg = bool(default_surface)
    if "show_border" in data:
        show_border = bool(data.get("show_border"))
    else:
        show_border = False
    out = {
        "text_size": size,
        "text_align": align,
        "show_background": show_bg,
        "show_border": show_border,
    }
    out.update(normalize_border_look(data, 1))
    return out


def normalize_border_look(data, default_width=1):
    style = str(data.get("border_style") or "solid").lower()
    if style not in BORDER_STYLES:
        style = "solid"
    return {
        "border_width": clamp_int(data.get("border_width"), 1, 10, default_width),
        "border_color": clean_hex(data.get("border_color"), "#ffffff"),
        "border_style": style,
    }


def normalize_border_props(data):
    out = {"show_border": bool(data.get("show_border"))}
    out.update(normalize_border_look(data, 3))
    return out


def normalize_props(kind, props, banner_fallback):
    data = props if isinstance(props, dict) else {}
    if kind == "banner":
        out = {
            "color": clean_hex(data.get("color"), banner_fallback or random_banner_hex()),
        }
        out.update(normalize_border_props(data))
        return out
    if kind == "avatar":
        return normalize_border_props(data)
    if kind == "display_name":
        out = {
            "show_status": bool(data.get("show_status")),
            "show_pronouns": bool(data.get("show_pronouns")),
        }
        out.update(normalize_border_props(data))
        return out
    if kind == "bio":
        out = normalize_text_chrome(data, 14, True)
        out["text"] = clip_text(data.get("text"), BIO_MAX)
        return out
    if kind == "header":
        try:
            level = int(data.get("level") or 1)
        except (TypeError, ValueError):
            level = 1
        if level not in HEADER_LEVELS:
            level = 1
        out = normalize_text_chrome(data, 18, False)
        out["text"] = clip_text(data.get("text"), HEADER_MAX)
        out["level"] = level
        return out
    if kind == "body":
        out = normalize_text_chrome(data, 14, True)
        out["text"] = clip_text(data.get("text"), BIO_MAX)
        return out
    if kind == "footnote":
        out = normalize_text_chrome(data, 12, False)
        out["text"] = clip_text(data.get("text"), FOOTNOTE_MAX)
        return out
    if kind == "list":
        style = str(data.get("style") or "bullet")
        if style not in LIST_STYLES:
            style = "bullet"
        out = normalize_text_chrome(data, 14, True)
        out["style"] = style
        out["items"] = normalize_list_items(data)
        return out
    if kind == "spoiler":
        out = normalize_text_chrome(data, 14, True)
        out["title"] = clip_text(data.get("title"), SPOILER_TITLE_MAX)
        out["text"] = clip_text(data.get("text"), BIO_MAX)
        out["start_open"] = bool(data.get("start_open"))
        return out
    if kind == "stats":
        out = normalize_text_chrome(data, 14, True)
        out["rows"] = normalize_stat_rows(data)
        return out
    if kind == "callout":
        tone = str(data.get("tone") or "tip")
        if tone not in CALLOUT_TONES:
            tone = "tip"
        out = normalize_text_chrome(data, 14, True)
        out["text"] = clip_text(data.get("text"), FOOTNOTE_MAX)
        out["tone"] = tone
        return out
    if kind == "button":
        action = str(data.get("action") or "link")
        if action not in BUTTON_ACTIONS:
            action = "link"
        out = normalize_text_chrome(data, 14, True)
        out["label"] = clip_text(data.get("label"), BUTTON_LABEL_MAX).strip() or "Button"
        out["action"] = action
        out["url"] = clean_link_url(data.get("url")) if action == "link" else ""
        out["page_id"] = clip_text(data.get("page_id"), 40).strip() if action == "page" else ""
        return out
    if kind == "divider":
        style = str(data.get("style") or "solid")
        if style not in DIVIDER_STYLES:
            style = "solid"
        out = normalize_text_chrome(data, 14, False)
        out["style"] = style
        return out
    if kind == "spacer":
        return normalize_text_chrome(data, 14, False)
    if kind == "link_tree":
        out = normalize_text_chrome(data, 14, True)
        out["links"] = normalize_links(data)
        out["link_size"] = clamp_int(data.get("link_size"), 1, 10, 5)
        return out
    if kind == "friends":
        out = normalize_text_chrome(data, 14, True)
        out["friend_size"] = clamp_int(data.get("friend_size"), 1, 10, 5)
        return out
    if kind == "member_since":
        return normalize_text_chrome(data, 14, True)
    return normalize_text_chrome(data, 14, True)


def normalize_tile(raw, used_ids, banner_fallback):
    data = raw if isinstance(raw, dict) else {}
    kind = str(data.get("type") or "")
    if kind not in TILE_TYPES:
        return None
    tile_id = str(data.get("id") or "").strip() or new_id("tile")
    if tile_id in used_ids:
        tile_id = new_id("tile")
    used_ids.add(tile_id)
    default_w, default_h = default_sizes(kind)
    min_w, min_h, max_w, max_h = tile_bounds(kind)
    w = clamp_int(data.get("w"), min_w, min(max_w, GRID_COLS), default_w)
    h = clamp_int(data.get("h"), min_h, max_h, default_h)
    x = clamp_int(data.get("x"), 0, GRID_COLS - 1, 0)
    y = clamp_int(data.get("y"), 0, 80, 0)
    if x + w > GRID_COLS:
        x = max(0, GRID_COLS - w)
    return {
        "id": tile_id,
        "type": kind,
        "x": x,
        "y": y,
        "w": w,
        "h": h,
        "allow_overlap": bool(data.get("allow_overlap")),
        "props": normalize_props(kind, data.get("props"), banner_fallback),
    }


def normalize_page(raw, used_page_ids, banner_fallback):
    data = raw if isinstance(raw, dict) else {}
    page_id = str(data.get("id") or "").strip() or new_id("page")
    if page_id in used_page_ids:
        page_id = new_id("page")
    used_page_ids.add(page_id)
    title = str(data.get("title") or "Page").strip() or "Page"
    if len(title) > TITLE_MAX:
        title = title[:TITLE_MAX]
    vis = str(data.get("visibility") or "public")
    if vis not in PAGE_VIS:
        vis = "public"
    used_tile_ids = set()
    tiles = []
    for row in data.get("tiles") or []:
        tile = normalize_tile(row, used_tile_ids, banner_fallback)
        if tile:
            tiles.append(tile)
    kept = []
    for tile in tiles:
        if tile_blocked(tile, kept):
            spot = find_open_spot(kept, tile)
            if not spot:
                continue
            tile["x"], tile["y"] = spot
        kept.append(tile)
    return {"id": page_id, "title": title, "visibility": vis, "tiles": kept}


def normalize_layout(raw):
    data = raw if isinstance(raw, dict) else {}
    pages_in = data.get("pages")
    if not isinstance(pages_in, list) or not pages_in:
        return seed_layout()
    from_cols = layout_col_count(data)
    if from_cols != GRID_COLS:
        scaled = []
        for page in pages_in:
            if not isinstance(page, dict):
                continue
            copy = dict(page)
            copy["tiles"] = [
                scale_tile_cols(tile, from_cols, GRID_COLS) if isinstance(tile, dict) else tile
                for tile in (copy.get("tiles") or [])
            ]
            scaled.append(copy)
        pages_in = scaled
    used_page_ids = set()
    banner_fallback = random_banner_hex()
    for page in pages_in:
        if not isinstance(page, dict):
            continue
        for tile in page.get("tiles") or []:
            if isinstance(tile, dict) and tile.get("type") == "banner":
                color = clean_hex((tile.get("props") or {}).get("color") if isinstance(tile.get("props"), dict) else "", "")
                if color:
                    banner_fallback = color
                    break
    pages = []
    for row in pages_in:
        page = normalize_page(row, used_page_ids, banner_fallback)
        if page:
            pages.append(page)
    if not pages:
        return seed_layout()
    return {"grid_cols": GRID_COLS, "pages": pages}


def parse_layout(user):
    raw = {}
    try:
        raw = json.loads(user.profile_layout or "{}")
    except (TypeError, ValueError):
        raw = {}
    if not isinstance(raw, dict) or not raw.get("pages"):
        return None
    return normalize_layout(raw)


def ensure_layout(user, database: Session):
    raw = {}
    try:
        raw = json.loads(user.profile_layout or "{}")
    except (TypeError, ValueError):
        raw = {}
    layout = parse_layout(user)
    if not layout:
        layout = seed_layout()
        user.profile_layout = json.dumps(layout)
        database.commit()
        return layout
    if layout_col_count(raw) != GRID_COLS:
        user.profile_layout = json.dumps(layout)
        database.commit()
    return layout


def public_pages(layout):
    return {
        "grid_cols": GRID_COLS,
        "pages": [page for page in (layout.get("pages") or []) if page.get("visibility") != "owner"]
    }


def identity_only_layout(layout):
    source = None
    for page in layout.get("pages") or []:
        if page.get("id") == "profile":
            source = page
            break
    if not source and layout.get("pages"):
        source = layout["pages"][0]
    keep_types = {"banner", "avatar", "display_name", "member_since"}
    tiles = [tile for tile in (source.get("tiles") or []) if tile.get("type") in keep_types] if source else []
    return {
        "grid_cols": GRID_COLS,
        "pages": [{
            "id": "profile",
            "title": "Profile",
            "visibility": "public",
            "tiles": tiles,
        }]
    }


def member_since_iso(user):
    dt = getattr(user, "created_at", None)
    if not dt:
        return ""
    if isinstance(dt, str):
        return dt
    try:
        return dt.isoformat()
    except Exception:
        return ""


def friend_preview(database: Session, owner_id, limit=8):
    rows = database.query(Friend_request).filter(
        or_(Friend_request.user_1 == owner_id, Friend_request.user_2 == owner_id),
        Friend_request.pending == False
    ).all()
    out = []
    for row in rows:
        other_id = row.user_2 if row.user_1 == owner_id else row.user_1
        other = database.query(UserInfo).filter(UserInfo.id == other_id).first()
        if not other:
            continue
        out.append({
            "id": other.id,
            "username": other.username,
            "display_name": public_display_name(other),
        })
        if len(out) >= limit:
            break
    return out


def profile_payload(user, layout, limited, friends):
    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "display_name": public_display_name(user),
            "status": clip_text(user.profile_status, STATUS_MAX),
            "pronouns": clip_text(user.profile_pronouns, PRONOUNS_MAX),
            "aliases": parse_display_name_history(user),
            "member_since": member_since_iso(user),
        },
        "limited": bool(limited),
        "layout": layout,
        "friends": friends if not limited else [],
    }


@router.post("/profile_identity")
def update_own_profile_identity(body: Profile_identity_in, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    current_user.profile_status = clip_text(body.status, STATUS_MAX).strip()
    current_user.profile_pronouns = clip_text(body.pronouns, PRONOUNS_MAX).strip()
    database.commit()
    layout = ensure_layout(current_user, database)
    return profile_payload(current_user, layout, False, friend_preview(database, current_user.id))


@router.get("/profile_layout")
def get_own_profile_layout(current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    layout = ensure_layout(current_user, database)
    return profile_payload(current_user, layout, False, friend_preview(database, current_user.id))


@router.post("/profile_layout")
def update_own_profile_layout(body: Profile_layout_in, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    layout = normalize_layout(body.model_dump())
    current_user.profile_layout = json.dumps(layout)
    database.commit()
    return profile_payload(current_user, layout, False, friend_preview(database, current_user.id))


@router.get("/profile/{user_id}")
def get_public_profile(user_id: int, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    owner = database.query(UserInfo).filter(UserInfo.id == user_id).first()
    if not owner:
        raise HTTPException(status_code=404, detail="User not found.")
    layout = ensure_layout(owner, database)
    if current_user.id == owner.id:
        return profile_payload(owner, layout, False, friend_preview(database, owner.id))
    if not can_see_full_profile(database, current_user, owner):
        return profile_payload(owner, identity_only_layout(layout), True, [])
    return profile_payload(owner, public_pages(layout), False, friend_preview(database, owner.id))
