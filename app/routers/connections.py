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
import asyncio
import json
import os
import re
import secrets
import time

from app.auth import validate_session
from app.database import SessionLocal, get_db
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
    level_payload = steam_json("/IPlayerService/GetSteamLevel/v1/", {"steamid": steamid})
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
        "player_xp_needed_current_level": badge_body.get("player_xp_needed_current_level"),
        "lastlogoff": summary.get("lastlogoff"),
        "timecreated": summary.get("timecreated"),
        "loccountrycode": clip(summary.get("loccountrycode"), 8),
        "locstatecode": clip(str(summary.get("locstatecode") or ""), 16),
        "loccityid": clip(str(summary.get("loccityid") or ""), 16),
        "primaryclanid": clip(str(summary.get("primaryclanid") or ""), 32),
        "profile_ready": True,
        "recently_played": [trim_game(row, True) for row in recent_rows[:100]],
        "owned_games": [trim_game(row, False) for row in owned_rows[:5000]],
        "badges": badges,
    }
    return name, avatar, profile or ("https://steamcommunity.com/profiles/" + steamid), cache


def steam_cache(raw):
    try:
        data = json.loads(raw or "")
    except Exception:
        data = {}
    return data if isinstance(data, dict) else {}


def steam_number(value):
    try:
        if value is None or value == "":
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def refresh_steam_profile_cache(database, row):
    cache = steam_cache(row.cache)
    if cache.get("profile_ready"):
        return cache
    steamid = row.external_id or cache.get("steamid") or ""
    summary = {}
    payload = steam_json("/ISteamUser/GetPlayerSummaries/v0002/", {"steamids": steamid}) if steamid else None
    players = ((payload or {}).get("response") or {}).get("players") or []
    if players:
        summary = players[0]
    level_payload = steam_json("/IPlayerService/GetSteamLevel/v1/", {"steamid": steamid}) if steamid else None
    level = ((level_payload or {}).get("response") or {}).get("player_level")
    badge_payload = steam_json("/IPlayerService/GetBadges/v1/", {"steamid": steamid}) if steamid else None
    badge_body = (badge_payload or {}).get("response") or {}
    if summary.get("personaname"):
        cache["personaname"] = clip(summary.get("personaname"), 64)
        row.display_name = cache["personaname"]
    if summary.get("avatarfull"):
        cache["avatar"] = clip(summary.get("avatarfull"), 300)
        row.avatar_url = cache["avatar"]
    if summary.get("profileurl"):
        cache["profileurl"] = clip(summary.get("profileurl"), 300)
        row.profile_url = cache["profileurl"]
    cache["personastate"] = summary.get("personastate")
    cache["communityvisibilitystate"] = summary.get("communityvisibilitystate")
    cache["lastlogoff"] = summary.get("lastlogoff")
    cache["timecreated"] = summary.get("timecreated")
    cache["loccountrycode"] = clip(summary.get("loccountrycode"), 8)
    cache["locstatecode"] = clip(str(summary.get("locstatecode") or ""), 16)
    cache["loccityid"] = clip(str(summary.get("loccityid") or ""), 16)
    cache["primaryclanid"] = clip(str(summary.get("primaryclanid") or ""), 32)
    if level is not None:
        cache["level"] = level
    cache["player_xp"] = badge_body.get("player_xp")
    cache["player_xp_needed_to_level_up"] = badge_body.get("player_xp_needed_to_level_up")
    cache["player_xp_needed_current_level"] = badge_body.get("player_xp_needed_current_level")
    cache["profile_ready"] = True
    row.cache = json.dumps(cache)
    row.refreshed_at = datetime.now()
    database.commit()
    return cache


def steam_state_name(code):
    text = str(code or "").strip()
    if not text or text.isdigit():
        return ""
    return text[:32]


