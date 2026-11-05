from fastapi import APIRouter, Cookie, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from urllib.parse import urlencode
from urllib.request import Request as UrlRequest, urlopen
from urllib.error import HTTPError, URLError
from dotenv import load_dotenv
import json
import os
import secrets

from app.auth import validate_session
from app.database import get_db
from app.models import Account_connection, Connection_nonce
from app.routers.connections import (
    SITE_ORIGIN,
    _ENV_PATH,
    NONCE_MINUTES,
    clip,
    default_parts,
    drop_expired_nonces,
    app_redirect,
    read_parts,
)

router = APIRouter()

YOUTUBE_RETURN_PATH = "/youtube/callback.html"
GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
YOUTUBE_API = "https://www.googleapis.com/youtube/v3"
YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly"
LOGIN_PATH = "https://oneira.cc/login.html"


class Youtube_channel_pick(BaseModel):
    channel_id: str


def google_client():
    load_dotenv(_ENV_PATH, override=True)
    return (
        (os.getenv("GOOGLE_CLIENT_ID") or "").strip(),
        (os.getenv("GOOGLE_CLIENT_SECRET") or "").strip(),
        (os.getenv("YOUTUBE_API_KEY") or "").strip(),
    )


def youtube_redirect_uri():
    return SITE_ORIGIN + YOUTUBE_RETURN_PATH


def http_json(url, data=None, headers=None, limit=800000):
    body = None
    outgoing = {"User-Agent": "Oneira"}
    if headers:
        outgoing.update(headers)
    if data is not None:
        body = urlencode(data).encode("utf-8")
        outgoing["Content-Type"] = "application/x-www-form-urlencoded"
    request = UrlRequest(url, data=body, headers=outgoing)
    try:
        with urlopen(request, timeout=20) as response:
            raw = response.read(limit)
    except HTTPError as err:
        try:
            raw = err.read(limit)
        except Exception:
            return None
    except (URLError, TimeoutError, ValueError, OSError):
        return None
    try:
        payload = json.loads(raw.decode("utf-8"))
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def google_tokens_from_code(code):
    client_id, client_secret, _ = google_client()
    if not client_id or not client_secret or not code:
        return None
    return http_json(GOOGLE_TOKEN, {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": youtube_redirect_uri(),
        "grant_type": "authorization_code",
    })


def youtube_get(path, query, token):
    if not token:
        return None
    params = dict(query)
    url = YOUTUBE_API + path + "?" + urlencode(params)
    return http_json(url, headers={"Authorization": "Bearer " + token})


def thumb_url(thumbs):
    if not isinstance(thumbs, dict):
        return ""
    for key in ("high", "medium", "default"):
        row = thumbs.get(key)
        if isinstance(row, dict) and row.get("url"):
            return clip(row.get("url"), 400)
    return ""


def channel_profile_url(channel_id, custom):
    handle = clip(custom, 80)
    if handle.startswith("@"):
        return "https://www.youtube.com/" + handle
    if handle:
        return "https://www.youtube.com/" + handle.lstrip("/")
    if channel_id:
        return "https://www.youtube.com/channel/" + channel_id
    return ""


def channel_brief(item):
    snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
    channel_id = clip(item.get("id"), 64)
    return {
        "id": channel_id,
        "title": clip(snippet.get("title"), 120),
        "thumb": thumb_url(snippet.get("thumbnails")),
        "custom_url": clip(snippet.get("customUrl"), 80),
    }


def video_entry(item):
    snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
    stats = item.get("statistics") if isinstance(item.get("statistics"), dict) else {}
    details = item.get("contentDetails") if isinstance(item.get("contentDetails"), dict) else {}
    status = item.get("status") if isinstance(item.get("status"), dict) else {}
    video_id = clip(item.get("id"), 32)
    return {
        "id": video_id,
        "title": clip(snippet.get("title"), 160),
        "description": clip(snippet.get("description"), 1000),
        "thumb": thumb_url(snippet.get("thumbnails")),
        "published": clip(snippet.get("publishedAt"), 40),
        "duration": clip(details.get("duration"), 24),
        "views": clip(str(stats.get("viewCount") or ""), 24),
        "likes": clip(str(stats.get("likeCount") or ""), 24),
        "comments": clip(str(stats.get("commentCount") or ""), 24),
        "live": clip(snippet.get("liveBroadcastContent"), 16),
        "embeddable": False if status.get("embeddable") is False else True,
    }


