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
    video_id = clip(item.get("id"), 32)
    return {
        "id": video_id,
        "title": clip(snippet.get("title"), 160),
        "thumb": thumb_url(snippet.get("thumbnails")),
        "published": clip(snippet.get("publishedAt"), 40),
        "duration": clip(details.get("duration"), 24),
        "views": clip(str(stats.get("viewCount") or ""), 24),
        "likes": clip(str(stats.get("likeCount") or ""), 24),
        "comments": clip(str(stats.get("commentCount") or ""), 24),
        "live": clip(snippet.get("liveBroadcastContent"), 16),
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
        "part": "snippet,statistics,contentDetails",
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


def youtube_snapshot(token, channel):
    snippet = channel.get("snippet") if isinstance(channel.get("snippet"), dict) else {}
    stats = channel.get("statistics") if isinstance(channel.get("statistics"), dict) else {}
    branding = channel.get("brandingSettings") if isinstance(channel.get("brandingSettings"), dict) else {}
    brand_channel = branding.get("channel") if isinstance(branding.get("channel"), dict) else {}
    brand_image = branding.get("image") if isinstance(branding.get("image"), dict) else {}
    details = channel.get("contentDetails") if isinstance(channel.get("contentDetails"), dict) else {}
    related = details.get("relatedPlaylists") if isinstance(details.get("relatedPlaylists"), dict) else {}
    status = channel.get("status") if isinstance(channel.get("status"), dict) else {}
    topics = channel.get("topicDetails") if isinstance(channel.get("topicDetails"), dict) else {}
    channel_id = clip(channel.get("id"), 64)
    custom = clip(snippet.get("customUrl"), 80)
    uploads_id = clip(related.get("uploads"), 64)
    likes_id = clip(related.get("likes"), 64)
    upload_ids = playlist_video_ids(token, uploads_id)
    like_ids = playlist_video_ids(token, likes_id)
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
        "uploads_id": uploads_id,
        "likes_id": likes_id,
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
    }


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
