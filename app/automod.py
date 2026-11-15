from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
import json

from app.auth import get_current_user
from app.database import get_db
from app.models import (
    Automod_settings,
    Community_lock,
    Community_phone_message,
    Feedback_event,
    Feedback_report,
    UserInfo,
)
from app.schemas import Automod_flags, Automod_term_in
from app.site_moderation import is_protected_account, set_community_lock

router = APIRouter()

REJECT_POST = "This can't be posted."
REJECT_PUBLIC = "This server can't be made public."
SURFACES = ("posts", "comments", "rooms", "phone", "listings")
TERM_MAX = 40
TERM_LIST_MAX = 100
WATCH_VIEWS = {
    "posts": "post",
    "comments": "comment",
    "rooms": "room",
    "room_message": "room_message",
    "phone": "phone",
    "listings": "listing",
}
SURFACE_LABELS = {
    "post": "Community post",
    "comment": "Community comment",
    "room": "Community room",
    "room_message": "Community room message",
    "phone": "Phone a User",
    "listing": "Public listing",
}
LEAD = {
    "posts": ("tried to post", "posted"),
    "comments": ("tried to comment", "commented"),
    "rooms_create": ("tried to create a room", "created a room"),
    "rooms_edit": ("tried to edit a room", "edited a room"),
    "room_message": ("tried to send a room message", "sent a room message"),
    "phone": ("tried to send a Phone a User message", "sent a Phone a User message"),
    "listings_public": ("tried to make a server public", "made a server public"),
    "listings_edit": ("tried to update a public listing", "updated a public listing"),
}
TRAIL_VIEWS = {
    "posts": "post",
    "comments": "comment",
    "rooms_create": "room",
    "rooms_edit": "room",
    "room_message": "room_message",
    "phone": "phone",
    "listings_public": "listing",
    "listings_edit": "listing",
}
AUTO_FLAG_AT = 5
AUTO_DONE = ("completed", "closed")


def require_oneira_admin(user):
    if (user.username or "").strip().lower() != "kiwi":
        raise HTTPException(status_code=403, detail="Admin Panel is not available.")
    return user


def fold_text(value):
    return " ".join(str(value or "").split()).casefold()


def join_texts(parts):
    lines = []
    for part in parts or []:
        text = str(part or "").strip()
        if text:
            lines.append(text)
    return "\n".join(lines)


def parse_terms(raw):
    try:
        data = json.loads(raw or "[]")
    except (TypeError, ValueError):
        return []
    if not isinstance(data, list):
        return []
    out = []
    seen = set()
    for item in data:
        word = fold_text(item)
        if not word:
            continue
        if word in seen:
            continue
        seen.add(word)
        out.append(word)
    return out


def parse_surfaces(raw):
    flags = {key: True for key in SURFACES}
    try:
        data = json.loads(raw or "{}")
    except (TypeError, ValueError):
        data = {}
    if isinstance(data, dict):
        for key in SURFACES:
            if key in data:
                flags[key] = bool(data[key])
    return flags


def automod_row(database):
    row = database.query(Automod_settings).filter(Automod_settings.id == 1).first()
    if row:
        return row
    row = Automod_settings(
        id=1,
        enabled=True,
        blacklist="[]",
        watchlist="[]",
        surfaces=json.dumps({key: True for key in SURFACES}),
    )
    database.add(row)
    database.commit()
    database.refresh(row)
    return row


def load_settings(database):
    row = automod_row(database)
    return {
        "enabled": bool(row.enabled),
        "blacklist": parse_terms(row.blacklist),
        "watchlist": parse_terms(row.watchlist),
        "surfaces": parse_surfaces(row.surfaces),
    }


def pack_settings(row):
    return {
        "enabled": bool(row.enabled),
        "blacklist": parse_terms(row.blacklist),
        "watchlist": parse_terms(row.watchlist),
        "surfaces": parse_surfaces(row.surfaces),
    }


