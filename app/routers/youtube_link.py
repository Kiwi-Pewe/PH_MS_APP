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
        "privacy": clip(status.get("privacyStatus"), 16) or "public",
        "channel": clip(snippet.get("channelTitle"), 120),
        "channel_id": clip(snippet.get("channelId"), 64),
    }


def playlist_entry(item):
    snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
    details = item.get("contentDetails") if isinstance(item.get("contentDetails"), dict) else {}
    return {
        "id": clip(item.get("id"), 64),
        "title": clip(snippet.get("title"), 160),
        "thumb": thumb_url(snippet.get("thumbnails")),
        "count": int(details.get("itemCount") or 0),
        "published": clip(snippet.get("publishedAt"), 40),
        "privacy": clip((item.get("status") or {}).get("privacyStatus") if isinstance(item.get("status"), dict) else "", 16) or "public",
    }


def subscription_entry(item):
    snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
    resource = snippet.get("resourceId") if isinstance(snippet.get("resourceId"), dict) else {}
    channel_id = clip(resource.get("channelId"), 64)
    return {
        "id": channel_id,
        "title": clip(snippet.get("title"), 120),
        "thumb": thumb_url(snippet.get("thumbnails")),
        "url": channel_profile_url(channel_id, ""),
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
        "privacy": clip(status.get("privacyStatus"), 16) or "public",
        "scheduled": clip(snippet.get("scheduledStartTime"), 40),
        "started": clip(snippet.get("actualStartTime"), 40),
        "ended": clip(snippet.get("actualEndTime"), 40),
        "live_chat_id": clip(snippet.get("liveChatId"), 128),
    }


def playlist_video_ids(token, playlist_id, limit=25):
    if not playlist_id:
        return []
    payload = youtube_fetch("/playlistItems", {
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
    payload = http_json(url, headers={"Referer": SITE_ORIGIN})
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
    if any(not isinstance(item, dict) or not item.get("privacy") for item in uploads):
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


def youtube_live_fresh(cache, now):
    rows = cache.get("live")
    if isinstance(rows, list) and any(isinstance(item, dict) and "live_chat_id" not in item for item in rows):
        return False
    raw = cache.get("live_at") or ""
    try:
        at = datetime.fromisoformat(str(raw))
    except Exception:
        return False
    return (now - at) < timedelta(minutes=5)


def apply_live_video(row, item):
    extra = video_entry(item)
    details = item.get("liveStreamingDetails") if isinstance(item.get("liveStreamingDetails"), dict) else {}
    row["title"] = extra.get("title") or row.get("title")
    row["description"] = extra.get("description") or ""
    row["thumb"] = extra.get("thumb") or row.get("thumb")
    row["published"] = extra.get("published") or ""
    row["views"] = extra.get("views") or ""
    row["likes"] = extra.get("likes") or ""
    row["comments"] = extra.get("comments") or ""
    row["embeddable"] = extra.get("embeddable")
    row["watching"] = clip(str(details.get("concurrentViewers") or ""), 24)
    row["ended"] = row.get("ended") or clip(details.get("actualEndTime"), 40)
    row["started"] = row.get("started") or clip(details.get("actualStartTime"), 40)
    row["scheduled"] = row.get("scheduled") or clip(details.get("scheduledStartTime"), 40)
    chat_id = clip(details.get("activeLiveChatId"), 128)
    if chat_id:
        row["live_chat_id"] = chat_id
    return row


def refresh_youtube_live_cache(database, row):
    cache = youtube_cache_dict(row.cache)
    now = datetime.now()
    if youtube_live_fresh(cache, now):
        return cache
    token = youtube_access_token(database, row)
    listed = youtube_fetch("/liveBroadcasts", {
        "part": "snippet,status",
        "mine": "true",
        "broadcastStatus": "all",
        "maxResults": 25,
    }, token)
    if listed is None:
        if cache.get("live") is None:
            cache["live"] = []
            cache["live_at"] = now.isoformat()
            row.cache = json.dumps(cache)
            database.commit()
        return cache
    rows = []
    ids = []
    for item in (listed.get("items") or []):
        if not isinstance(item, dict):
            continue
        entry = live_entry(item)
        if entry.get("id"):
            ids.append(entry["id"])
        rows.append(entry)
    videos = {}
    if ids:
        payload = youtube_fetch("/videos", {
            "part": "snippet,statistics,contentDetails,status,liveStreamingDetails",
            "id": ",".join(ids[:50]),
            "maxResults": 50,
        }, token)
        for item in (payload or {}).get("items") or []:
            if not isinstance(item, dict):
                continue
            video_id = clip(item.get("id"), 32)
            if video_id:
                videos[video_id] = item
    for entry in rows:
        extra = videos.get(clip(entry.get("id"), 32))
        if extra:
            apply_live_video(entry, extra)
    cache["live"] = rows
    cache["live_at"] = now.isoformat()
    row.cache = json.dumps(cache)
    database.commit()
    return cache


def youtube_video_public(row):
    privacy = (clip(row.get("privacy"), 16) or "public").lower()
    if privacy == "private":
        return None
    channel_id = clip(row.get("channel_id"), 64)
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
        "privacy": privacy,
        "channel": clip(row.get("channel"), 120),
        "channel_id": channel_id,
        "channel_url": clip(row.get("channel_url"), 400) or channel_profile_url(channel_id, ""),
        "liked": clip(row.get("liked"), 40),
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
    videos = []
    for item in (cache.get("uploads") or []):
        if not isinstance(item, dict):
            continue
        public = youtube_video_public(item)
        if public:
            videos.append(public)
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
            "unlisted": any((item.get("privacy") or "") == "unlisted" for item in videos),
        },
    }