def playlist_entry(item):
    snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
    details = item.get("contentDetails") if isinstance(item.get("contentDetails"), dict) else {}
    return {
        "id": clip(item.get("id"), 64),
        "title": clip(snippet.get("title"), 160),
        "thumb": thumb_url(snippet.get("thumbnails")),
        "count": int(details.get("itemCount") or 0),
        "privacy": clip((item.get("status") or {}).get("privacyStatus") if isinstance(item.get("status"), dict) else "", 16),
    }


def subscription_entry(item):
    snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
    resource = snippet.get("resourceId") if isinstance(snippet.get("resourceId"), dict) else {}
    return {
        "id": clip(resource.get("channelId"), 64),
        "title": clip(snippet.get("title"), 120),
        "thumb": thumb_url(snippet.get("thumbnails")),
    }


def activity_entry(item):
    snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
    return {
        "type": clip(snippet.get("type"), 40),
        "title": clip(snippet.get("title"), 160),
        "published": clip(snippet.get("publishedAt"), 40),
        "thumb": thumb_url(snippet.get("thumbnails")),
        "channel": clip(snippet.get("channelTitle"), 120),
    }


def shelf_entry(item):
    snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
    return {
        "id": clip(item.get("id"), 64),
        "title": clip(snippet.get("title"), 160),
        "type": clip(snippet.get("type"), 40),
    }


def live_entry(item):
    snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
    status = item.get("status") if isinstance(item.get("status"), dict) else {}
    return {
        "id": clip(item.get("id"), 64),
        "title": clip(snippet.get("title"), 160),
        "thumb": thumb_url(snippet.get("thumbnails")),
        "status": clip(status.get("lifeCycleStatus"), 24),
        "privacy": clip(status.get("privacyStatus"), 16),
        "scheduled": clip(snippet.get("scheduledStartTime"), 40),
        "started": clip(snippet.get("actualStartTime"), 40),
    }


def playlist_video_ids(token, playlist_id, limit=25):
    if not playlist_id:
        return []
    payload = youtube_get("/playlistItems", {
        "part": "snippet,contentDetails",
        "playlistId": playlist_id,
        "maxResults": min(limit, 50),
    }, token)
    ids = []
    for item in (payload or {}).get("items") or []:
        if not isinstance(item, dict):
            continue
        details = item.get("contentDetails") if isinstance(item.get("contentDetails"), dict) else {}
        snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
        resource = snippet.get("resourceId") if isinstance(snippet.get("resourceId"), dict) else {}
        video_id = clip(details.get("videoId") or resource.get("videoId"), 32)
        if video_id:
            ids.append(video_id)
    return ids


def videos_by_ids(token, ids):
    if not ids:
        return []
    payload = youtube_get("/videos", {
        "part": "snippet,statistics,contentDetails,status",
        "id": ",".join(ids[:50]),
        "maxResults": 50,
    }, token)
    rows = []
    for item in (payload or {}).get("items") or []:
        if isinstance(item, dict):
            rows.append(video_entry(item))
    return rows


def list_items(token, path, query, wrap):
    payload = youtube_get(path, query, token)
    rows = []
    for item in (payload or {}).get("items") or []:
        if isinstance(item, dict):
            rows.append(wrap(item))
    return rows