def match_terms(text, terms):
    folded = fold_text(text)
    if not folded:
        return []
    hits = []
    for term in terms or []:
        needle = fold_text(term)
        if needle and needle in folded:
            hits.append(term)
    return hits


def inspect(database, surface, texts):
    empty = {"blacklist": [], "watch": []}
    settings = load_settings(database)
    if not settings["enabled"]:
        return empty
    if surface == "room_message":
        on = settings["surfaces"].get("rooms", True)
    else:
        on = settings["surfaces"].get(surface, True)
    if not on:
        return empty
    blob = join_texts(texts)
    if not blob:
        return empty
    return {
        "blacklist": match_terms(blob, settings["blacklist"]),
        "watch": match_terms(blob, settings["watchlist"]),
    }


def refuse_blacklist(hits, public=False):
    if hits and hits.get("blacklist"):
        raise HTTPException(status_code=400, detail=REJECT_PUBLIC if public else REJECT_POST)


def author_names(user):
    username = ((user.username if user else "") or "").strip()
    shown = ((getattr(user, "display_name", None) if user else "") or "").strip() or username
    return username, shown


def phrase_words(terms):
    return ", ".join([str(item) for item in (terms or []) if str(item).strip()])


def lead_line(user, action, kind, terms):
    username, _shown = author_names(user)
    who = username or "A user"
    pair = LEAD.get(action) or LEAD.get("posts")
    verb = pair[0] if kind == "blacklist" else pair[1]
    label = "blacklisted phrase" if kind == "blacklist" else "watch phrase"
    return who + " " + verb + " with the " + label + ": " + phrase_words(terms)


def location_lines(kind, loc):
    loc = loc or {}
    lines = []
    post_code = loc.get("post_code") or ""
    room_id = loc.get("room_id")
    room_name = loc.get("room_name") or ""
    server_id = loc.get("server_id")
    server_name = loc.get("server_name") or ""
    server_slug = loc.get("server_slug") or ""
    call_id = loc.get("call_id")
    if post_code:
        lines.append("Post code: " + str(post_code))
    if room_id is not None:
        label = room_name + " (" + str(room_id) + ")" if room_name else str(room_id)
        lines.append("Room: " + label)
    if server_id:
        label = server_name + " (" + str(server_id) + ")" if server_name else str(server_id)
        lines.append("Server: " + label)
    if server_slug:
        lines.append("oneira.cc/" + str(server_slug).lstrip("/"))
    if call_id is not None:
        lines.append("Phone call: " + str(call_id))
    if kind == "watch":
        if post_code:
            lines.append("Open: Admin → Community → Posts")
        elif room_id is not None:
            lines.append("Open: Admin → Community → Rooms")
        elif server_id:
            lines.append("Open: Admin → Servers")
    return lines


def auto_report_open():
    return or_(
        Feedback_report.status.is_(None),
        ~Feedback_report.status.in_(AUTO_DONE),
    )


def paper_trail(action, kind, texts, loc, count, transcript="", terms=None):
    view = TRAIL_VIEWS.get(action) or WATCH_VIEWS.get(action, action)
    lines = [
        "Where: " + SURFACE_LABELS.get(view, view),
        "Attempted:" if kind == "blacklist" else "Posted:",
        join_texts(texts) or "(empty)",
    ]
    lines.extend(location_lines(kind, loc))
    matched = phrase_words(terms)
    if matched:
        lines.append("Matched: " + matched)
    if transcript:
        lines.append("")
        lines.append(transcript)
    lines.append("Open Auto Reports: " + str(count))
    return "\n".join(lines)


def snapshot_text(user, action, kind, texts, terms, loc, count, transcript=""):
    return lead_line(user, action, kind, terms) + "\n\n" + paper_trail(action, kind, texts, loc, count, transcript, terms)


def open_auto_count(database, user_id):
    if not user_id:
        return 0
    return int(
        database.query(func.count()).select_from(Feedback_report).filter(
            Feedback_report.feedback_type.in_(("auto", "automod")),
            Feedback_report.target_user_id == user_id,
            auto_report_open(),
        ).scalar() or 0
    )