def steam_card_payload(cache, parts):
    public = steam_number(cache.get("communityvisibilitystate")) == 3
    country = clip(cache.get("loccountrycode"), 8) if public else ""
    state = steam_state_name(cache.get("locstatecode")) if public else ""
    online = steam_number(cache.get("personastate"))
    last_logoff = steam_number(cache.get("lastlogoff"))
    created = steam_number(cache.get("timecreated"))
    level = steam_number(cache.get("level"))
    xp = steam_number(cache.get("player_xp"))
    xp_next = steam_number(cache.get("player_xp_needed_to_level_up"))
    xp_floor = steam_number(cache.get("player_xp_needed_current_level"))
    visibility = steam_number(cache.get("communityvisibilitystate"))
    name = clip(cache.get("personaname"), 64)
    link = clip(cache.get("profileurl"), 300)
    avatar = clip(cache.get("avatar"), 300)
    return {
        "linked": True,
        "identity": bool(parts.get("identity")),
        "level": bool(parts.get("level_badges")),
        "public": public,
        "name": name,
        "profile_url": link,
        "avatar": avatar,
        "persona_state": online,
        "visibility": visibility,
        "last_logoff": last_logoff,
        "time_created": created,
        "country": country,
        "state": state,
        "player_level": level,
        "player_xp": xp,
        "xp_to_next": xp_next,
        "xp_floor": xp_floor,
        "available": {
            "name": bool(name),
            "link": bool(link),
            "avatar": bool(avatar),
            "online": public and online is not None,
            "last_logoff": public and bool(last_logoff),
            "created": public and bool(created),
            "visibility": visibility is not None,
            "country": public and bool(country),
            "state": public and bool(state),
            "city": False,
            "group": False,
            "level": public and level is not None,
            "xp": public and xp is not None,
            "xp_next": public and xp_next is not None,
        },
    }


def steam_playing_payload(cache, parts):
    appid = str(cache.get("playing_appid") or "").strip()
    since = steam_number(cache.get("playing_since"))
    minutes = 0
    if appid and since:
        elapsed = int(time.time()) - since
        if elapsed >= 300:
            minutes = (elapsed // 300) * 5
    return {
        "linked": True,
        "playing": bool(parts.get("playing_now")),
        "in_game": bool(appid),
        "name": clip(cache.get("playing_name"), 120) if appid else "",
        "appid": appid,
        "minutes": minutes,
    }


def load_steam_playing(database, user_id):
    row = database.query(Account_connection).filter(
        Account_connection.user_id == user_id,
        Account_connection.provider == "steam",
    ).first()
    if not row:
        return {"linked": False, "playing": False, "in_game": False, "name": "", "appid": "", "minutes": 0}
    return steam_playing_payload(steam_cache(row.cache), read_parts(row.parts))


def apply_playing_snapshot(cache, player):
    if steam_number(player.get("communityvisibilitystate")) != 3:
        return False
    gameid = str(player.get("gameid") or "").strip()
    if gameid:
        name = clip(player.get("gameextrainfo"), 120)
        changed = False
        if str(cache.get("playing_appid") or "") != gameid:
            cache["playing_appid"] = gameid
            cache["playing_since"] = int(time.time())
            changed = True
        if name and cache.get("playing_name") != name:
            cache["playing_name"] = name
            changed = True
        return changed
    if cache.get("playing_appid") or cache.get("playing_since") or cache.get("playing_name"):
        cache.pop("playing_appid", None)
        cache.pop("playing_name", None)
        cache.pop("playing_since", None)
        return True
    return False


def check_steam_playing_once():
    database = SessionLocal()
    try:
        rows = database.query(Account_connection).filter(Account_connection.provider == "steam").all()
        watched = []
        for row in rows:
            if not read_parts(row.parts).get("playing_now"):
                continue
            steamid = str(row.external_id or "").strip()
            if steamid:
                watched.append((row, steamid))
        for start in range(0, len(watched), 100):
            chunk = watched[start:start + 100]
            payload = steam_json("/ISteamUser/GetPlayerSummaries/v0002/", {"steamids": ",".join(sid for _, sid in chunk)})
            if not payload:
                continue
            players = ((payload.get("response") or {}).get("players") or [])
            by_id = {str(player.get("steamid") or ""): player for player in players}
            for row, steamid in chunk:
                player = by_id.get(steamid)
                if not player:
                    continue
                cache = steam_cache(row.cache)
                if apply_playing_snapshot(cache, player):
                    row.cache = json.dumps(cache)
                    row.refreshed_at = datetime.now()
        database.commit()
    finally:
        database.close()


async def check_steam_playing():
    await asyncio.sleep(3)
    while True:
        try:
            await asyncio.to_thread(check_steam_playing_once)
        except Exception:
            pass
        await asyncio.sleep(300)


def load_steam_card(database, user_id):
    row = database.query(Account_connection).filter(
        Account_connection.user_id == user_id,
        Account_connection.provider == "steam",
    ).first()
    if not row:
        return {"linked": False, "identity": False, "level": False, "available": {}}
    cache = refresh_steam_profile_cache(database, row)
    return steam_card_payload(cache, read_parts(row.parts))


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