def youtube_live_public(row):
    privacy = (clip(row.get("privacy"), 16) or "public").lower()
    if privacy == "private":
        return None
    return {
        "id": clip(row.get("id"), 32),
        "title": clip(row.get("title"), 160),
        "description": clip(row.get("description"), 1000),
        "thumb": clip(row.get("thumb"), 400),
        "published": clip(row.get("published"), 40),
        "views": clip(str(row.get("views") or ""), 24),
        "likes": clip(str(row.get("likes") or ""), 24),
        "comments": clip(str(row.get("comments") or ""), 24),
        "watching": clip(str(row.get("watching") or ""), 24),
        "embeddable": False if row.get("embeddable") is False else True,
        "privacy": privacy,
        "status": clip(row.get("status"), 24).lower(),
        "scheduled": clip(row.get("scheduled"), 40),
        "started": clip(row.get("started"), 40),
        "ended": clip(row.get("ended"), 40),
        "live_chat_id": clip(row.get("live_chat_id"), 128),
    }


def load_youtube_live_card(database, user_id):
    row = database.query(Account_connection).filter(
        Account_connection.user_id == user_id,
        Account_connection.provider == "youtube",
    ).first()
    if not row:
        return {
            "linked": False,
            "identity": False,
            "stats": False,
            "live": False,
            "streams": [],
            "available": {},
        }
    cache = refresh_youtube_identity_cache(database, row)
    cache = refresh_youtube_live_cache(database, row)
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
    banner = clip(cache.get("banner"), 400)
    streams = []
    for item in (cache.get("live") or []):
        if not isinstance(item, dict):
            continue
        public = youtube_live_public(item)
        if public:
            streams.append(public)
    return {
        "linked": True,
        "identity": bool(parts.get("identity")),
        "stats": bool(parts.get("stats")),
        "live": bool(parts.get("live")),
        "name": name,
        "profile_url": link,
        "avatar": avatar,
        "banner": banner,
        "subscribers": subscribers,
        "hidden_subscribers": hidden,
        "streams": streams,
        "available": {
            "player": any((item.get("status") or "") in ("live", "livestarting") for item in streams),
            "thumb": any(clip(item.get("thumb"), 400) for item in streams) or bool(banner),
            "video_title": any(clip(item.get("title"), 160) for item in streams),
            "avatar": bool(avatar),
            "channel": bool(name),
            "subscribers": bool(subscribers),
            "views": any(clip(str(item.get("views") or ""), 24) for item in streams),
            "published": any(clip(item.get("started") or item.get("scheduled") or item.get("ended"), 40) for item in streams),
            "likes": any(clip(str(item.get("likes") or ""), 24) for item in streams),
            "description": any(clip(item.get("description"), 1000) for item in streams),
            "comments": any(clip(str(item.get("comments") or ""), 24) for item in streams),
            "watching": any(clip(str(item.get("watching") or ""), 24) for item in streams),
            "banner": bool(banner),
            "unlisted": any((item.get("privacy") or "") == "unlisted" for item in streams),
        },
    }


