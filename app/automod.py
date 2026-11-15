from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
import json

from app.auth import get_current_user
from app.database import get_db
from app.models import Automod_settings, Feedback_event, Feedback_report, UserInfo
from app.schemas import Automod_flags, Automod_term_in

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
        word = " ".join(str(item or "").split())
        if not word:
            continue
        key = word.casefold()
        if key in seen:
            continue
        seen.add(key)
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


def snapshot_text(view, texts, terms, user):
    username, shown = author_names(user)
    who = shown
    if username and shown.casefold() != username.casefold():
        who = shown + " (@" + username + ")"
    elif username:
        who = "@" + username
    lines = [
        SURFACE_LABELS.get(view, view),
        who,
        "Matched: " + ", ".join(terms),
        "",
        join_texts(texts),
    ]
    return "\n".join(lines).strip()


def open_watch_report(database, view, content_id, server_id):
    query = database.query(Feedback_report).filter(
        Feedback_report.feedback_type.in_(("auto", "automod")),
        Feedback_report.context_view == view,
        or_(Feedback_report.status.is_(None), Feedback_report.status != "completed"),
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
):
    if not terms:
        return
    view = WATCH_VIEWS.get(surface, surface)
    username, shown = author_names(user)
    body = snapshot_text(view, texts, terms, user)
    payload = json.dumps({"report": body, "matched": terms, "surface": view})
    row = open_watch_report(database, view, content_id, server_id)
    if row:
        row.report = body
        row.username = username
        row.display_name = shown
        row.target_user_id = user.id if user else None
        if channel_name:
            row.channel_name = channel_name
        if server_name:
            row.server_name = server_name
        add_auto_event(database, row.id, "update", payload)
        database.commit()
        return
    row = Feedback_report(
        user_id=None,
        username=username,
        display_name=shown,
        feedback_type="auto",
        report_kind="watch",
        report_score=1,
        report=body,
        status="new",
        context_view=view,
        server_id=str(server_id) if server_id else None,
        server_name=server_name or None,
        channel_id=int(content_id) if content_id is not None else None,
        channel_name=channel_name or None,
        target_user_id=user.id if user else None,
        alert_user=False,
        requests_info=False,
    )
    database.add(row)
    database.commit()
    database.refresh(row)
    add_auto_event(database, row.id, "created", payload)
    database.commit()


def clean_term(value):
    word = " ".join(str(value or "").split())
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