def flag_if_repeat(database, user):
    if not user or is_protected_account(user):
        return
    if open_auto_count(database, user.id) < AUTO_FLAG_AT:
        return
    found = database.query(Community_lock).filter(
        Community_lock.user_id == user.id,
        Community_lock.kind == "flagged",
    ).first()
    if found:
        return
    try:
        row = set_community_lock(database, None, user, "flagged", True, None)
        row.actor_username = "Auto mod"
        database.commit()
    except HTTPException:
        database.rollback()


def phone_transcript(database, call_id, extra_user=None, extra_content="", blocked=False):
    lines = []
    if call_id:
        rows = (
            database.query(Community_phone_message)
            .filter(Community_phone_message.call_id == int(call_id))
            .order_by(Community_phone_message.id.asc())
            .all()
        )
        for row in rows:
            author = database.query(UserInfo).filter(UserInfo.id == row.author_id).first()
            name = ((author.username if author else "") or "user").strip() or "user"
            lines.append("@" + name + ": " + (row.content or ""))
    if extra_content:
        username, _shown = author_names(extra_user)
        tag = " (not sent)" if blocked else ""
        lines.append("@" + (username or "user") + tag + ": " + extra_content)
    if not lines:
        return ""
    return "Phone transcript\n" + "\n".join(lines)


def open_watch_report(database, view, content_id, server_id):
    query = database.query(Feedback_report).filter(
        Feedback_report.feedback_type.in_(("auto", "automod")),
        Feedback_report.report_kind == "watch",
        Feedback_report.context_view == view,
        auto_report_open(),
    )
    if server_id:
        query = query.filter(Feedback_report.server_id == str(server_id))
    elif content_id is not None:
        query = query.filter(Feedback_report.channel_id == int(content_id))
    else:
        return None
    return query.order_by(Feedback_report.id.desc()).first()


def add_auto_event(database, report_id, kind, text=""):
    database.add(Feedback_event(
        report_id=report_id,
        actor_id=None,
        actor_username="Auto mod",
        kind=kind,
        text=text or "",
    ))


def resolve_action(surface, action):
    if action:
        return action
    return {
        "posts": "posts",
        "comments": "comments",
        "rooms": "rooms_create",
        "room_message": "room_message",
        "phone": "phone",
        "listings": "listings_edit",
    }.get(surface, "posts")


def file_auto_report(
    database,
    user,
    surface,
    texts,
    terms,
    kind,
    action="",
    content_id=None,
    channel_name="",
    channel_type="",
    server_id=None,
    server_name="",
    server_slug="",
    post_code="",
    room_id=None,
    room_name="",
    call_id=None,
    transcript="",
    merge=False,
):
    if not terms:
        return
    action = resolve_action(surface, action)
    view = WATCH_VIEWS.get(surface, surface)
    username, shown = author_names(user)
    loc = {
        "post_code": post_code or (channel_name if view in ("post", "comment") else ""),
        "room_id": room_id,
        "room_name": room_name,
        "server_id": server_id,
        "server_name": server_name,
        "server_slug": server_slug,
        "call_id": call_id,
    }
    open_id = None
    if content_id is not None:
        try:
            open_id = int(content_id)
        except (TypeError, ValueError):
            open_id = None
    extra_type = channel_type
    if view == "room_message" and room_id is not None:
        extra_type = str(room_id)
    elif view == "phone" and call_id is not None:
        extra_type = str(call_id)
    row = None
    created = False
    if merge and kind == "watch":
        row = open_watch_report(database, view, content_id, server_id)
    count = open_auto_count(database, user.id if user else None)
    if row:
        count = max(count, 1)
        body = snapshot_text(user, action, kind, texts, terms, loc, count, transcript)
        row.report = body
        row.username = username
        row.display_name = shown
        row.target_user_id = user.id if user else None
        if channel_name:
            row.channel_name = channel_name
        if server_name:
            row.server_name = server_name
        if extra_type:
            row.channel_type = extra_type
        add_auto_event(database, row.id, "update", json.dumps({"report": body, "matched": terms, "surface": view, "kind": kind}))
        database.commit()
        return
    count = count + 1
    body = snapshot_text(user, action, kind, texts, terms, loc, count, transcript)
    stored_name = channel_name or post_code or room_name or ""
    row = Feedback_report(
        user_id=None,
        username=username,
        display_name=shown,
        feedback_type="auto",
        report_kind=kind,
        report_score=1,
        report=body,
        status="new",
        context_view=view,
        server_id=str(server_id) if server_id else None,
        server_name=server_name or None,
        channel_id=open_id,
        channel_name=stored_name or None,
        channel_type=extra_type or None,
        target_user_id=user.id if user else None,
        alert_user=False,
        requests_info=False,
    )
    database.add(row)
    database.commit()
    database.refresh(row)
    add_auto_event(database, row.id, "created", json.dumps({"report": body, "matched": terms, "surface": view, "kind": kind}))
    database.commit()
    created = True
    if created:
        flag_if_repeat(database, user)