def youtube_playlists_fresh(cache, now):
    rows = cache.get("playlists")
    if not isinstance(rows, list):
        return False
    raw = cache.get("playlists_at") or ""
    try:
        at = datetime.fromisoformat(str(raw))
    except Exception:
        return False
    if any(not isinstance(item, dict) or not item.get("privacy") or "published" not in item for item in rows):
        return False
    return (now - at) < timedelta(minutes=5)


def refresh_youtube_playlists_cache(database, row):
    cache = youtube_cache_dict(row.cache)
    now = datetime.now()
    if youtube_playlists_fresh(cache, now):
        return cache
    token = youtube_access_token(database, row)
    listed = youtube_fetch("/playlists", {
        "part": "snippet,contentDetails,status",
        "mine": "true",
        "maxResults": 25,
    }, token)
    if listed is None:
        if cache.get("playlists") is None:
            cache["playlists"] = []
            cache["playlists_at"] = now.isoformat()
            row.cache = json.dumps(cache)
            database.commit()
        return cache
    rows = []
    for item in (listed.get("items") or []):
        if isinstance(item, dict):
            rows.append(playlist_entry(item))
    cache["playlists"] = rows
    cache["playlists_at"] = now.isoformat()
    row.cache = json.dumps(cache)
    database.commit()
    return cache


def youtube_playlist_public(row):
    privacy = (clip(row.get("privacy"), 16) or "public").lower()
    if privacy == "private":
        return None
    try:
        count = int(row.get("count") or 0)
    except (TypeError, ValueError):
        count = 0
    return {
        "id": clip(row.get("id"), 64),
        "title": clip(row.get("title"), 160),
        "thumb": clip(row.get("thumb"), 400),
        "count": max(0, count),
        "published": clip(row.get("published"), 40),
        "privacy": privacy,
    }


def load_youtube_playlists_card(database, user_id):
    row = database.query(Account_connection).filter(
        Account_connection.user_id == user_id,
        Account_connection.provider == "youtube",
    ).first()
    if not row:
        return {
            "linked": False,
            "identity": False,
            "playlists": False,
            "lists": [],
            "available": {},
        }
    cache = refresh_youtube_identity_cache(database, row)
    cache = refresh_youtube_playlists_cache(database, row)
    if not cache.get("profile_url"):
        cache["profile_url"] = clip(row.profile_url, 400)
    if not cache.get("title"):
        cache["title"] = clip(row.display_name, 120)
    parts = read_parts(row.parts, "youtube")
    name = clip(cache.get("title"), 120)
    link = clip(cache.get("profile_url"), 400)
    if not link:
        link = channel_profile_url(clip(cache.get("channel_id"), 64), cache.get("custom_url"))
    lists = []
    for item in (cache.get("playlists") or []):
        if not isinstance(item, dict):
            continue
        public = youtube_playlist_public(item)
        if public:
            lists.append(public)
    return {
        "linked": True,
        "identity": bool(parts.get("identity")),
        "playlists": bool(parts.get("playlists")),
        "name": name,
        "profile_url": link,
        "lists": lists,
        "available": {
            "thumb": any(clip(item.get("thumb"), 400) for item in lists),
            "video_title": any(clip(item.get("title"), 160) for item in lists),
            "channel": bool(name),
            "count": any(item.get("count") for item in lists),
            "unlisted": any((item.get("privacy") or "") == "unlisted" for item in lists),
        },
    }


