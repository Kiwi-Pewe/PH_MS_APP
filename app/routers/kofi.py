from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from hmac import compare_digest
import json

from app.models import UserInfo, Kofi_settings, Kofi_payment
from app.schemas import Kofi_connect
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


def kofi_token_ok(stored, given):
    a = (stored or "").strip()
    b = (given or "").strip()
    if not a or not b or len(a) != len(b):
        return False
    return compare_digest(a, b)


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


def pack_kofi_status(row):
    return {
        "connected": bool(row and (row.verification_token or "").strip()),
        "connected_at": str(row.connected_at) if row and row.connected_at else None,
    }


def income_query(database):
    return database.query(Kofi_payment).filter(Kofi_payment.kind.in_(INCOME_KINDS))


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
    all_rows = income_query(database).order_by(Kofi_payment.paid_at.desc(), Kofi_payment.id.desc()).all()
    day_rows = kofi_window(database, day, now)
    prev_day_rows = kofi_window(database, prev, day)
    week_rows = kofi_window(database, week, now)
    prev_week_rows = kofi_window(database, prev_week, week)
    donations = [item for item in all_rows if item.kind == "Donation"]
    subs = [item for item in all_rows if item.kind == "Subscription"]
    donations_24h = len([item for item in day_rows if item.kind == "Donation"])
    subs_24h = len([item for item in day_rows if item.kind == "Subscription"])
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
    token = (body.verification_token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Verification token is required.")
    if len(token) > 200:
        raise HTTPException(status_code=400, detail="Verification token is too long.")
    row = kofi_row(database)
    row.verification_token = token
    row.connected_at = datetime.utcnow()
    database.commit()
    return pack_kofi_status(row)


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


@router.post("/kofi/webhook")
async def kofi_webhook(request: Request, database: Session = Depends(get_db)):
    payload_data = None
    content = (request.headers.get("content-type") or "").lower()
    if "application/json" in content:
        body = await request.json()
        if isinstance(body, dict) and body.get("verification_token"):
            payload_data = body
        elif isinstance(body, dict) and body.get("data"):
            raw = body.get("data")
            if isinstance(raw, dict):
                payload_data = raw
            else:
                try:
                    payload_data = json.loads(raw)
                except (TypeError, ValueError, json.JSONDecodeError):
                    payload_data = None
    else:
        form = await request.form()
        raw = form.get("data") or ""
        if raw:
            try:
                payload_data = json.loads(raw)
            except (TypeError, ValueError, json.JSONDecodeError):
                payload_data = None
    if not isinstance(payload_data, dict):
        raise HTTPException(status_code=400, detail="Invalid Ko-fi payload.")
    row = kofi_row(database)
    if not kofi_token_ok(row.verification_token, payload_data.get("verification_token")):
        raise HTTPException(status_code=401, detail="Invalid Ko-fi token.")
    message_id = str(payload_data.get("message_id") or "").strip()
    transaction_id = str(payload_data.get("kofi_transaction_id") or "").strip() or None
    if message_id:
        existing = database.query(Kofi_payment).filter(Kofi_payment.message_id == message_id).first()
        if existing:
            return {"ok": True}
    if transaction_id:
        existing = database.query(Kofi_payment).filter(Kofi_payment.transaction_id == transaction_id).first()
        if existing:
            return {"ok": True}
    kind = str(payload_data.get("type") or "").strip() or "Donation"
    payment = Kofi_payment(
        message_id=message_id or ("kofi-" + datetime.utcnow().strftime("%Y%m%d%H%M%S%f")),
        transaction_id=transaction_id,
        kind=kind,
        from_name=str(payload_data.get("from_name") or "").strip() or None,
        amount=str(payload_data.get("amount") or "").strip() or "0",
        currency=str(payload_data.get("currency") or "USD").strip() or "USD",
        is_public=kofi_flag(payload_data.get("is_public")),
        paid_at=parse_kofi_time(payload_data.get("timestamp")),
        created_at=datetime.utcnow(),
        tier_name=str(payload_data.get("tier_name") or "").strip() or None,
    )
    database.add(payment)
    database.commit()
    return {"ok": True}
