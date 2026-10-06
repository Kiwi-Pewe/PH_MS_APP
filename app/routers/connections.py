from fastapi import APIRouter, Cookie, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request as UrlRequest, urlopen
from xml.etree import ElementTree
from dotenv import load_dotenv
import json
import os
import re
import secrets

from app.auth import validate_session
from app.database import get_db
from app.models import Account_connection, Connection_nonce

router = APIRouter()

API_ORIGIN = "https://api.oneira.cc"
SITE_ORIGIN = "https://oneira.cc"
APP_RETURN = SITE_ORIGIN + "/main/app.html"
STEAM_RETURN_PATH = "/steam/callback.html"
STEAM_OPENID = "https://steamcommunity.com/openid/login"
STEAM_ID_RE = re.compile(r"^https://steamcommunity\.com/openid/id/(\d{17})$")
STEAM_PARTS = (
    "identity",
    "playing_now",
    "recently_played",
    "library",
    "achievements",
    "level_badges",
)
NONCE_MINUTES = 15
_ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"


class Connection_part(BaseModel):
    provider: str
    part: str
    enabled: bool


def steam_api_key():
    load_dotenv(_ENV_PATH, override=True)
    return (os.getenv("STEAM_WEB_API_KEY") or "").strip()


def default_parts():
    return {key: True for key in STEAM_PARTS}


def read_parts(raw):
    try:
        data = json.loads(raw or "")
    except Exception:
        data = {}
    if not isinstance(data, dict):
        data = {}
    parts = default_parts()
    for key in STEAM_PARTS:
        if key in data:
            parts[key] = bool(data[key])
    return parts


def connection_public(row):
    return {
        "provider": row.provider,
        "name": (row.display_name or "").strip() or "Steam user",
        "parts": read_parts(row.parts),
    }


def app_redirect(error=""):
    url = APP_RETURN + "?connection=steam"
    if error:
        url += "&error=" + error
    return RedirectResponse(url)


def drop_expired_nonces(database: Session):
    cutoff = datetime.now() - timedelta(minutes=NONCE_MINUTES)
    database.query(Connection_nonce).filter(Connection_nonce.created_at < cutoff).delete()
    database.commit()


def steam_request(url, data=None, limit=500000):
    body = None
    headers = {"User-Agent": "Oneira"}
    if data is not None:
        body = urlencode(data).encode("utf-8")
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    outgoing = UrlRequest(url, data=body, headers=headers)
    with urlopen(outgoing, timeout=20) as response:
        return response.read(limit)


def steam_json(path, query, limit=500000):
    key = steam_api_key()
    if not key:
        return None
    params = dict(query)
    params["key"] = key
    url = "https://api.steampowered.com" + path + "?" + urlencode(params)
    try:
        raw = steam_request(url, limit=limit)
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return None


def clip(value, limit):
    return (value or "").strip()[:limit]


def trim_game(row, recent):
    item = {
        "appid": int(row.get("appid") or 0),
        "name": clip(row.get("name"), 120),
        "icon": clip(row.get("img_icon_url"), 200),
        "playtime_forever": int(row.get("playtime_forever") or 0),
    }
    if recent:
        item["playtime_2weeks"] = int(row.get("playtime_2weeks") or 0)
    else:
        item["last_played"] = int(row.get("rtime_last_played") or 0)
    return item


def identity_from_xml(steamid):
    url = "https://steamcommunity.com/profiles/" + steamid + "/?xml=1"
    try:
        raw = steam_request(url, limit=200000)
        root = ElementTree.fromstring(raw)
    except Exception:
        return "", "", ""
    name = clip(root.findtext("steamID"), 64)
    avatar = clip(root.findtext("avatarFull"), 300)
    profile = "https://steamcommunity.com/profiles/" + steamid
    return name, avatar, profile


def steam_snapshot(steamid):
    summary = {}
    payload = steam_json("/ISteamUser/GetPlayerSummaries/v0002/", {"steamids": steamid})
    players = ((payload or {}).get("response") or {}).get("players") or []
    if players:
        summary = players[0]
    name = clip(summary.get("personaname"), 64)
    avatar = clip(summary.get("avatarfull"), 300)
    profile = clip(summary.get("profileurl"), 300)
    if not name:
        xml_name, xml_avatar, xml_profile = identity_from_xml(steamid)
        name = name or xml_name
        avatar = avatar or xml_avatar
        profile = profile or xml_profile
    level_payload = steam_json("/ISteamUser/GetSteamLevel/v1/", {"steamid": steamid})
    level = ((level_payload or {}).get("response") or {}).get("player_level")
    recent_payload = steam_json("/IPlayerService/GetRecentlyPlayedGames/v0001/", {"steamid": steamid})
    recent_rows = ((recent_payload or {}).get("response") or {}).get("games") or []
    owned_payload = steam_json(
        "/IPlayerService/GetOwnedGames/v0001/",
        {"steamid": steamid, "include_appinfo": 1, "include_played_free_games": 1},
        limit=2000000,
    )
    owned_rows = ((owned_payload or {}).get("response") or {}).get("games") or []
    badge_payload = steam_json("/IPlayerService/GetBadges/v1/", {"steamid": steamid})
    badge_body = (badge_payload or {}).get("response") or {}
    badges = []
    for row in (badge_body.get("badges") or [])[:200]:
        badges.append({
            "badgeid": row.get("badgeid"),
            "appid": row.get("appid"),
            "level": row.get("level"),
            "xp": row.get("xp"),
            "completion_time": row.get("completion_time"),
        })
    cache = {
        "steamid": steamid,
        "personaname": name,
        "profileurl": profile,
        "avatar": avatar,
        "personastate": summary.get("personastate"),
        "communityvisibilitystate": summary.get("communityvisibilitystate"),
        "gameid": clip(str(summary.get("gameid") or ""), 32),
        "gameextrainfo": clip(summary.get("gameextrainfo"), 120),
        "level": level,
        "player_xp": badge_body.get("player_xp"),
        "player_xp_needed_to_level_up": badge_body.get("player_xp_needed_to_level_up"),
        "recently_played": [trim_game(row, True) for row in recent_rows[:100]],
        "owned_games": [trim_game(row, False) for row in owned_rows[:5000]],
        "badges": badges,
    }
    return name, avatar, profile or ("https://steamcommunity.com/profiles/" + steamid), cache