def load_youtube_playlist_start(database, user_id, playlist_id):
    wanted = clip(playlist_id, 64)
    miss = {"ok": False, "playlist_id": "", "video": None}
    if not wanted:
        return miss
    row = database.query(Account_connection).filter(
        Account_connection.user_id == user_id,
        Account_connection.provider == "youtube",
    ).first()
    if not row:
        return miss
    parts = read_parts(row.parts, "youtube")
    if not parts.get("playlists"):
        return miss
    cache = refresh_youtube_playlists_cache(database, row)
    listed = None
    for item in (cache.get("playlists") or []):
        if not isinstance(item, dict):
            continue
        public = youtube_playlist_public(item)
        if public and public.get("id") == wanted:
            listed = public
            break
    if not listed:
        return miss
    token = youtube_access_token(database, row)
    ids = playlist_video_ids(token, wanted, 25)
    if not ids:
        return {"ok": True, "playlist_id": wanted, "video": None}
    payload = youtube_fetch("/videos", {
        "part": "snippet,statistics,contentDetails,status",
        "id": ",".join(ids[:50]),
        "maxResults": 50,
    }, token)
    found = {}
    for item in (payload or {}).get("items") or []:
        if not isinstance(item, dict):
            continue
        public = youtube_video_public(video_entry(item))
        if public and public.get("id"):
            found[public["id"]] = public
    video = None
    for video_id in ids:
        hit = found.get(video_id)
        if hit:
            video = hit
            break
    return {"ok": True, "playlist_id": wanted, "video": video}


def youtube_likes_fresh(cache, now):
    rows = cache.get("likes")
    if not isinstance(rows, list):
        return False
    raw = cache.get("likes_at") or ""
    try:
        at = datetime.fromisoformat(str(raw))
    except Exception:
        return False
    if any(not isinstance(item, dict) or not item.get("privacy") or "liked" not in item for item in rows):
        return False
    return (now - at) < timedelta(minutes=5)


def refresh_youtube_likes_cache(database, row):
    cache = youtube_cache_dict(row.cache)
    now = datetime.now()
    if youtube_likes_fresh(cache, now):
        return cache
    token = youtube_access_token(database, row)
    likes_id = clip(cache.get("likes_id"), 64)
    if not likes_id:
        channel_id = clip(row.external_id or cache.get("channel_id"), 64)
        channel = youtube_channel_resource(token, channel_id)
        if channel:
            cache.update(youtube_identity_fields(channel))
            likes_id = clip(cache.get("likes_id"), 64)
    listed = youtube_fetch("/playlistItems", {
        "part": "snippet,contentDetails",
        "playlistId": likes_id,
        "maxResults": 25,
    }, token) if likes_id else None
    if listed is None:
        rows = cache.get("likes")
        if not isinstance(rows, list):
            cache["likes"] = []
            rows = cache["likes"]
        for entry in rows:
            if not isinstance(entry, dict):
                continue
            if "liked" not in entry:
                entry["liked"] = entry.get("published") or ""
            if not entry.get("privacy"):
                entry["privacy"] = "public"
        cache["likes_at"] = now.isoformat()
        row.cache = json.dumps(cache)
        database.commit()
        return cache
    ids = []
    liked_at = {}
    for item in (listed.get("items") or []):
        if not isinstance(item, dict):
            continue
        details = item.get("contentDetails") if isinstance(item.get("contentDetails"), dict) else {}
        snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
        resource = snippet.get("resourceId") if isinstance(snippet.get("resourceId"), dict) else {}
        video_id = clip(details.get("videoId") or resource.get("videoId"), 32)
        if video_id:
            ids.append(video_id)
            liked_at[video_id] = clip(snippet.get("publishedAt"), 40)
    found = {}
    if ids:
        payload = youtube_fetch("/videos", {
            "part": "snippet,statistics,contentDetails,status",
            "id": ",".join(ids[:50]),
            "maxResults": 50,
        }, token)
        for item in (payload or {}).get("items") or []:
            if not isinstance(item, dict):
                continue
            entry = video_entry(item)
            if entry.get("id"):
                found[entry["id"]] = entry
    videos = []
    for video_id in ids:
        entry = found.get(video_id)
        if not entry:
            continue
        item = dict(entry)
        item["liked"] = liked_at.get(video_id) or entry.get("published") or ""
        videos.append(item)
    cache["likes"] = videos
    cache["likes_at"] = now.isoformat()
    row.cache = json.dumps(cache)
    database.commit()
    return cache


