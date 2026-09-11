from fastapi import APIRouter, Depends, HTTPException, Response, Cookie
from sqlalchemy.orm import Session
from app.models import UserInfo, Active_Sessions
from app.schemas import Account_register, Account_login
from app.database import get_db
from app.auth import pwd_context, create_session_id, get_current_user
from datetime import datetime

router = APIRouter()

@router.get("/home")
def home_page():
    return "Home Page"

@router.post("/login")
def login_account(account: Account_login, response: Response, database : Session = Depends(get_db)):

    existing_user = database.query(UserInfo).filter(UserInfo.username == account.username).first()
    
    if not existing_user:
        raise HTTPException(status_code = 401, detail= "Username or Password is incorrect.")
    correct_password = pwd_context.verify(account.password, existing_user.hashed_password)
    if not correct_password:
        raise HTTPException(status_code = 401, detail= "Username or Password is incorrect.")

    existing_session_id = database.query(Active_Sessions).filter(Active_Sessions.account_id == existing_user.id).first()

    if not existing_session_id:
        new_id = create_session_id(32)
        new_session_id = Active_Sessions(session_id =  new_id, account_id = existing_user.id)
        database.add(new_session_id)
        database.commit()
        database.refresh(new_session_id)
        response.set_cookie(
        samesite="none",
        secure=True,
        key='session_id',
        value= new_id,
        httponly=True,
        max_age= 60 * 60 * 24 * 30
        )
    else:
        existing_session_id.last_active = datetime.now()
        database.commit()
        response.set_cookie(
        samesite="none",
        secure=True,
        key='session_id',
        value= existing_session_id.session_id,
        httponly=True,
        max_age= 60 * 60 * 24 * 30
        )

    return existing_user

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

    existing_username = database.query(UserInfo).filter(UserInfo.username == account.username).first()

    if existing_username:
        raise HTTPException(status_code= 409 , detail= "Username is already taken." )   
    
    info = UserInfo(username = account.username, hashed_password = pwd_context.hash(account.password))    
    database.add(info)
    database.commit()
    database.refresh(info)
    return info

@router.get("/whoami")
def self_identity(current_user: UserInfo = Depends(get_current_user)):
    return {"username": current_user.username, "id": current_user.id}
