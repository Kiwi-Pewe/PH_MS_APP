from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
import json
import re
import uuid
import random
import colorsys
from app.models import UserInfo, Friend_request
from app.schemas import Profile_layout_in
from app.database import get_db
from app.auth import get_current_user
from app.privacy import can_see_full_profile

router = APIRouter()

GRID_COLS = 32
OLD_GRID_COLS = 12
TILE_TYPES = {"banner", "avatar", "display_name", "bio", "friends"}
PAGE_VIS = {"public", "owner"}
HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
BIO_MAX = 1000
TITLE_MAX = 32

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
        "display_name": (3, 2, 5, 3),
        "bio": (6, 5, 14, 6),
        "friends": (4, 11, 6, 15),
    }.get(kind, (1, 1, GRID_COLS, 24))


def default_sizes(kind):
    return {
        "banner": (32, 3),
        "avatar": (4, 4),
        "display_name": (5, 2),
        "bio": (14, 5),
        "friends": (6, 11),
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


def normalize_props(kind, props, banner_fallback):
    data = props if isinstance(props, dict) else {}
    if kind == "banner":
        return {"color": clean_hex(data.get("color"), banner_fallback or random_banner_hex())}
    if kind == "bio":
        text = str(data.get("text") or "")
        if len(text) > BIO_MAX:
            text = text[:BIO_MAX]
        return {"text": text}
    return {}


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
    keep_types = {"banner", "avatar", "display_name"}
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
        },
        "limited": bool(limited),
        "layout": layout,
        "friends": friends if not limited else [],
    }


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