def load_youtube_liked_card(database, user_id):
    row = database.query(Account_connection).filter(
        Account_connection.user_id == user_id,
        Account_connection.provider == "youtube",
    ).first()
    if not row:
        return {
            "linked": False,
            "likes": False,
            "videos": [],
            "available": {},
        }
    cache = refresh_youtube_identity_cache(database, row)
    cache = refresh_youtube_likes_cache(database, row)
    parts = read_parts(row.parts, "youtube")
    videos = []
    for item in (cache.get("likes") or []):
        if not isinstance(item, dict):
            continue
        public = youtube_video_public(item)
        if public:
            videos.append(public)
    return {
        "linked": True,
        "likes": bool(parts.get("likes")),
        "videos": videos,
        "available": {
            "thumb": any(clip(item.get("thumb"), 400) for item in videos),
            "video_title": any(clip(item.get("title"), 160) for item in videos),
            "channel": any(clip(item.get("channel"), 120) for item in videos),
            "views": any(clip(str(item.get("views") or ""), 24) for item in videos),
            "unlisted": any((item.get("privacy") or "") == "unlisted" for item in videos),
        },
    }


def youtube_subscriptions_fresh(cache, now):
    rows = cache.get("subscriptions")
    if not isinstance(rows, list):
        return False
    raw = cache.get("subscriptions_at") or ""
    try:
        at = datetime.fromisoformat(str(raw))
    except Exception:
        return False
    if any(not isinstance(item, dict) or not item.get("id") for item in rows):
        return False
    return (now - at) < timedelta(minutes=5)


def refresh_youtube_subscriptions_cache(database, row):
    cache = youtube_cache_dict(row.cache)
    now = datetime.now()
    if youtube_subscriptions_fresh(cache, now):
        return cache
    token = youtube_access_token(database, row)
    listed = youtube_fetch("/subscriptions", {
        "part": "snippet",
        "mine": "true",
        "maxResults": 25,
    }, token)
    if listed is None:
        rows = cache.get("subscriptions")
        if not isinstance(rows, list):
            cache["subscriptions"] = []
            rows = cache["subscriptions"]
        cache["subscriptions_at"] = now.isoformat()
        row.cache = json.dumps(cache)
        database.commit()
        return cache
    rows = []
    for item in (listed.get("items") or []):
        if isinstance(item, dict):
            rows.append(subscription_entry(item))
    cache["subscriptions"] = rows
    cache["subscriptions_at"] = now.isoformat()
    row.cache = json.dumps(cache)
    database.commit()
    return cache


def youtube_subscription_public(row):
    channel_id = clip(row.get("id"), 64)
    if not channel_id:
        return None
    return {
        "id": channel_id,
        "title": clip(row.get("title"), 120),
        "thumb": clip(row.get("thumb"), 400),
        "url": clip(row.get("url"), 400) or channel_profile_url(channel_id, ""),
    }


def load_youtube_subscriptions_card(database, user_id):
    row = database.query(Account_connection).filter(
        Account_connection.user_id == user_id,
        Account_connection.provider == "youtube",
    ).first()
    if not row:
        return {
            "linked": False,
            "subscriptions": False,
            "channels": [],
        }
    cache = refresh_youtube_identity_cache(database, row)
    cache = refresh_youtube_subscriptions_cache(database, row)
    parts = read_parts(row.parts, "youtube")
    channels = []
    for item in (cache.get("subscriptions") or []):
        if not isinstance(item, dict):
            continue
        public = youtube_subscription_public(item)
        if public:
            channels.append(public)
    return {
        "linked": True,
        "subscriptions": bool(parts.get("subscriptions")),
        "channels": channels,
    }


def youtube_watch_id(value):
    text = clip(value, 16)
    if len(text) != 11:
        return ""
    for ch in text:
        if not (ch.isalnum() or ch in "-_"):
            return ""
    return text


def comment_entry(item, video_id):
    snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
    top = snippet.get("topLevelComment") if isinstance(snippet.get("topLevelComment"), dict) else {}
    body = top.get("snippet") if isinstance(top.get("snippet"), dict) else {}
    author_ch = body.get("authorChannelId")
    if isinstance(author_ch, dict):
        author_id = clip(author_ch.get("value"), 64)
    else:
        author_id = clip(author_ch, 64)
    comment_id = clip(top.get("id") or item.get("id"), 64)
    return {
        "id": comment_id,
        "video_id": youtube_watch_id(video_id or body.get("videoId")),
        "author": clip(body.get("authorDisplayName"), 120),
        "thumb": clip(body.get("authorProfileImageUrl"), 400),
        "channel_id": author_id,
        "url": channel_profile_url(author_id, ""),
        "text": clip(body.get("textOriginal") or body.get("textDisplay"), 2000),
        "published": clip(body.get("publishedAt"), 40),
    }