def youtube_identity_fields(channel):
    snippet = channel.get("snippet") if isinstance(channel.get("snippet"), dict) else {}
    stats = channel.get("statistics") if isinstance(channel.get("statistics"), dict) else {}
    branding = channel.get("brandingSettings") if isinstance(channel.get("brandingSettings"), dict) else {}
    brand_channel = branding.get("channel") if isinstance(branding.get("channel"), dict) else {}
    brand_image = branding.get("image") if isinstance(branding.get("image"), dict) else {}
    status = channel.get("status") if isinstance(channel.get("status"), dict) else {}
    details = channel.get("contentDetails") if isinstance(channel.get("contentDetails"), dict) else {}
    related = details.get("relatedPlaylists") if isinstance(details.get("relatedPlaylists"), dict) else {}
    topics = channel.get("topicDetails") if isinstance(channel.get("topicDetails"), dict) else {}
    channel_id = clip(channel.get("id"), 64)
    custom = clip(snippet.get("customUrl"), 80)
    return {
        "channel_id": channel_id,
        "title": clip(snippet.get("title"), 120),
        "description": clip(snippet.get("description"), 1000),
        "custom_url": custom,
        "published": clip(snippet.get("publishedAt"), 40),
        "thumb": thumb_url(snippet.get("thumbnails")),
        "banner": clip(brand_image.get("bannerExternalUrl"), 400),
        "country": clip(snippet.get("country") or brand_channel.get("country"), 8),
        "keywords": clip(brand_channel.get("keywords"), 500),
        "trailer": clip(brand_channel.get("unsubscribedTrailer"), 32),
        "topics": [clip(row, 200) for row in (topics.get("topicCategories") or []) if isinstance(row, str)][:12],
        "privacy": clip(status.get("privacyStatus"), 16),
        "made_for_kids": bool(status.get("madeForKids")),
        "subscribers": clip(str(stats.get("subscriberCount") or ""), 24),
        "hidden_subscribers": bool(stats.get("hiddenSubscriberCount")),
        "views": clip(str(stats.get("viewCount") or ""), 24),
        "video_count": clip(str(stats.get("videoCount") or ""), 24),
        "uploads_id": clip(related.get("uploads"), 64),
        "likes_id": clip(related.get("likes"), 64),
        "profile_url": channel_profile_url(channel_id, custom),
        "profile_ready": True,
    }


def youtube_snapshot(token, channel):
    data = youtube_identity_fields(channel)
    uploads_id = data.get("uploads_id") or ""
    likes_id = data.get("likes_id") or ""
    upload_ids = playlist_video_ids(token, uploads_id)
    like_ids = playlist_video_ids(token, likes_id)
    data.update({
        "uploads": videos_by_ids(token, upload_ids),
        "likes": videos_by_ids(token, like_ids),
        "playlists": list_items(token, "/playlists", {
            "part": "snippet,contentDetails,status",
            "mine": "true",
            "maxResults": 25,
        }, playlist_entry),
        "subscriptions": list_items(token, "/subscriptions", {
            "part": "snippet",
            "mine": "true",
            "maxResults": 25,
        }, subscription_entry),
        "live": list_items(token, "/liveBroadcasts", {
            "part": "snippet,status",
            "mine": "true",
            "maxResults": 25,
        }, live_entry),
        "activity": list_items(token, "/activities", {
            "part": "snippet,contentDetails",
            "mine": "true",
            "maxResults": 25,
        }, activity_entry),
        "shelves": list_items(token, "/channelSections", {
            "part": "snippet,contentDetails",
            "mine": "true",
            "maxResults": 25,
        }, shelf_entry),
        "comments": [],
        "live_chat": [],
        "super_chat": [],
        "memberships": [],
        "membership_levels": [],
        "profile_ready": True,
        "uploads_at": datetime.now().isoformat(),
    })
    return data


def apply_tokens(row, tokens, now):
    access = clip((tokens or {}).get("access_token"), 4000)
    refresh = clip((tokens or {}).get("refresh_token"), 4000)
    expires = int((tokens or {}).get("expires_in") or 3600)
    if access:
        row.access_token = access
    if refresh:
        row.refresh_token = refresh
    row.token_expires_at = now + timedelta(seconds=max(expires, 60))


