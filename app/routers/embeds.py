from fastapi import APIRouter, Depends, HTTPException, Query
from app.models import UserInfo
from app.auth import get_current_user
from html import unescape
from urllib.parse import urljoin, urlparse, quote
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import URLError, HTTPError
import ipaddress
import json
import re
import socket
import time

router = APIRouter()

PREVIEW_TTL_SEC = 3600
FETCH_TIMEOUT_SEC = 5
MAX_BODY_BYTES = 512_000
MAX_REDIRECTS = 3
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
# In-process only. Same URL asked by many clients should not hit the
# remote site every time. Dies with the worker; that is fine this pass.
_preview_cache = {}


class SafeRedirectHandler(HTTPRedirectHandler):
    max_redirections = MAX_REDIRECTS

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not url_is_allowed(newurl):
            raise HTTPError(newurl, 403, "blocked redirect", headers, fp)
        return HTTPRedirectHandler.redirect_request(self, req, fp, code, msg, headers, newurl)


def ip_is_forbidden(raw):
    ip = ipaddress.ip_address(raw)
    if ip.version == 6 and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def hostname_is_allowed(host):
    if not host:
        return False
    host = host.strip("[]").lower()
    if host == "localhost" or host.endswith(".localhost"):
        return False
    try:
        return not ip_is_forbidden(host)
    except ValueError:
        pass
    try:
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False
    if not infos:
        return False
    for info in infos:
        if ip_is_forbidden(info[4][0]):
            return False
    return True


def url_is_allowed(raw):
    try:
        parsed = urlparse(raw)
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    if parsed.username or parsed.password:
        return False
    if parsed.port not in (None, 80, 443):
        return False
    return hostname_is_allowed(parsed.hostname)


def cache_get(url):
    hit = _preview_cache.get(url)
    if not hit:
        return None
    saved_at, data = hit
    if time.time() - saved_at > PREVIEW_TTL_SEC:
        _preview_cache.pop(url, None)
        return None
    return data


def attr_value(tag, name):
    match = re.search(
        rf"""{name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))""",
        tag,
        flags=re.I,
    )
    if not match:
        return None
    return unescape(next(g for g in match.groups() if g is not None))


def meta_value(html, key):
    key = key.lower()
    for tag in re.findall(r"<meta\b[^>]*>", html, flags=re.I):
        prop = (attr_value(tag, "property") or attr_value(tag, "name") or "").lower()
        if prop == key:
            content = attr_value(tag, "content")
            if content:
                return content.strip()
    return None


def page_title(html):
    match = re.search(r"<title[^>]*>(.*?)</title>", html, flags=re.I | re.S)
    if not match:
        return None
    return unescape(re.sub(r"\s+", " ", match.group(1))).strip() or None


def host_kind(url):
    host = (urlparse(url).hostname or "").lower()
    if host == "youtu.be" or host == "youtube.com" or host.endswith(".youtube.com"):
        return "youtube"
    if host == "reddit.com" or host.endswith(".reddit.com"):
        return "reddit"
    return None


def fetch_url(url, accept):
    request = Request(
        url,
        headers={
            "User-Agent": BROWSER_UA,
            "Accept": accept,
            "Accept-Language": "en-US,en;q=0.9",
        },
        method="GET",
    )
    opener = build_opener(SafeRedirectHandler)
    with opener.open(request, timeout=FETCH_TIMEOUT_SEC) as response:
        body = response.read(MAX_BODY_BYTES + 1)
        if len(body) > MAX_BODY_BYTES:
            body = body[:MAX_BODY_BYTES]
        return response, body


def preview_from_oembed(data, page_url, site):
    image = data.get("thumbnail_url") or ""
    if image and not url_is_allowed(image):
        image = ""
    title = data.get("title") or ""
    description = data.get("author_name") or data.get("author_url") or ""
    return {
        "url": page_url,
        "site": (data.get("provider_name") or site)[:80],
        "title": (title or site)[:200],
        "description": description[:300],
        "image": image,
    }


def fetch_oembed(endpoint, page_url, site):
    oembed_url = endpoint + quote(page_url, safe="")
    if not url_is_allowed(oembed_url):
        return None
    try:
        response, body = fetch_url(oembed_url, "application/json")
        data = json.loads(body.decode("utf-8", errors="replace"))
        if not isinstance(data, dict) or not (data.get("title") or data.get("author_name")):
            return None
        return preview_from_oembed(data, page_url, site)
    except (HTTPError, URLError, TimeoutError, ValueError, OSError, HTTPException, json.JSONDecodeError):
        return None


def parse_preview(html, page_url):
    site = meta_value(html, "og:site_name")
    title = meta_value(html, "og:title") or meta_value(html, "twitter:title") or page_title(html)
    description = (
        meta_value(html, "og:description")
        or meta_value(html, "twitter:description")
        or meta_value(html, "description")
    )
    image = meta_value(html, "og:image") or meta_value(html, "twitter:image")
    if image:
        image = urljoin(page_url, image)
        if not url_is_allowed(image):
            image = None
    parsed = urlparse(page_url)
    host = (parsed.hostname or "").replace("www.", "")
    return {
        "url": page_url,
        "site": (site or host)[:80],
        "title": (title or host)[:200] if (title or host) else "",
        "description": (description or "")[:300],
        "image": image or "",
    }


def fetch_html_preview(url):
    response, body = fetch_url(url, "text/html,application/xhtml+xml")
    content_type = (response.headers.get("Content-Type") or "").lower()
    if "html" not in content_type and "xml" not in content_type:
        raise HTTPException(status_code=422, detail="not an html page")
    charset = "utf-8"
    match = re.search(r"charset=([\w-]+)", content_type)
    if match:
        charset = match.group(1)
    html = body.decode(charset, errors="replace")
    return parse_preview(html, response.geturl() or url)


def fetch_preview(url):
    kind = host_kind(url)
    if kind == "youtube":
        data = fetch_oembed("https://www.youtube.com/oembed?format=json&url=", url, "YouTube")
        if data:
            return data
    if kind == "reddit":
        data = fetch_oembed("https://www.reddit.com/oembed?url=", url, "Reddit")
        if data:
            return data
    try:
        return fetch_html_preview(url)
    except HTTPException:
        raise
    except HTTPError as e:
        if e.code == 403 and getattr(e, "reason", "") == "blocked redirect":
            raise HTTPException(status_code=400, detail="blocked url")
        raise HTTPException(status_code=422, detail="preview failed")
    except (URLError, TimeoutError, ValueError, OSError):
        raise HTTPException(status_code=422, detail="preview failed")


@router.get("/embed_preview")
def embed_preview(url: str = Query(..., max_length=2000), current_user: UserInfo = Depends(get_current_user)):
    raw = url.strip()
    if not url_is_allowed(raw):
        raise HTTPException(status_code=400, detail="blocked url")
    cached = cache_get(raw)
    if cached:
        return cached
    data = fetch_preview(raw)
    _preview_cache[raw] = (time.time(), data)
    return data