def youtube_comments_fresh(cache, video_id, now):
    bucket = cache.get("comment_map")
    if not isinstance(bucket, dict):
        return False
    slot = bucket.get(video_id)
    if not isinstance(slot, dict) or not slot.get("ok") or not isinstance(slot.get("rows"), list):
        return False
    raw = slot.get("at") or ""
    try:
        at = datetime.fromisoformat(str(raw))
    except Exception:
        return False
    return (now - at) < timedelta(minutes=5)


def refresh_youtube_comments_cache(database, row, video_id):
    cache = youtube_cache_dict(row.cache)
    now = datetime.now()
    wanted = youtube_watch_id(video_id)
    if not wanted:
        return cache, []
    if youtube_comments_fresh(cache, wanted, now):
        bucket = cache.get("comment_map") or {}
        slot = bucket.get(wanted) or {}
        rows = slot.get("rows") if isinstance(slot.get("rows"), list) else []
        return cache, rows
    query = {
        "part": "snippet",
        "videoId": wanted,
        "maxResults": 25,
        "order": "time",
        "textFormat": "plainText",
    }
    listed = youtube_public("/commentThreads", query)
    if listed is None:
        token = youtube_access_token(database, row)
        listed = youtube_get("/commentThreads", query, token) if token else None
        if listed and listed.get("error"):
            listed = None
    if listed is None:
        return cache, []
    rows = []
    for item in (listed.get("items") or []):
        if isinstance(item, dict):
            rows.append(comment_entry(item, wanted))
    bucket = cache.get("comment_map")
    if not isinstance(bucket, dict):
        bucket = {}
    bucket[wanted] = {"at": now.isoformat(), "rows": rows, "ok": True}
    cache["comment_map"] = bucket
    row.cache = json.dumps(cache)
    database.commit()
    return cache, rows


def load_youtube_comments_card(database, user_id, video_id=""):
    miss = {
        "linked": False,
        "comments": False,
        "video_id": "",
        "threads": [],
        "videos": [],
    }
    row = database.query(Account_connection).filter(
        Account_connection.user_id == user_id,
        Account_connection.provider == "youtube",
    ).first()
    if not row:
        return miss
    cache = refresh_youtube_identity_cache(database, row)
    cache = refresh_youtube_uploads_cache(database, row)
    parts = read_parts(row.parts, "youtube")
    videos = []
    for item in (cache.get("uploads") or []):
        if not isinstance(item, dict):
            continue
        public = youtube_video_public(item)
        if public:
            videos.append(public)
    wanted = youtube_watch_id(video_id)
    if not wanted and videos:
        wanted = youtube_watch_id(videos[0].get("id"))
    threads = []
    if parts.get("comments") and wanted:
        cache, threads = refresh_youtube_comments_cache(database, row, wanted)
    return {
        "linked": True,
        "comments": bool(parts.get("comments")),
        "video_id": wanted,
        "threads": threads,
        "videos": videos,
    }


def live_chat_entry(item, video_id):
    snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
    kind = clip(snippet.get("type"), 40)
    if kind and kind != "textMessageEvent":
        return None
    details = snippet.get("textMessageDetails") if isinstance(snippet.get("textMessageDetails"), dict) else {}
    text = clip(details.get("messageText") or snippet.get("displayMessage"), 500)
    if not text:
        return None
    author = item.get("authorDetails") if isinstance(item.get("authorDetails"), dict) else {}
    author_id = clip(author.get("channelId"), 64)
    return {
        "id": clip(item.get("id"), 128),
        "video_id": youtube_watch_id(video_id),
        "author": clip(author.get("displayName"), 120),
        "thumb": clip(author.get("profileImageUrl"), 400),
        "channel_id": author_id,
        "url": channel_profile_url(author_id, ""),
        "text": text,
        "published": clip(snippet.get("publishedAt"), 40),
    }


def youtube_live_chat_fresh(cache, video_id, now):
    bucket = cache.get("live_chat_map")
    if not isinstance(bucket, dict):
        return False
    slot = bucket.get(video_id)
    if not isinstance(slot, dict) or not slot.get("ok") or not isinstance(slot.get("rows"), list):
        return False
    raw = slot.get("at") or ""
    try:
        at = datetime.fromisoformat(str(raw))
    except Exception:
        return False
    return (now - at) < timedelta(seconds=15)