def report_blacklist(database, user, surface, texts, hits, public=False, action="", **loc):
    terms = (hits or {}).get("blacklist") or []
    if not terms:
        return
    file_auto_report(
        database,
        user,
        surface,
        texts,
        terms,
        kind="blacklist",
        action=action,
        merge=False,
        **loc
    )
    refuse_blacklist(hits, public=public)


def report_watch(
    database,
    user,
    surface,
    texts,
    terms,
    content_id=None,
    channel_name="",
    server_id=None,
    server_name="",
    action="",
    **loc
):
    if not terms:
        return
    file_auto_report(
        database,
        user,
        surface,
        texts,
        terms,
        kind="watch",
        action=action,
        content_id=content_id,
        channel_name=channel_name,
        server_id=server_id,
        server_name=server_name,
        merge=True,
        **loc
    )


def clean_term(value):
    word = fold_text(value)
    if len(word) > TERM_MAX:
        word = word[:TERM_MAX].rstrip()
    return word


def term_kind(value):
    key = (value or "").strip().lower()
    if key in ("blacklist", "watch", "watchlist"):
        return "watchlist" if key in ("watch", "watchlist") else "blacklist"
    raise HTTPException(status_code=400, detail="Pick Blacklisted words or Watch List.")


@router.get("/admin/automod")
def admin_automod_get(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    return pack_settings(automod_row(database))


@router.post("/admin/automod")
def admin_automod_save(
    body: Automod_flags,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    row = automod_row(database)
    if body.enabled is not None:
        row.enabled = bool(body.enabled)
    if body.surfaces is not None:
        flags = parse_surfaces(row.surfaces)
        for key in SURFACES:
            if key in body.surfaces:
                flags[key] = bool(body.surfaces[key])
        row.surfaces = json.dumps(flags)
    database.commit()
    database.refresh(row)
    return pack_settings(row)


@router.post("/admin/automod/terms")
def admin_automod_add_term(
    body: Automod_term_in,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    kind = term_kind(body.kind)
    label = clean_term(body.label)
    if not label:
        raise HTTPException(status_code=400, detail="Add a word or phrase.")
    row = automod_row(database)
    terms = parse_terms(getattr(row, kind))
    key = label.casefold()
    if key not in {item.casefold() for item in terms}:
        if len(terms) >= TERM_LIST_MAX:
            raise HTTPException(status_code=400, detail="That list is full.")
        terms.append(label)
        setattr(row, kind, json.dumps(terms))
        database.commit()
        database.refresh(row)
    return pack_settings(row)


@router.delete("/admin/automod/terms")
def admin_automod_remove_term(
    kind: str = Query(""),
    label: str = Query(""),
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    kind = term_kind(kind)
    label = clean_term(label)
    row = automod_row(database)
    terms = [item for item in parse_terms(getattr(row, kind)) if item.casefold() != label.casefold()]
    setattr(row, kind, json.dumps(terms))
    database.commit()
    database.refresh(row)
    return pack_settings(row)