def steam_is_valid(params):
    returned = params.get("openid.return_to") or ""
    allowed = (
        SITE_ORIGIN + STEAM_RETURN_PATH,
        API_ORIGIN + "/connections/steam/callback",
    )
    if not any(returned.startswith(prefix) for prefix in allowed):
        return ""
    claimed = params.get("openid.claimed_id") or ""
    match = STEAM_ID_RE.match(claimed)
    if not match:
        return ""
    check = {key: value for key, value in params.items() if key.startswith("openid.")}
    check["openid.mode"] = "check_authentication"
    try:
        raw = steam_request(STEAM_OPENID, data=check, limit=20000)
        text = raw.decode("utf-8", errors="replace")
    except Exception:
        return ""
    if "is_valid:true" not in text.replace(" ", ""):
        return ""
    return match.group(1)


def save_steam_link(database: Session, user_id, steamid):
    taken = database.query(Account_connection).filter(
        Account_connection.provider == "steam",
        Account_connection.external_id == steamid,
        Account_connection.user_id != user_id,
    ).first()
    if taken:
        return False
    name, avatar, profile, cache = steam_snapshot(steamid)
    row = database.query(Account_connection).filter(
        Account_connection.user_id == user_id,
        Account_connection.provider == "steam",
    ).first()
    now = datetime.now()
    if not row:
        row = Account_connection(
            user_id=user_id,
            provider="steam",
            external_id=steamid,
            parts=json.dumps(default_parts()),
            linked_at=now,
        )
        database.add(row)
    row.external_id = steamid
    row.display_name = name or "Steam user"
    row.avatar_url = avatar
    row.profile_url = profile
    row.cache = json.dumps(cache)
    row.refreshed_at = now
    database.commit()
    return True


@router.get("/connections")
def list_connections(session_id: str = Cookie(None), database: Session = Depends(get_db)):
    user = validate_session(session_id, database)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    rows = database.query(Account_connection).filter(Account_connection.user_id == user.id).all()
    return {"connections": [connection_public(row) for row in rows]}


@router.post("/connections/part")
def update_connection_part(body: Connection_part, session_id: str = Cookie(None), database: Session = Depends(get_db)):
    user = validate_session(session_id, database)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    provider = (body.provider or "").strip()
    part = (body.part or "").strip()
    if provider != "steam" or part not in STEAM_PARTS:
        raise HTTPException(status_code=400, detail="Unknown connection setting.")
    row = database.query(Account_connection).filter(
        Account_connection.user_id == user.id,
        Account_connection.provider == provider,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="That account is not connected.")
    parts = read_parts(row.parts)
    parts[part] = bool(body.enabled)
    row.parts = json.dumps(parts)
    database.commit()
    return {"parts": parts}


@router.delete("/connections/{provider}")
def delete_connection(provider: str, session_id: str = Cookie(None), database: Session = Depends(get_db)):
    user = validate_session(session_id, database)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    provider = (provider or "").strip()
    if provider != "steam":
        raise HTTPException(status_code=404, detail="That account is not connected.")
    row = database.query(Account_connection).filter(
        Account_connection.user_id == user.id,
        Account_connection.provider == provider,
    ).first()
    if row:
        database.delete(row)
        database.commit()
    return {"ok": True}


@router.get("/connections/steam/start")
def steam_start(session_id: str = Cookie(None), database: Session = Depends(get_db)):
    user = validate_session(session_id, database)
    if not user:
        return RedirectResponse("https://oneira.cc/login.html")
    drop_expired_nonces(database)
    nonce = secrets.token_urlsafe(24)
    database.add(Connection_nonce(nonce=nonce, user_id=user.id, created_at=datetime.now()))
    database.commit()
    return_to = SITE_ORIGIN + STEAM_RETURN_PATH + "?nonce=" + nonce
    query = urlencode({
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": return_to,
        "openid.realm": SITE_ORIGIN,
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    })
    return RedirectResponse(STEAM_OPENID + "?" + query)


@router.get("/connections/steam/callback")
def steam_callback(request: Request, session_id: str = Cookie(None), database: Session = Depends(get_db)):
    user = validate_session(session_id, database)
    if not user:
        return RedirectResponse("https://oneira.cc/login.html")
    params = {key: request.query_params.get(key) or "" for key in request.query_params.keys()}
    nonce = (params.get("nonce") or "").strip()
    drop_expired_nonces(database)
    pending = database.query(Connection_nonce).filter(Connection_nonce.nonce == nonce).first() if nonce else None
    if not pending or pending.user_id != user.id:
        return app_redirect("failed")
    if params.get("openid.mode") == "cancel":
        database.delete(pending)
        database.commit()
        return app_redirect("cancel")
    steamid = steam_is_valid(params)
    database.delete(pending)
    database.commit()
    if not steamid:
        return app_redirect("failed")
    try:
        saved = save_steam_link(database, user.id, steamid)
    except Exception:
        database.rollback()
        return app_redirect("failed")
    if not saved:
        return app_redirect("taken")
    return app_redirect()
