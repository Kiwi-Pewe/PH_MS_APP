from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from urllib.parse import urlencode
from urllib.request import Request as UrlRequest, urlopen
from urllib.error import HTTPError, URLError
import json
import random

from app.models import UserInfo, Gif_settings
from app.schemas import Gif_connect
from app.database import get_db
from app.auth import get_current_user

router = APIRouter()

GIPHY_SEARCH = "https://api.giphy.com/v1/gifs/search"
GIPHY_TRENDING = "https://api.giphy.com/v1/gifs/trending"
GIPHY_CATEGORIES = "https://api.giphy.com/v1/gifs/categories"
GIF_PAGE = 24
GIF_HOME_SECTIONS = 24


def require_oneira_admin(user):
    if (user.username or "").strip().lower() != "kiwi":
        raise HTTPException(status_code=403, detail="Admin Panel is not available.")
    return user


def gif_row(database):
    row = database.query(Gif_settings).filter(Gif_settings.id == 1).first()
    if row:
        return row
    row = Gif_settings(id=1)
    database.add(row)
    database.commit()
    database.refresh(row)
    return row


def gif_key(row):
    return ((row.api_key if row else "") or "").strip()


def pack_gif_status(row):
    return {
        "connected": bool(gif_key(row)),
        "connected_at": str(row.connected_at) if row and row.connected_at else None,
    }


def giphy_get(url, timeout=8):
    request = UrlRequest(url, headers={"User-Agent": "Oneira"})
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8") or "{}")
    except HTTPError as err:
        raise HTTPException(status_code=400, detail="GIPHY refused that request.") from err
    except URLError as err:
        raise HTTPException(status_code=400, detail="Could not reach GIPHY.") from err
    except (TypeError, ValueError, UnicodeDecodeError) as err:
        raise HTTPException(status_code=400, detail="GIPHY sent a bad response.") from err


def giphy_ok(key):
    if not key:
        return False
    url = GIPHY_TRENDING + "?" + urlencode({"api_key": key, "limit": "1", "rating": "pg-13"})
    try:
        data = giphy_get(url)
    except HTTPException:
        return False
    return isinstance(data, dict) and isinstance(data.get("data"), list)


def pack_gif_item(row):
    images = row.get("images") if isinstance(row, dict) else {}
    if not isinstance(images, dict):
        images = {}
    preview = images.get("fixed_width") or images.get("fixed_width_small") or images.get("preview_gif") or images.get("downsized_still") or {}
    full = images.get("downsized") or images.get("downsized_medium") or images.get("original") or preview or {}
    if not isinstance(preview, dict):
        preview = {}
    if not isinstance(full, dict):
        full = {}
    return {
        "id": str(row.get("id") or ""),
        "title": str(row.get("title") or ""),
        "preview": str(preview.get("url") or ""),
        "url": str(full.get("url") or ""),
    }


def pack_gif_section(name, gif_row):
    label = str(name or "").strip()
    item = pack_gif_item(gif_row if isinstance(gif_row, dict) else {})
    preview = item.get("preview") or item.get("url") or ""
    if not label or not preview:
        return None
    return {"name": label, "preview": preview}


def collect_gif_sections(rows):
    seen = set()
    out = []

    def add(name, gif_row):
        packed = pack_gif_section(name, gif_row)
        if not packed:
            return
        key = packed["name"].casefold()
        if key in seen:
            return
        seen.add(key)
        out.append(packed)

    for row in rows:
        if not isinstance(row, dict):
            continue
        gif = row.get("gif") if isinstance(row.get("gif"), dict) else {}
        add(row.get("name"), gif)
        subs = row.get("subcategories")
        if not isinstance(subs, list):
            continue
        for sub in subs:
            if not isinstance(sub, dict):
                continue
            sub_gif = sub.get("gif") if isinstance(sub.get("gif"), dict) else None
            if sub_gif:
                add(sub.get("name"), sub_gif)
    return out


@router.get("/admin/gifs")
def admin_gifs_status(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    return pack_gif_status(gif_row(database))


@router.post("/admin/gifs/connect")
def admin_gifs_connect(
    body: Gif_connect,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    key = (body.api_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="API key is required.")
    if len(key) > 200:
        raise HTTPException(status_code=400, detail="API key is too long.")
    if not giphy_ok(key):
        raise HTTPException(status_code=400, detail="That GIPHY key was refused.")
    row = gif_row(database)
    row.api_key = key
    row.connected_at = datetime.utcnow()
    database.commit()
    return pack_gif_status(row)


@router.post("/admin/gifs/disconnect")
def admin_gifs_disconnect(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    row = gif_row(database)
    row.api_key = None
    row.connected_at = None
    database.commit()
    return pack_gif_status(row)


@router.get("/gifs/status")
def gifs_status(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    return pack_gif_status(gif_row(database))


@router.get("/gifs/home")
def gifs_home(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    row = gif_row(database)
    key = gif_key(row)
    if not key:
        raise HTTPException(status_code=400, detail="GIF search is not connected.")
    cat_url = GIPHY_CATEGORIES + "?" + urlencode({"api_key": key})
    data = giphy_get(cat_url, timeout=12)
    rows = data.get("data") if isinstance(data, dict) else []
    if not isinstance(rows, list):
        rows = []
    sections = collect_gif_sections(rows)
    random.shuffle(sections)
    trending = {"name": "Trending GIFs", "preview": ""}
    try:
        trend_url = GIPHY_TRENDING + "?" + urlencode({"api_key": key, "limit": "1", "rating": "pg-13"})
        trend_data = giphy_get(trend_url)
        trend_rows = trend_data.get("data") if isinstance(trend_data, dict) else []
        if isinstance(trend_rows, list) and trend_rows:
            packed = pack_gif_item(trend_rows[0])
            trending["preview"] = packed.get("preview") or packed.get("url") or ""
    except HTTPException:
        pass
    return {
        "trending": trending,
        "sections": sections[:GIF_HOME_SECTIONS],
    }


@router.get("/gifs/search")
def gifs_search(
    q: str = Query(""),
    offset: int = Query(0),
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    row = gif_row(database)
    key = gif_key(row)
    if not key:
        raise HTTPException(status_code=400, detail="GIF search is not connected.")
    try:
        start = max(int(offset or 0), 0)
    except (TypeError, ValueError):
        start = 0
    query = (q or "").strip()
    params = {
        "api_key": key,
        "limit": str(GIF_PAGE),
        "offset": str(start),
        "rating": "pg-13",
    }
    if query:
        params["q"] = query
        url = GIPHY_SEARCH + "?" + urlencode(params)
    else:
        url = GIPHY_TRENDING + "?" + urlencode(params)
    data = giphy_get(url)
    rows = data.get("data") if isinstance(data, dict) else []
    if not isinstance(rows, list):
        rows = []
    gifs = [item for item in (pack_gif_item(row) for row in rows) if item.get("url")]
    paging = data.get("pagination") if isinstance(data, dict) else {}
    if not isinstance(paging, dict):
        paging = {}
    try:
        count = int(paging.get("count") or len(gifs))
    except (TypeError, ValueError):
        count = len(gifs)
    try:
        total = int(paging.get("total_count") or 0)
    except (TypeError, ValueError):
        total = 0
    return {
        "gifs": gifs,
        "offset": start,
        "next": start + count if start + count < total else None,
    }