def youtube_active_chat_id(token, video_id):
    query = {"part": "liveStreamingDetails", "id": video_id, "maxResults": 1}
    payload = youtube_public("/videos", query)
    if payload is None:
        payload = youtube_get("/videos", query, token) if token else None
        if payload and payload.get("error"):
            payload = None
    items = (payload or {}).get("items") or []
    item = items[0] if items and isinstance(items[0], dict) else {}
    details = item.get("liveStreamingDetails") if isinstance(item.get("liveStreamingDetails"), dict) else {}
    return clip(details.get("activeLiveChatId"), 128)


def youtube_pick_live_stream(streams, video_id=""):
    wanted = youtube_watch_id(video_id)
    live = []
    soon = []
    for item in streams:
        if not isinstance(item, dict):
            continue
        status = (clip(item.get("status"), 24) or "").lower()
        ident = youtube_watch_id(item.get("id"))
        if wanted:
            if ident != wanted:
                continue
            if status in ("complete", "revoked", "testing", "teststarting"):
                return None
            return item
        if status in ("live", "livestarting"):
            live.append(item)
            continue
        if status in ("complete", "revoked", "testing", "teststarting"):
            continue
        if item.get("scheduled"):
            soon.append(item)
    if live:
        return live[0]
    if soon:
        return soon[0]
    return None


def refresh_youtube_live_chat_cache(database, row, video_id, chat_id=""):
    cache = youtube_cache_dict(row.cache)
    now = datetime.now()
    wanted = youtube_watch_id(video_id)
    if not wanted:
        return cache, [], False
    if youtube_live_chat_fresh(cache, wanted, now):
        slot = (cache.get("live_chat_map") or {}).get(wanted) or {}
        rows = slot.get("rows") if isinstance(slot.get("rows"), list) else []
        return cache, rows, bool(slot.get("ready"))
    token = youtube_access_token(database, row)
    chat = clip(chat_id, 128) or youtube_active_chat_id(token, wanted)
    rows = []
    ready = bool(chat)
    if chat:
        query = {
            "part": "snippet,authorDetails",
            "liveChatId": chat,
            "maxResults": 200,
        }
        listed = youtube_public("/liveChat/messages", query)
        if listed is None:
            listed = youtube_get("/liveChat/messages", query, token) if token else None
            if listed and listed.get("error"):
                listed = None
        if listed is None:
            return cache, [], True
        for item in (listed.get("items") or []):
            if not isinstance(item, dict):
                continue
            entry = live_chat_entry(item, wanted)
            if entry:
                rows.append(entry)
        if len(rows) > 25:
            rows = rows[-25:]
    bucket = cache.get("live_chat_map")
    if not isinstance(bucket, dict):
        bucket = {}
    bucket[wanted] = {"at": now.isoformat(), "rows": rows, "ok": True, "ready": ready}
    cache["live_chat_map"] = bucket
    row.cache = json.dumps(cache)
    database.commit()
    return cache, rows, ready


def load_youtube_live_chat_card(database, user_id, video_id=""):
    miss = {
        "linked": False,
        "live_chat": False,
        "video_id": "",
        "ready": False,
        "messages": [],
    }
    row = database.query(Account_connection).filter(
        Account_connection.user_id == user_id,
        Account_connection.provider == "youtube",
    ).first()
    if not row:
        return miss
    cache = refresh_youtube_identity_cache(database, row)
    cache = refresh_youtube_live_cache(database, row)
    parts = read_parts(row.parts, "youtube")
    streams = []
    for item in (cache.get("live") or []):
        if not isinstance(item, dict):
            continue
        public = youtube_live_public(item)
        if public:
            streams.append(public)
    stream = youtube_pick_live_stream(streams, video_id)
    wanted = youtube_watch_id((stream or {}).get("id"))
    messages = []
    ready = False
    if parts.get("live_chat") and wanted:
        cache, messages, ready = refresh_youtube_live_chat_cache(
            database, row, wanted, (stream or {}).get("live_chat_id") or ""
        )
    return {
        "linked": True,
        "live_chat": bool(parts.get("live_chat")),
        "video_id": wanted,
        "ready": ready,
        "messages": messages,
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
