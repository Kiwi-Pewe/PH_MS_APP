# Pydantic schemas (API request/response shapes) go here.
from pydantic import BaseModel

class Account_login(BaseModel):
    username: str
    password: str

class Account_register(BaseModel):
    username:str
    password:str

class Attachment_in(BaseModel):
    key: str
    mime: str
    size: int
    name: str = ""

class Message_schema(BaseModel):
    sender_id: int
    receiver_id: int
    content: str = ""
    attachment: Attachment_in | None = None

class Session_logger(BaseModel):
    session_id: str
    account_id: int

class Friend_user(BaseModel):
    user_id_1: int | None= None
    user_id_2: int | None = None
    username: str | None = None

class Block_schema(BaseModel):
    blocked_user: int
    
class Conversations(BaseModel):
    user_1:int
    user_2: int

class Party_create(BaseModel):
    party_name: str
    member_ids: list[int]

class Party_message_schema(BaseModel):
    sender_id: int
    party_id: int
    content: str = ""
    attachment: Attachment_in | None = None

class Server_create(BaseModel):
    name: str

class Server_message(BaseModel):
    sender_id: int
    channel_id: int
    content: str = ""
    attachment: Attachment_in | None = None

class Invite(BaseModel):
    type: str
    server_id: str | None = None
    party_id: int | None = None

class Category_create(BaseModel):
    server_id: str
    name: str
    is_private: bool = False

class Channel_create(BaseModel):
    category_id: int
    name: str
    channel_type: str
    is_private: bool = False

class Upload_request(BaseModel):
    mime: str
    size: int
    name: str = ""

class Announcements(BaseModel):
    channel_id: int
    title: str
    body: str = ""
    attachment: Attachment_in | None = None

class Comment_create(BaseModel):
    post_id: int
    content: str

class Forum_post_create(BaseModel):
    channel_id: int
    title: str
    body: str = ""
    attachment: Attachment_in | None = None

class Forum_message_create(BaseModel):
    post_id: int
    content: str = ""
    attachment: Attachment_in | None = None

class Doc_save(BaseModel):
    channel_id: int
    content: str