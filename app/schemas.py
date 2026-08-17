# Pydantic schemas (API request/response shapes) go here.
from pydantic import BaseModel

class Account(BaseModel):
    username: str


class Message_schema(BaseModel):
    sender_id: int
    receiver_id: int
    content: str
