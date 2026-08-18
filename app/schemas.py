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