def save_youtube_link(database: Session, user_id, channel, tokens):
    channel_id = clip(channel.get("id"), 64)
    if not channel_id:
        return False
    taken = database.query(Account_connection).filter(
        Account_connection.provider == "youtube",
        Account_connection.external_id == channel_id,
        Account_connection.user_id != user_id,
    ).first()
    if taken:
        return False
    snippet = channel.get("snippet") if isinstance(channel.get("snippet"), dict) else {}
    name = clip(snippet.get("title"), 120) or "YouTube channel"
    avatar = thumb_url(snippet.get("thumbnails"))
    profile = channel_profile_url(channel_id, snippet.get("customUrl"))
    access = clip((tokens or {}).get("access_token"), 4000)
    cache = youtube_snapshot(access, channel)
    row = database.query(Account_connection).filter(
        Account_connection.user_id == user_id,
        Account_connection.provider == "youtube",
    ).first()
    now = datetime.now()
    if not row:
        row = Account_connection(
            user_id=user_id,
            provider="youtube",
            external_id=channel_id,
            parts=json.dumps(default_parts("youtube")),
            linked_at=now,
        )
        database.add(row)
    row.external_id = channel_id
    row.display_name = name
    row.avatar_url = avatar
    row.profile_url = profile
    row.cache = json.dumps(cache)
    row.refreshed_at = now
    apply_tokens(row, tokens, now)
    database.commit()
    return True


def youtube_cache_dict(raw):
    try:
        data = json.loads(raw or "")
    except Exception:
        data = {}
    return data if isinstance(data, dict) else {}


def youtube_public(path, query):
    _, _, key = google_client()
    if not key:
        return None
    params = dict(query)
    params["key"] = key
    url = YOUTUBE_API + path + "?" + urlencode(params)
    payload = http_json(url)
    if not payload or payload.get("error"):
        return None
    return payload


def youtube_access_token(database, row):
    now = datetime.now()
    current = clip(row.access_token, 4000)
    if current and row.token_expires_at and row.token_expires_at > now + timedelta(seconds=60):
        return current
    if not row.refresh_token:
        return current
    client_id, client_secret, _ = google_client()
    if not client_id or not client_secret:
        return current
    payload = http_json(GOOGLE_TOKEN, {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": row.refresh_token,
        "grant_type": "refresh_token",
    })
    if not payload or not payload.get("access_token"):
        return current
    apply_tokens(row, payload, now)
    database.commit()
    return clip(row.access_token, 4000)


def youtube_channel_resource(token, channel_id):
    if not channel_id:
        return None
    query = {
        "part": "snippet,statistics,brandingSettings,contentDetails,status,topicDetails",
        "id": channel_id,
        "maxResults": 1,
    }
    payload = youtube_get("/channels", query, token) if token else None
    if payload and payload.get("error"):
        payload = None
    if not payload:
        payload = youtube_public("/channels", query)
    items = (payload or {}).get("items") or []
    if items and isinstance(items[0], dict):
        return items[0]
    return None


def refresh_youtube_identity_cache(database, row):
    cache = youtube_cache_dict(row.cache)
    now = datetime.now()
    if row.refreshed_at and (now - row.refreshed_at) < timedelta(minutes=5) and cache.get("profile_ready"):
        return cache
    channel_id = clip(row.external_id or cache.get("channel_id"), 64)
    if not channel_id:
        return cache
    token = youtube_access_token(database, row)
    channel = youtube_channel_resource(token, channel_id)
    if not channel:
        return cache
    cache.update(youtube_identity_fields(channel))
    row.display_name = cache.get("title") or row.display_name
    row.avatar_url = cache.get("thumb") or row.avatar_url
    row.profile_url = cache.get("profile_url") or row.profile_url
    row.cache = json.dumps(cache)
    row.refreshed_at = now
    database.commit()
    return cache


