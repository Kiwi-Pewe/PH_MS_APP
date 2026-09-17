from fastapi import APIRouter, Depends, HTTPException, Response, Cookie, Request
from sqlalchemy.orm import Session
from app.models import UserInfo, Active_Sessions
from app.schemas import (
    Account_register, Account_login, Account_field_edit, Account_password_change,
    Account_mfa_confirm, Account_mfa_disable, Account_login_mfa, Account_revoke_session,
    Account_privacy_edit,
)
from app.database import get_db
from app.auth import pwd_context, create_session_id, get_current_user
from app.routers.appearance import appearance_payload
from datetime import datetime, timedelta
import re
import secrets

try:
    import pyotp
except ImportError:
    pyotp = None

router = APIRouter()

def public_display_name(user):
    return (user.display_name or user.username or "").strip() or user.username

def require_password(user, password):
    if not password or not pwd_context.verify(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Password is incorrect.")

def client_ip(request: Request):
    forwarded = (request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if forwarded:
        return forwarded
    return request.client.host if request.client else ""

def client_location(request: Request):
    country = (request.headers.get("cf-ipcountry") or "").strip().upper()
    if country and country != "XX":
        return country
    return "Unknown location"

def parse_user_agent(ua):
    text = ua or ""
    lower = text.lower()
    if "android" in lower:
        device = "Android"
    elif "iphone" in lower or "ipad" in lower:
        device = "iOS"
    elif "windows" in lower:
        device = "Windows"
    elif "mac os" in lower or "macintosh" in lower:
        device = "macOS"
    elif "linux" in lower:
        device = "Linux"
    else:
        device = "Unknown"
    if "electron" in lower:
        client = "Oneira Client"
    elif "edg/" in lower:
        client = "Edge"
    elif "chrome" in lower and "chromium" not in lower:
        client = "Chrome"
    elif "firefox" in lower:
        client = "Firefox"
    elif "safari" in lower and "chrome" not in lower:
        client = "Safari"
    else:
        client = "Browser"
    return device, client

def stamp_new_session(database, user_id, request: Request):
    device, client = parse_user_agent(request.headers.get("user-agent") or "")
    row = Active_Sessions(
        session_id= create_session_id(32),
        account_id= user_id,
        last_active= datetime.now(),
        user_agent= (request.headers.get("user-agent") or "")[:300],
        ip_address= client_ip(request),
        location= client_location(request),
        device_label= device,
        client_label= client,
    )
    database.add(row)
    database.commit()
    database.refresh(row)
    return row

def set_session_cookie(response: Response, session_id):
    response.set_cookie(
        samesite="none",
        secure=True,
        key="session_id",
        value= session_id,
        httponly=True,
        max_age= 60 * 60 * 24 * 30
    )

def clean_username(value):
    name = (value or "").strip()
    if len(name) < 2 or len(name) > 32:
        raise HTTPException(status_code=400, detail="Username must be 2–32 characters.")
    if not re.match(r"^[A-Za-z0-9_]+$", name):
        raise HTTPException(status_code=400, detail="Username can only use letters, numbers, and underscores.")
    return name

def clean_display_name(value):
    name = (value or "").strip()
    if len(name) < 1 or len(name) > 32:
        raise HTTPException(status_code=400, detail="Display name must be 1–32 characters.")
    return name

def clean_email(value):
    email = (value or "").strip()
    if not email:
        return None
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email) or len(email) > 120:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    return email

def clean_phone(value):
    phone = re.sub(r"\s+", " ", (value or "").strip())
    if not phone:
        return None
    if not re.match(r"^[+\d][\d\s().-]{6,24}$", phone):
        raise HTTPException(status_code=400, detail="Enter a valid phone number.")
    return phone

def mask_email(email):
    if not email or "@" not in email:
        return email
    name, domain = email.split("@", 1)
    if len(name) <= 1:
        hidden = "*"
    else:
        hidden = name[0] + ("*" * min(8, max(1, len(name) - 1)))
    return hidden + "@" + domain

def mask_phone(phone):
    if not phone:
        return phone
    digits = re.sub(r"\D", "", phone)
    last = digits[-4:] if digits else ""
    if not last:
        return "***-***-****"
    return "***-***-" + last

def session_payload(row, current_session_id):
    return {
        "session_id": row.session_id,
        "current": row.session_id == current_session_id,
        "device_label": row.device_label or "Unknown",
        "client_label": row.client_label or "Browser",
        "location": row.location or "Unknown location",
        "last_active": str(row.last_active) if row.last_active else None,
        "created_at": str(row.created_at) if row.created_at else None,
    }

@router.get("/home")
def home_page():
    return "Home Page"

@router.post("/login")
def login_account(account: Account_login, request: Request, response: Response, database : Session = Depends(get_db)):

    existing_user = database.query(UserInfo).filter(UserInfo.username == account.username).first()
    
    if not existing_user:
        raise HTTPException(status_code = 401, detail= "Username or Password is incorrect.")
    correct_password = pwd_context.verify(account.password, existing_user.hashed_password)
    if not correct_password:
        raise HTTPException(status_code = 401, detail= "Username or Password is incorrect.")

    if existing_user.mfa_enabled:
        existing_user.mfa_challenge = create_session_id(24)
        existing_user.mfa_challenge_until = datetime.now() + timedelta(minutes=5)
        database.commit()
        return {"mfa_required": True, "username": existing_user.username}

    session_row = stamp_new_session(database, existing_user.id, request)
    set_session_cookie(response, session_row.session_id)
    return {"id": existing_user.id, "username": existing_user.username, "display_name": public_display_name(existing_user), "mfa_required": False}

@router.post("/login_mfa")
def login_account_mfa(account: Account_login_mfa, request: Request, response: Response, database: Session = Depends(get_db)):
    if not pyotp:
        raise HTTPException(status_code=500, detail="Authenticator support is not installed.")
    user = database.query(UserInfo).filter(UserInfo.username == account.username).first()
    if not user or not user.mfa_enabled or not user.mfa_secret:
        raise HTTPException(status_code=401, detail="Authenticator login failed.")
    if not user.mfa_challenge or not user.mfa_challenge_until or datetime.now() > user.mfa_challenge_until:
        raise HTTPException(status_code=401, detail="Authenticator login expired. Log in again.")
    if not pyotp.TOTP(user.mfa_secret).verify((account.code or "").strip(), valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid authenticator code.")
    user.mfa_challenge = None
    user.mfa_challenge_until = None
    database.commit()
    session_row = stamp_new_session(database, user.id, request)
    set_session_cookie(response, session_row.session_id)
    return {"id": user.id, "username": user.username, "display_name": public_display_name(user), "mfa_required": False}

@router.post("/logout")
def logout_account(response:Response, session_id: str = Cookie(None), database: Session = Depends(get_db)):

    existing_session = database.query(Active_Sessions).filter(Active_Sessions.session_id == session_id).first()
    if existing_session:
        database.delete(existing_session)
        database.commit()
        response.delete_cookie(key="session_id", samesite="none", secure=True)
    return

@router.post("/register", status_code = 201)
def create_account(account: Account_register, database : Session = Depends(get_db)):
    username = clean_username(account.username)
    existing_username = database.query(UserInfo).filter(UserInfo.username == username).first()

    if existing_username:
        raise HTTPException(status_code= 409 , detail= "Username is already taken." )
    if not (account.password or "").strip():
        raise HTTPException(status_code=400, detail="Password is required.")

    info = UserInfo(
        username= username,
        hashed_password= pwd_context.hash(account.password),
        display_name= username,
        email= None,
        phone= None,
        mfa_enabled= False,
        profile_visibility= "friends_all",
        friend_req_everyone= True,
        friend_req_friends_of_friends= True,
        friend_req_server_members= True,
        allow_server_dms= True,
        notify_sound_message= True,
        notify_sound_current= False,
        notify_sound_ring= True,
        notify_sound_mute_all= False,
        notify_reactions= "all",
    )
    database.add(info)
    database.commit()
    database.refresh(info)
    return {"id": info.id, "username": info.username, "display_name": info.display_name}

@router.get("/whoami")
def self_identity(current_user: UserInfo = Depends(get_current_user)):
    return {
        "username": current_user.username,
        "id": current_user.id,
        "display_name": public_display_name(current_user),
        "appearance": appearance_payload(current_user),
    }

@router.get("/account_settings")
def get_account_settings(current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db), session_id: str = Cookie(None)):
    device_count = database.query(Active_Sessions).filter(Active_Sessions.account_id == current_user.id).count()
    return {
        "username": current_user.username,
        "display_name": public_display_name(current_user),
        "email": current_user.email or "",
        "email_masked": mask_email(current_user.email) if current_user.email else "",
        "phone": current_user.phone or "",
        "phone_masked": mask_phone(current_user.phone) if current_user.phone else "",
        "mfa_enabled": bool(current_user.mfa_enabled),
        "device_count": device_count,
        "current_session_id": session_id,
    }

@router.post("/account_username")
def update_account_username(edit: Account_field_edit, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    require_password(current_user, edit.password)
    username = clean_username(edit.value)
    taken = database.query(UserInfo).filter(UserInfo.username == username, UserInfo.id != current_user.id).first()
    if taken:
        raise HTTPException(status_code=409, detail="Username is already taken.")
    current_user.username = username
    database.commit()
    return {"username": current_user.username, "display_name": public_display_name(current_user)}

@router.post("/account_display_name")
def update_account_display_name(edit: Account_field_edit, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    current_user.display_name = clean_display_name(edit.value)
    database.commit()
    return {"display_name": public_display_name(current_user)}

@router.post("/account_email")
def update_account_email(edit: Account_field_edit, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    require_password(current_user, edit.password)
    email = clean_email(edit.value)
    if email:
        taken = database.query(UserInfo).filter(UserInfo.email == email, UserInfo.id != current_user.id).first()
        if taken:
            raise HTTPException(status_code=409, detail="That email is already in use.")
    current_user.email = email
    database.commit()
    return {"email": current_user.email or "", "email_masked": mask_email(current_user.email) if current_user.email else ""}

@router.post("/account_phone")
def update_account_phone(edit: Account_field_edit, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    require_password(current_user, edit.password)
    current_user.phone = clean_phone(edit.value)
    database.commit()
    return {"phone": current_user.phone or "", "phone_masked": mask_phone(current_user.phone) if current_user.phone else ""}

@router.post("/account_password")
def update_account_password(edit: Account_password_change, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    require_password(current_user, edit.current_password)
    if not (edit.new_password or "").strip():
        raise HTTPException(status_code=400, detail="New password is required.")
    if edit.new_password == edit.current_password:
        raise HTTPException(status_code=400, detail="Pick a different password.")
    current_user.hashed_password = pwd_context.hash(edit.new_password)
    database.commit()
    return {"ok": True}

@router.get("/account_devices")
def list_account_devices(request: Request, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db), session_id: str = Cookie(None)):
    rows = database.query(Active_Sessions).filter(Active_Sessions.account_id == current_user.id).order_by(Active_Sessions.last_active.desc()).all()
    for row in rows:
        if row.session_id != session_id:
            continue
        device, client = parse_user_agent(request.headers.get("user-agent") or "")
        row.user_agent = (request.headers.get("user-agent") or "")[:300]
        row.ip_address = client_ip(request)
        row.location = client_location(request)
        row.device_label = device
        row.client_label = client
        row.last_active = datetime.now()
        database.commit()
        database.refresh(row)
        break
    return {"devices": [session_payload(row, session_id) for row in rows]}

@router.post("/account_devices/revoke")
def revoke_account_device(target: Account_revoke_session, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db), session_id: str = Cookie(None)):
    row = database.query(Active_Sessions).filter(Active_Sessions.session_id == target.session_id, Active_Sessions.account_id == current_user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Device not found.")
    if row.session_id == session_id:
        raise HTTPException(status_code=400, detail="Use Log Out for this device.")
    database.delete(row)
    database.commit()
    return {"ok": True}

@router.post("/account_devices/revoke_all")
def revoke_all_account_devices(response: Response, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    database.query(Active_Sessions).filter(Active_Sessions.account_id == current_user.id).delete()
    database.commit()
    response.delete_cookie(key="session_id", samesite="none", secure=True)
    return {"ok": True}

@router.post("/account_mfa/begin")
def begin_account_mfa(current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    if not pyotp:
        raise HTTPException(status_code=500, detail="Authenticator support is not installed.")
    if current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="Authenticator is already enabled.")
    secret = pyotp.random_base32()
    current_user.mfa_secret = secret
    current_user.mfa_enabled = False
    database.commit()
    uri = pyotp.TOTP(secret).provisioning_uri(name=current_user.username, issuer_name="Oneira")
    return {"secret": secret, "otpauth_url": uri}

@router.post("/account_mfa/confirm")
def confirm_account_mfa(body: Account_mfa_confirm, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    if not pyotp:
        raise HTTPException(status_code=500, detail="Authenticator support is not installed.")
    if not current_user.mfa_secret:
        raise HTTPException(status_code=400, detail="Start authenticator setup first.")
    if not pyotp.TOTP(current_user.mfa_secret).verify((body.code or "").strip(), valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid authenticator code.")
    current_user.mfa_enabled = True
    database.commit()
    return {"mfa_enabled": True}

@router.post("/account_mfa/disable")
def disable_account_mfa(body: Account_mfa_disable, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    if not pyotp:
        raise HTTPException(status_code=500, detail="Authenticator support is not installed.")
    require_password(current_user, body.password)
    if not current_user.mfa_enabled or not current_user.mfa_secret:
        current_user.mfa_enabled = False
        current_user.mfa_secret = None
        database.commit()
        return {"mfa_enabled": False}
    if not pyotp.TOTP(current_user.mfa_secret).verify((body.code or "").strip(), valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid authenticator code.")
    current_user.mfa_enabled = False
    current_user.mfa_secret = None
    database.commit()
    return {"mfa_enabled": False}

PROFILE_VISIBILITY = ("friends_all", "friends_small", "friends_only")

def public_profile_visibility(user):
    value = (user.profile_visibility or "").strip()
    if value in PROFILE_VISIBILITY:
        return value
    return "friends_all"

@router.get("/privacy_settings")
def get_privacy_settings(current_user: UserInfo = Depends(get_current_user)):
    return {"profile_visibility": public_profile_visibility(current_user)}

@router.post("/privacy_visibility")
def update_privacy_visibility(edit: Account_privacy_edit, current_user: UserInfo = Depends(get_current_user), database: Session = Depends(get_db)):
    value = (edit.value or "").strip()
    if value not in PROFILE_VISIBILITY:
        raise HTTPException(status_code=400, detail="Pick a valid profile visibility.")
    current_user.profile_visibility = value
    database.commit()
    return {"profile_visibility": value}
