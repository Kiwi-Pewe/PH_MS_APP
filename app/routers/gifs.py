from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from urllib.parse import urlencode
from urllib.request import Request as UrlRequest, urlopen
from urllib.error import HTTPError, URLError
import json

from app.models import UserInfo, Gif_settings
from app.schemas import Gif_connect
from app.database import get_db
from app.auth import get_current_user

router = APIRouter()

GIPHY_SEARCH = "https://api.giphy.com/v1/gifs/search"
GIPHY_TRENDING = "https://api.giphy.com/v1/gifs/trending"
GIF_PAGE = 24


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


def giphy_get(url):
    request = UrlRequest(url, headers={"User-Agent": "Oneira"})
    try:
        with urlopen(request, timeout=8) as response:
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