def youtube_card_payload(cache, parts):
    hidden = bool(cache.get("hidden_subscribers"))
    subscribers = "" if hidden else clip(str(cache.get("subscribers") or ""), 24)
    views = clip(str(cache.get("views") or ""), 24)
    videos = clip(str(cache.get("video_count") or ""), 24)
    name = clip(cache.get("title"), 120)
    link = clip(cache.get("profile_url"), 400)
    if not link:
        link = channel_profile_url(clip(cache.get("channel_id"), 64), cache.get("custom_url"))
    avatar = clip(cache.get("thumb"), 400)
    banner = clip(cache.get("banner"), 400)
    description = clip(cache.get("description"), 1000)
    published = clip(cache.get("published"), 40)
    country = clip(cache.get("country"), 8)
    return {
        "linked": True,
        "identity": bool(parts.get("identity")),
        "stats": bool(parts.get("stats")),
        "name": name,
        "profile_url": link,
        "avatar": avatar,
        "banner": banner,
        "description": description,
        "published": published,
        "country": country,
        "subscribers": subscribers,
        "views": views,
        "videos": videos,
        "hidden_subscribers": hidden,
        "available": {
            "banner": bool(banner),
            "avatar": bool(avatar),
            "name": bool(name),
            "handle": bool(link),
            "subscribers": bool(subscribers),
            "views": bool(views),
            "videos": bool(videos),
            "created": bool(published),
            "description": bool(description),
            "country": bool(country),
        },
    }


def load_youtube_card(database, user_id):
    row = database.query(Account_connection).filter(
        Account_connection.user_id == user_id,
        Account_connection.provider == "youtube",
    ).first()
    if not row:
        return {"linked": False, "identity": False, "stats": False, "available": {}}
    cache = refresh_youtube_identity_cache(database, row)
    if not cache.get("profile_url"):
        cache["profile_url"] = clip(row.profile_url, 400)
    if not cache.get("thumb"):
        cache["thumb"] = clip(row.avatar_url, 400)
    if not cache.get("title"):
        cache["title"] = clip(row.display_name, 120)
    return youtube_card_payload(cache, read_parts(row.parts, "youtube"))


def youtube_fetch(path, query, token=""):
    payload = youtube_get(path, query, token) if token else None
    if payload and payload.get("error"):
        payload = None
    if not payload:
        payload = youtube_public(path, query)
    return payload


def youtube_uploads_fresh(cache, now):
    uploads = cache.get("uploads")
    if not isinstance(uploads, list) or not uploads:
        return False
    raw = cache.get("uploads_at") or ""
    try:
        at = datetime.fromisoformat(str(raw))
    except Exception:
        return False
    return (now - at) < timedelta(minutes=5)


def refresh_youtube_uploads_cache(database, row):
    cache = youtube_cache_dict(row.cache)
    now = datetime.now()
    if youtube_uploads_fresh(cache, now):
        return cache
    token = youtube_access_token(database, row)
    uploads_id = clip(cache.get("uploads_id"), 64)
    if not uploads_id:
        channel_id = clip(row.external_id or cache.get("channel_id"), 64)
        channel = youtube_channel_resource(token, channel_id)
        if channel:
            cache.update(youtube_identity_fields(channel))
            uploads_id = clip(cache.get("uploads_id"), 64)
    listed = youtube_fetch("/playlistItems", {
        "part": "snippet,contentDetails",
        "playlistId": uploads_id,
        "maxResults": 25,
    }, token) if uploads_id else None
    ids = []
    for item in (listed or {}).get("items") or []:
        if not isinstance(item, dict):
            continue
        details = item.get("contentDetails") if isinstance(item.get("contentDetails"), dict) else {}
        snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
        resource = snippet.get("resourceId") if isinstance(snippet.get("resourceId"), dict) else {}
        video_id = clip(details.get("videoId") or resource.get("videoId"), 32)
        if video_id:
            ids.append(video_id)
    videos = []
    details = None
    if ids:
        details = youtube_fetch("/videos", {
            "part": "snippet,statistics,contentDetails,status",
            "id": ",".join(ids[:50]),
            "maxResults": 50,
        }, token)
        for item in (details or {}).get("items") or []:
            if isinstance(item, dict):
                videos.append(video_entry(item))
    ready = listed is not None and (not ids or details is not None)
    if ready:
        cache["uploads"] = videos
        cache["uploads_at"] = now.isoformat()
        row.cache = json.dumps(cache)
        database.commit()
    return cache


