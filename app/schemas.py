# Pydantic schemas (API request/response shapes) go here.
from pydantic import BaseModel

class Account_login(BaseModel):
    username: str
    password: str

class Account_register(BaseModel):
    username:str
    password:str

class Account_field_edit(BaseModel):
    value: str = ""
    password: str = ""

class Account_password_change(BaseModel):
    current_password: str
    new_password: str

class Account_mfa_confirm(BaseModel):
    code: str

class Account_mfa_disable(BaseModel):
    password: str
    code: str

class Account_login_mfa(BaseModel):
    username: str
    code: str

class Account_revoke_session(BaseModel):
    session_id: str

class Account_privacy_edit(BaseModel):
    value: str

class Messaging_friend_prefs(BaseModel):
    everyone: bool
    friends_of_friends: bool
    server_members: bool

class Messaging_dms_pref(BaseModel):
    server_id: str | None = None
    allow: bool

class Notification_sound_prefs(BaseModel):
    message: bool
    current_channel: bool
    incoming_ring: bool
    mute_all: bool

class Notification_reaction_pref(BaseModel):
    value: str

class Appearance_prefs(BaseModel):
    theme: str
    brightness: str
    color_bg: str = ""
    color_surface: str = ""
    color_accent: str = ""
    color_highlight: str = ""
    show_link_media: bool = True
    show_uploads: bool = True
    show_embeds: bool = True
    show_reactions: bool = True
    show_send: bool = False
    show_bubbles: bool = True
    self_side: str = "right"
    search_style: str = "auto"

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
    reply_to_id: int | None = None

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
    reply_to_id: int | None = None

class Server_create(BaseModel):
    name: str

class Server_message(BaseModel):
    sender_id: int
    channel_id: int
    content: str = ""
    attachment: Attachment_in | None = None
    reply_to_id: int | None = None

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

class Announcements(BaseModel):
    channel_id: int
    title: str
    body: str = ""
    attachments: list[Attachment_in] = []
    attachment: Attachment_in | None = None

class Comment_create(BaseModel):
    post_id: int
    content: str

class Forum_post_create(BaseModel):
    channel_id: int
    title: str
    body: str = ""
    attachments: list[Attachment_in] = []
    attachment: Attachment_in | None = None

class Forum_message_create(BaseModel):
    post_id: int
    content: str = ""
    attachment: Attachment_in | None = None
    reply_to_id: int | None = None

class Doc_save(BaseModel):
    channel_id: int
    content: str

class Delete_message(BaseModel):
    kind: str
    message_id: int

class Edit_message(BaseModel):
    kind: str
    message_id: int
    content: str = ""
    attachment: Attachment_in | None = None

class React_message(BaseModel):
    kind: str
    message_id: int
    emoji: str

class Edit_announcement(BaseModel):
    post_id: int
    title: str
    body: str = ""
    attachments: list[Attachment_in] = []

class Edit_forum(BaseModel):
    post_id: int
    title: str
    body: str = ""
    attachments: list[Attachment_in] = []