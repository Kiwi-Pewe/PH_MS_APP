# Pydantic schemas (API request/response shapes) go here.
from pydantic import BaseModel

class Account_login(BaseModel):
    username: str
    password: str

class Account_register(BaseModel):
    username:str
    password:str

class Message_schema(BaseModel):
    sender_id: int
    receiver_id: int
    content: str

class Session_logger(BaseModel):
    session_id: str
    account_id: int

class Friend_user(BaseModel):
    user_id_2: int | None = None
    username: str | None = None

class Block_schema(BaseModel):
    blocked_user: int
    
class Conversations(BaseModel):

    user_1:int
    user_2: int