def youtube_video_public(row):
    return {
        "id": clip(row.get("id"), 32),
        "title": clip(row.get("title"), 160),
        "description": clip(row.get("description"), 1000),
        "thumb": clip(row.get("thumb"), 400),
        "published": clip(row.get("published"), 40),
        "views": clip(str(row.get("views") or ""), 24),
        "likes": clip(str(row.get("likes") or ""), 24),
        "comments": clip(str(row.get("comments") or ""), 24),
        "embeddable": False if row.get("embeddable") is False else True,
    }


def load_youtube_video_card(database, user_id):
    row = database.query(Account_connection).filter(
        Account_connection.user_id == user_id,
        Account_connection.provider == "youtube",
    ).first()
    if not row:
        return {
            "linked": False,
            "identity": False,
            "stats": False,
            "uploads": False,
            "videos": [],
            "available": {},
        }
    cache = refresh_youtube_identity_cache(database, row)
    cache = refresh_youtube_uploads_cache(database, row)
    if not cache.get("profile_url"):
        cache["profile_url"] = clip(row.profile_url, 400)
    if not cache.get("thumb"):
        cache["thumb"] = clip(row.avatar_url, 400)
    if not cache.get("title"):
        cache["title"] = clip(row.display_name, 120)
    parts = read_parts(row.parts, "youtube")
    hidden = bool(cache.get("hidden_subscribers"))
    subscribers = "" if hidden else clip(str(cache.get("subscribers") or ""), 24)
    name = clip(cache.get("title"), 120)
    link = clip(cache.get("profile_url"), 400)
    if not link:
        link = channel_profile_url(clip(cache.get("channel_id"), 64), cache.get("custom_url"))
    avatar = clip(cache.get("thumb"), 400)
    videos = [youtube_video_public(item) for item in (cache.get("uploads") or []) if isinstance(item, dict)]
    return {
        "linked": True,
        "identity": bool(parts.get("identity")),
        "stats": bool(parts.get("stats")),
        "uploads": bool(parts.get("uploads")),
        "name": name,
        "profile_url": link,
        "avatar": avatar,
        "subscribers": subscribers,
        "hidden_subscribers": hidden,
        "videos": videos,
        "available": {
            "player": bool(videos),
            "thumb": any(clip(item.get("thumb"), 400) for item in videos),
            "video_title": any(clip(item.get("title"), 160) for item in videos),
            "avatar": bool(avatar),
            "channel": bool(name),
            "subscribers": bool(subscribers),
            "views": any(clip(str(item.get("views") or ""), 24) for item in videos),
            "published": any(clip(item.get("published"), 40) for item in videos),
            "likes": any(clip(str(item.get("likes") or ""), 24) for item in videos),
            "description": any(clip(item.get("description"), 1000) for item in videos),
            "comments": any(clip(str(item.get("comments") or ""), 24) for item in videos),
        },
    }


def pending_youtube(database, user_id):
    drop_expired_nonces(database)
    cutoff = datetime.now() - timedelta(minutes=NONCE_MINUTES)
    rows = database.query(Connection_nonce).filter(
        Connection_nonce.user_id == user_id,
        Connection_nonce.created_at >= cutoff,
    ).all()
    for row in rows:
        try:
            data = json.loads(row.payload or "")
        except Exception:
            data = {}
        if isinstance(data, dict) and data.get("kind") == "youtube_pick":
            return row, data
    return None, None


@router.get("/connections/youtube/start")
def youtube_start(session_id: str = Cookie(None), database: Session = Depends(get_db)):
    user = validate_session(session_id, database)
    if not user:
        return RedirectResponse(LOGIN_PATH)
    client_id, client_secret, _ = google_client()
    if not client_id or not client_secret:
        return app_redirect("failed", "youtube")
    drop_expired_nonces(database)
    nonce = secrets.token_urlsafe(24)
    database.add(Connection_nonce(nonce=nonce, user_id=user.id, created_at=datetime.now()))
    database.commit()
    query = urlencode({
        "client_id": client_id,
        "redirect_uri": youtube_redirect_uri(),
        "response_type": "code",
        "scope": YOUTUBE_SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": nonce,
    })
    return RedirectResponse(GOOGLE_AUTH + "?" + query)


