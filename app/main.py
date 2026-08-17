# FastAPI app entry point — your endpoints will live here.
from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from app.models import UserInfo, Message
from app.schemas import Account, Message_schema
from app.database import get_db, Base, engine 

app = FastAPI()
Base.metadata.create_all(engine)
active_connections = {}

@app.get("/home")
def home_page():
    return "Home Page"

@app.post("/account")
def create_account(account: Account, database : Session = Depends(get_db)):

    existing_user = database.query(UserInfo).filter(UserInfo.username == account.username).first()

    if existing_user:
        return existing_user
    else:
        info = UserInfo(username = account.username)    
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

@app.websocket("/ws/{user_id}")
async def connect_user(user_id: int, socket: WebSocket, database: Session = Depends(get_db)):

    await socket.accept()

    try:
        while True:
            data = await socket.receive_json()

            if data["type"] == "message":
                new_message = Message_schema(
                sender_id = user_id,
                receiver_id = data["receiver_id"],
                content= data["content"])
                send_message(message = new_message, database = database)
                if data["receiver_id"] in active_connections:
                    format_message = f"[from: {user_id}] said: {data['content']}"
                    await active_connections[data["receiver_id"]].send_json(format_message)
            
    except WebSocketDisconnect:
        del active_connections[user_id]