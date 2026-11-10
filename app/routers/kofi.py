from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from hmac import compare_digest
from urllib.parse import parse_qs, urlparse
import json

from app.models import UserInfo, Kofi_settings, Kofi_payment
from app.schemas import Kofi_connect, Kofi_card
from app.database import get_db
from app.auth import get_current_user

router = APIRouter()

INCOME_KINDS = ("Donation", "Subscription")


def require_oneira_admin(user):
    if (user.username or "").strip().lower() != "kiwi":
        raise HTTPException(status_code=403, detail="Admin Panel is not available.")
    return user


def kofi_row(database):
    row = database.query(Kofi_settings).filter(Kofi_settings.id == 1).first()
    if row:
        return row
    row = Kofi_settings(id=1)
    database.add(row)
    database.commit()
    database.refresh(row)
    return row


def clean_kofi_token(value):
    return str(value or "").strip().strip('"').strip("'").strip()


def kofi_token_ok(stored, given):
    a = clean_kofi_token(stored)
    b = clean_kofi_token(given)
    if not a or not b or len(a) != len(b):
        return False
    return compare_digest(a, b)


def decode_kofi_json(raw):
    if isinstance(raw, dict):
        return raw
    text = str(raw or "").strip()
    if not text:
        return None
    for _ in range(2):
        try:
            data = json.loads(text)
        except (TypeError, ValueError, json.JSONDecodeError):
            return None
        if isinstance(data, dict):
            return data
        if isinstance(data, str):
            text = data.strip()
            continue
        return None
    return None


def payload_from_text(text):
    stripped = (text or "").strip()
    if stripped.startswith("{"):
        data = decode_kofi_json(stripped)
        if data:
            if data.get("verification_token") or data.get("type") or data.get("message_id"):
                return data
            inner = decode_kofi_json(data.get("data"))
            if inner:
                return inner
    parsed = parse_qs(text or "", keep_blank_values=True)
    if parsed.get("data"):
        data = decode_kofi_json(parsed.get("data")[0])
        if data:
            return data
    if parsed.get("verification_token") or parsed.get("type"):
        return {key: (values[0] if values else "") for key, values in parsed.items()}
    return None


async def read_kofi_payload(request: Request):
    body = await request.body()
    text = body.decode("utf-8", errors="replace") if body else ""
    data = payload_from_text(text)
    if data:
        return data
    query = str(request.url.query or "")
    if query:
        return payload_from_text(query)
    return None


def normalize_kofi_kind(raw):
    text = str(raw or "").strip().lower().replace("_", " ")
    if text in ("subscription", "membership"):
        return "Subscription"
    if text in ("shop order", "shoporder"):
        return "Shop Order"
    if text == "commission":
        return "Commission"
    return "Donation"


def stamp_kofi_webhook(database, row, ok):
    row.last_webhook_at = datetime.utcnow()
    row.last_webhook_ok = bool(ok)
    database.commit()


def parse_kofi_time(raw):
    text = str(raw or "").strip()
    if not text:
        return datetime.utcnow()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        when = datetime.fromisoformat(text)
        if when.tzinfo:
            return when.replace(tzinfo=None)
        return when
    except ValueError:
        return datetime.utcnow()


def kofi_flag(value):
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in ("1", "true", "yes")


def parse_kofi_amount(raw):
    try:
        return float(str(raw or "0").replace(",", "").strip() or 0)
    except ValueError:
        return 0.0


def format_kofi_money(amount, currency="USD"):
    value = parse_kofi_amount(amount)
    code = (currency or "USD").strip().upper() or "USD"
    text = "{:.2f}".format(value)
    if code == "USD":
        return "$" + text
    return text + " " + code


def normalize_kofi_page(url):
    text = (url or "").strip()
    if not text:
        return ""
    if "://" not in text:
        text = "https://" + text
    parsed = urlparse(text)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https":
        raise HTTPException(status_code=400, detail="Ko-fi link must use https.")
    if host not in ("ko-fi.com", "www.ko-fi.com"):
        raise HTTPException(status_code=400, detail="Link must be a Ko-fi page.")
    path = parsed.path or "/"
    return "https://ko-fi.com" + path + (("?" + parsed.query) if parsed.query else "")


