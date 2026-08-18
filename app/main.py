# FastAPI app entry point — your endpoints will live here.
from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, HTTPException, Response, Cookie
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from app.models import UserInfo, Message, Active_Sessions
from app.schemas import Account_register, Account_login, Message_schema
from app.database import get_db, Base, engine 
from app.auth import pwd_context, create_session_id, get_current_user, validate_session
from datetime import datetime

app = FastAPI()
Base.metadata.create_all(engine)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["null"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
active_connections = {}

app.mount("/static", StaticFiles(directory="frontend", html=True), name="frontend")

@app.get("/home")
def home_page():
    return "Home Page"

@app.post("/login")
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
        key='session_id',
        value= new_id,
        httponly=True,
        max_age= 60 * 60 * 24 * 30
        )
    else:
        existing_session_id.last_active = datetime.now()
        database.commit()
        response.set_cookie(
        key='session_id',
        value= existing_session_id.session_id,
        httponly=True,
        max_age= 60 * 60 * 24 * 30
        )

    return existing_user

@app.post("/logout")
def logout_account(response:Response, session_id: str = Cookie(None), database: Session = Depends(get_db)):

    existing_session = database.query(Active_Sessions).filter(Active_Sessions.session_id == session_id).first()
    if existing_session:
        database.delete(existing_session)
        database.commit()
        response.delete_cookie(key="session_id")
    return


@app.post("/register", status_code = 201)
def create_account(account: Account_register, database : Session = Depends(get_db)):

    existing_username = database.query(UserInfo).filter(UserInfo.username == account.username).first()

    if existing_username:
        raise HTTPException(status_code= 409 , detail= "Username is already taken." )   
    
    info = UserInfo(username = account.username, hashed_password = pwd_context.hash(account.password))    
    database.add(info)
    database.commit()
    database.refresh(info)
    return info

@app.post("/messages")
def send_message(message: Message_schema, database: Session = Depends(get_db)):
    new_message = Message(sender_id = message.sender_id, 
    receiver_id = message.receiver_id,
    content = message.content
    )
    database.add(new_message)
    database.commit()
    database.refresh(new_message)
    return

@app.get("/users/{user_id}")
def get_messages(user_id: int, database: Session = Depends(get_db)):
    new_message = database.query(Message).filter(Message.receiver_id == user_id).all()
    return new_message

@app.websocket("/ws")
async def connect_user(socket: WebSocket, session_id: str = Cookie(None), database: Session = Depends(get_db)):

    current_user = validate_session(session_id, database)
    if not current_user:
        await socket.close(code=1008)
        return

    await socket.accept()
    active_connections[current_user.id] = socket

    try:
        while True:
            data = await socket.receive_json()

            if data["type"] == "message":
                new_message = Message_schema(
                sender_id = current_user.id,
                receiver_id = data["receiver_id"],
                content= data["content"])
                send_message(message = new_message, database = database)
                if data["receiver_id"] in active_connections:
                    format_message = f"[from: {current_user.id}] said: {data['content']}"
                    await active_connections[data["receiver_id"]].send_json(format_message)
            
    except WebSocketDisconnect:
        del active_connections[current_user.id]