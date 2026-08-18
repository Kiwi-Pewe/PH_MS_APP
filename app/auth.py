from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Cookie
from sqlalchemy.orm import Session
from app.models import Active_Sessions, UserInfo
from app.database import get_db
from datetime import datetime, timedelta
import secrets

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_session_id(key):
    return secrets.token_urlsafe(key)

def validate_session(session_id, database: Session):
    if not session_id:
        return None

    session_exist = database.query(Active_Sessions).filter(Active_Sessions.session_id == session_id).first()
    if not session_exist:
        return None

    time_since_active = datetime.now() - session_exist.last_active
    if time_since_active > timedelta(days=30):
        return None

    user_account = database.query(UserInfo).filter(UserInfo.id == session_exist.account_id).first()
    session_exist.last_active = datetime.now()
    database.commit()
    return user_account

def get_current_user(session_id: str = Cookie(None), database: Session = Depends(get_db)):
    """Dependency for normal HTTP routes — raises 401 if the session is missing/invalid/expired."""

    user_account = validate_session(session_id, database)
    if not user_account:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    return user_account