def pack_kofi_card(row):
    url = (row.page_url if row else "") or ""
    disclaimer = (row.disclaimer if row else "") or ""
    return {
        "page_url": url,
        "disclaimer": disclaimer,
        "ready": bool(url.strip() and disclaimer.strip()),
    }


def pack_kofi_status(row):
    card = pack_kofi_card(row)
    return {
        "connected": bool(row and (row.verification_token or "").strip()),
        "connected_at": str(row.connected_at) if row and row.connected_at else None,
        "last_webhook_at": str(row.last_webhook_at) if row and row.last_webhook_at else None,
        "last_webhook_ok": bool(row.last_webhook_ok) if row else False,
        "page_url": card["page_url"],
        "disclaimer": card["disclaimer"],
        "ready": card["ready"],
    }


def income_query(database):
    return database.query(Kofi_payment)


def sum_payments(rows):
    total = 0.0
    for row in rows:
        total += parse_kofi_amount(row.amount)
    return total


def kofi_window(database, start, end):
    return income_query(database).filter(Kofi_payment.paid_at >= start, Kofi_payment.paid_at < end).all()


def pack_kofi_stats(database, row):
    connected = bool(row and (row.verification_token or "").strip())
    now = datetime.utcnow()
    day = now - timedelta(hours=24)
    prev = now - timedelta(hours=48)
    week = now - timedelta(days=7)
    prev_week = now - timedelta(days=14)
    def income_only(rows):
        return [item for item in rows if normalize_kofi_kind(item.kind) in INCOME_KINDS]
    all_rows = income_only(income_query(database).order_by(Kofi_payment.paid_at.desc(), Kofi_payment.id.desc()).all())
    day_rows = income_only(kofi_window(database, day, now))
    prev_day_rows = income_only(kofi_window(database, prev, day))
    week_rows = income_only(kofi_window(database, week, now))
    prev_week_rows = income_only(kofi_window(database, prev_week, week))
    donations = [item for item in all_rows if normalize_kofi_kind(item.kind) == "Donation"]
    subs = [item for item in all_rows if normalize_kofi_kind(item.kind) == "Subscription"]
    donations_24h = len([item for item in day_rows if normalize_kofi_kind(item.kind) == "Donation"])
    subs_24h = len([item for item in day_rows if normalize_kofi_kind(item.kind) == "Subscription"])
    public_24h = len([item for item in day_rows if item.is_public])
    income = sum_payments(all_rows)
    income_24h = sum_payments(day_rows)
    income_prev = sum_payments(prev_day_rows)
    week_total = sum_payments(week_rows)
    prev_week_total = sum_payments(prev_week_rows)
    bars = []
    for i in range(6, -1, -1):
        start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=i)
        end = start + timedelta(days=1)
        chunk = kofi_window(database, start, end)
        bars.append({
            "label": start.strftime("%b ") + str(start.day),
            "value": round(sum_payments(chunk), 2),
        })
    recent = []
    for item in all_rows[:12]:
        recent.append({
            "kind": item.kind or "",
            "from_name": item.from_name or "Anonymous",
            "amount": format_kofi_money(item.amount, item.currency),
            "paid_at": str(item.paid_at) if item.paid_at else None,
            "is_public": bool(item.is_public),
        })
    return {
        "connected": connected,
        "income": format_kofi_money(income),
        "income_raw": income,
        "income_24h": format_kofi_money(income_24h),
        "income_24h_raw": income_24h,
        "income_prev_raw": income_prev,
        "week": format_kofi_money(week_total),
        "week_raw": week_total,
        "prev_week_raw": prev_week_total,
        "donations": len(donations),
        "donations_24h": donations_24h,
        "subscriptions": len(subs),
        "subscriptions_24h": subs_24h,
        "public_24h": public_24h,
        "payments_24h": len(day_rows),
        "bars": bars,
        "recent": recent,
        "last_webhook_at": str(row.last_webhook_at) if row and row.last_webhook_at else None,
        "last_webhook_ok": bool(row.last_webhook_ok) if row else False,
    }


