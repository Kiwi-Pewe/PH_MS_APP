from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
import json
import re

from app.auth import get_current_user
from app.database import get_db
from app.models import Site_rules, UserInfo
from app.schemas import Site_rules_in, Site_rules_name_in

router = APIRouter()

TOS_MAX = 20000
NAME_MAX = 32
NAME_LIST_MAX = 100
NAME_RE = re.compile(r"^[A-Za-z0-9_]+$")


def require_oneira_admin(user):
    if (user.username or "").strip().lower() != "kiwi":
        raise HTTPException(status_code=403, detail="Admin Panel is not available.")
    return user


def fold_name(value):
    return str(value or "").strip().casefold()


def parse_names(raw):
    try:
        data = json.loads(raw or "[]")
    except (TypeError, ValueError):
        return []
    if not isinstance(data, list):
        return []
    out = []
    seen = set()
    for item in data:
        word = str(item or "").strip()
        if not word:
            continue
        key = word.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(word)
    return out


def clean_name(value):
    word = str(value or "").strip()
    if len(word) < 2 or len(word) > NAME_MAX:
        return ""
    if not NAME_RE.match(word):
        return ""
    return word


def clip_tos(value):
    text = str(value or "").replace("\r\n", "\n")
    if len(text) > TOS_MAX:
        return text[:TOS_MAX]
    return text


def rules_row(database):
    row = database.query(Site_rules).filter(Site_rules.id == 1).first()
    if row:
        return row
    row = Site_rules(id=1, tos="", reserved_names="[]")
    database.add(row)
    database.commit()
    database.refresh(row)
    return row


def pack_rules(row):
    return {
        "tos": clip_tos(row.tos if row else ""),
        "reserved_names": parse_names(row.reserved_names if row else "[]"),
    }


def load_public(database):
    return {"tos": pack_rules(rules_row(database))["tos"]}


def name_is_reserved(database, username):
    key = fold_name(username)
    if not key:
        return False
    for item in parse_names(rules_row(database).reserved_names):
        if fold_name(item) == key:
            return True
    return False


def require_register_confirms(database, over_18, read_tos):
    if not over_18:
        raise HTTPException(status_code=400, detail="Confirm you are over 18.")
    tos = (load_public(database)["tos"] or "").strip()
    if tos and not read_tos:
        raise HTTPException(status_code=400, detail="Confirm you have read the Site Rules.")


@router.get("/site_rules")
def site_rules_public(database: Session = Depends(get_db)):
    return load_public(database)


@router.get("/admin/site_rules")
def admin_site_rules_get(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    return pack_rules(rules_row(database))


@router.post("/admin/site_rules")
def admin_site_rules_save(
    body: Site_rules_in,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    row = rules_row(database)
    if body.tos is not None:
        row.tos = clip_tos(body.tos)
    database.commit()
    database.refresh(row)
    return pack_rules(row)


@router.post("/admin/site_rules/names")
def admin_site_rules_add_name(
    body: Site_rules_name_in,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    label = clean_name(body.label)
    if not label:
        raise HTTPException(status_code=400, detail="Use a username of 2–32 letters, numbers, or underscores.")
    row = rules_row(database)
    names = parse_names(row.reserved_names)
    key = label.casefold()
    if key not in {item.casefold() for item in names}:
        if len(names) >= NAME_LIST_MAX:
            raise HTTPException(status_code=400, detail="That list is full.")
        names.append(label)
        row.reserved_names = json.dumps(names)
        database.commit()
        database.refresh(row)
    return pack_rules(row)


@router.delete("/admin/site_rules/names")
def admin_site_rules_remove_name(
    label: str = Query(""),
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    key = fold_name(label)
    row = rules_row(database)
    names = [item for item in parse_names(row.reserved_names) if fold_name(item) != key]
    row.reserved_names = json.dumps(names)
    database.commit()
    database.refresh(row)
    return pack_rules(row)