@router.get("/connections/youtube/callback")
def youtube_callback(code: str = "", state: str = "", error: str = "", session_id: str = Cookie(None), database: Session = Depends(get_db)):
    user = validate_session(session_id, database)
    if not user:
        return RedirectResponse(LOGIN_PATH)
    drop_expired_nonces(database)
    pending = database.query(Connection_nonce).filter(Connection_nonce.nonce == (state or "").strip()).first()
    if not pending or pending.user_id != user.id:
        return app_redirect("failed", "youtube")
    if error == "access_denied":
        database.delete(pending)
        database.commit()
        return app_redirect("cancel", "youtube")
    tokens = google_tokens_from_code((code or "").strip())
    access = clip((tokens or {}).get("access_token"), 4000)
    if not access:
        database.delete(pending)
        database.commit()
        return app_redirect("failed", "youtube")
    listed = youtube_get("/channels", {
        "part": "snippet,statistics,brandingSettings,contentDetails,status,topicDetails",
        "mine": "true",
        "maxResults": 50,
    }, access)
    if listed is None or listed.get("error"):
        database.delete(pending)
        database.commit()
        return app_redirect("failed", "youtube")
    channels = [item for item in listed.get("items") or [] if isinstance(item, dict) and item.get("id")]
    if not channels:
        database.delete(pending)
        database.commit()
        return app_redirect("no_channel", "youtube")
    if len(channels) == 1:
        database.delete(pending)
        database.commit()
        try:
            saved = save_youtube_link(database, user.id, channels[0], tokens)
        except Exception:
            database.rollback()
            return app_redirect("failed", "youtube")
        if not saved:
            return app_redirect("taken", "youtube")
        return app_redirect("", "youtube")
    pending.payload = json.dumps({
        "kind": "youtube_pick",
        "tokens": {
            "access_token": access,
            "refresh_token": clip((tokens or {}).get("refresh_token"), 4000),
            "expires_in": int((tokens or {}).get("expires_in") or 3600),
        },
        "channels": channels,
    })
    database.commit()
    return app_redirect("", "youtube", True)


@router.get("/connections/youtube/pending")
def youtube_pending(session_id: str = Cookie(None), database: Session = Depends(get_db)):
    user = validate_session(session_id, database)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    pending, data = pending_youtube(database, user.id)
    if not pending:
        return {"channels": []}
    briefs = []
    for item in data.get("channels") or []:
        if isinstance(item, dict):
            brief = channel_brief(item)
            if brief.get("id"):
                briefs.append(brief)
    return {"channels": briefs}


@router.post("/connections/youtube/choose")
def youtube_choose(body: Youtube_channel_pick, session_id: str = Cookie(None), database: Session = Depends(get_db)):
    user = validate_session(session_id, database)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    pending, data = pending_youtube(database, user.id)
    if not pending:
        raise HTTPException(status_code=400, detail="That YouTube sign-in expired.")
    wanted = clip(body.channel_id, 64)
    chosen = None
    for item in data.get("channels") or []:
        if isinstance(item, dict) and clip(item.get("id"), 64) == wanted:
            chosen = item
            break
    if not chosen:
        raise HTTPException(status_code=400, detail="Pick one of your YouTube channels.")
    tokens = data.get("tokens") if isinstance(data.get("tokens"), dict) else {}
    database.delete(pending)
    database.commit()
    try:
        saved = save_youtube_link(database, user.id, chosen, tokens)
    except Exception:
        database.rollback()
        raise HTTPException(status_code=400, detail="Could not finish that connection.")
    if not saved:
        raise HTTPException(status_code=409, detail="That YouTube channel is already linked to another Oneira account.")
    return {"ok": True}


@router.post("/connections/youtube/cancel")
def youtube_cancel_pick(session_id: str = Cookie(None), database: Session = Depends(get_db)):
    user = validate_session(session_id, database)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    pending, _ = pending_youtube(database, user.id)
    if pending:
        database.delete(pending)
        database.commit()
    return {"ok": True}