@router.get("/admin/kofi")
def admin_kofi_status(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    return pack_kofi_status(kofi_row(database))


@router.get("/admin/kofi/stats")
def admin_kofi_stats(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    return pack_kofi_stats(database, kofi_row(database))


@router.post("/admin/kofi/connect")
def admin_kofi_connect(
    body: Kofi_connect,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    token = clean_kofi_token(body.verification_token)
    if not token:
        raise HTTPException(status_code=400, detail="Verification token is required.")
    if len(token) > 200:
        raise HTTPException(status_code=400, detail="Verification token is too long.")
    row = kofi_row(database)
    row.verification_token = token
    row.connected_at = datetime.utcnow()
    database.commit()
    return pack_kofi_status(row)


@router.post("/admin/kofi/card")
def admin_kofi_card(
    body: Kofi_card,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    disclaimer = (body.disclaimer or "").strip()
    if len(disclaimer) > 4000:
        raise HTTPException(status_code=400, detail="Disclaimer is too long.")
    row = kofi_row(database)
    row.page_url = normalize_kofi_page(body.page_url) or None
    row.disclaimer = disclaimer or None
    database.commit()
    return pack_kofi_status(row)


@router.get("/kofi/card")
def public_kofi_card(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    return pack_kofi_card(kofi_row(database))


@router.post("/admin/kofi/disconnect")
def admin_kofi_disconnect(
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    require_oneira_admin(current_user)
    row = kofi_row(database)
    row.verification_token = None
    row.connected_at = None
    database.commit()
    return pack_kofi_status(row)


async def kofi_webhook(request: Request, database: Session = Depends(get_db)):
    if request.method == "GET":
        return {"ok": True}
    row = kofi_row(database)
    payload_data = await read_kofi_payload(request)
    if not isinstance(payload_data, dict):
        stamp_kofi_webhook(database, row, False)
        raise HTTPException(status_code=400, detail="Invalid Ko-fi payload.")
    if not kofi_token_ok(row.verification_token, payload_data.get("verification_token")):
        stamp_kofi_webhook(database, row, False)
        raise HTTPException(status_code=401, detail="Invalid Ko-fi token.")
    message_id = str(payload_data.get("message_id") or "").strip()
    transaction_id = str(payload_data.get("kofi_transaction_id") or "").strip() or None
    if message_id:
        existing = database.query(Kofi_payment).filter(Kofi_payment.message_id == message_id).first()
        if existing:
            stamp_kofi_webhook(database, row, True)
            return {"ok": True}
    if transaction_id:
        existing = database.query(Kofi_payment).filter(Kofi_payment.transaction_id == transaction_id).first()
        if existing:
            stamp_kofi_webhook(database, row, True)
            return {"ok": True}
    payment = Kofi_payment(
        message_id=message_id or ("kofi-" + datetime.utcnow().strftime("%Y%m%d%H%M%S%f")),
        transaction_id=transaction_id,
        kind=normalize_kofi_kind(payload_data.get("type")),
        from_name=str(payload_data.get("from_name") or "").strip() or None,
        amount=str(payload_data.get("amount") or "").strip() or "0",
        currency=str(payload_data.get("currency") or "USD").strip() or "USD",
        is_public=kofi_flag(payload_data.get("is_public")),
        paid_at=parse_kofi_time(payload_data.get("timestamp")),
        created_at=datetime.utcnow(),
        tier_name=str(payload_data.get("tier_name") or "").strip() or None,
    )
    database.add(payment)
    stamp_kofi_webhook(database, row, True)
    return {"ok": True}


router.add_api_route("/kofi/webhook", kofi_webhook, methods=["GET", "POST"])
router.add_api_route("/kofi/webhook/", kofi_webhook, methods=["GET", "POST"])
