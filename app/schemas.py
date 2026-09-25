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

class Accessibility_prefs(BaseModel):
    text_size: int = 15
    underline_links: bool = False
    display_name_styles: bool = False
    ui_density: str = "default"
    chat_display: str = "default"
    group_spacing: int = 20
    zoom: int = 100
    saturation: int = 100
    saturation_custom: bool = False
    high_contrast: bool = False
    sync_contrast: bool = True
    role_colors: str = "names"
    official_messages: str = "default"
    toggle_indicators: bool = False
    reduced_motion: bool = False
    sync_motion: bool = True
    gifs_when_focused: bool = True
    animated_emoji: bool = True
    sticker_anim: str = "always"
    tts_rate: float = 1
    image_descriptions: bool = False
    legacy_input: bool = False

class Language_time_prefs(BaseModel):
    language: str = "en-US"
    time_format: str = "auto"

class Profile_tile_in(BaseModel):
    id: str = ""
    type: str = ""
    x: int = 0
    y: int = 0
    w: int = 1
    h: int = 1
    allow_overlap: bool = False
    z_index: int = 0
    props: dict = {}

class Profile_page_in(BaseModel):
    id: str = ""
    title: str = ""
    visibility: str = "public"
    tiles: list[Profile_tile_in] = []

class Profile_layout_in(BaseModel):
    grid_cols: int = 32
    pages: list[Profile_page_in] = []
    mini_profile: dict | None = None
    identity: dict | None = None
    image_recents: dict | None = None

class Profile_comment_in(BaseModel):
    content: str = ""


class Profile_comment_watch_in(BaseModel):
    watching: bool = False


class Profile_identity_in(BaseModel):
    status: str = ""
    pronouns: str = ""

class Attachment_in(BaseModel):
    key: str
    mime: str
    size: int
    name: str = ""

class Feedback_status(BaseModel):
    status: str


class Admin_warn(BaseModel):
    reason: str = ""


class Admin_ban(BaseModel):
    seconds: int
    reason: str = ""


class Admin_delete(BaseModel):
    username: str = ""


class Feedback_submit(BaseModel):
    feedback_type: str
    report: str
    attachments: list[Attachment_in] = []
    context_view: str = ""
    server_id: str = ""
    server_name: str = ""
    channel_id: int | None = None
    channel_name: str = ""
    channel_type: str = ""

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

class Server_icon_update(BaseModel):
    server_id: str
    key: str | None = None
    mime: str = ""
    size: int = 0
    name: str = ""

class Server_banner_update(BaseModel):
    server_id: str
    key: str | None = None
    mime: str = ""
    size: int = 0
    name: str = ""
    color: str | None = None

class Server_name_update(BaseModel):
    server_id: str
    name: str

class Server_about_update(BaseModel):
    server_id: str
    about: str = ""

class Server_url_update(BaseModel):
    server_id: str
    slug: str = ""

class Server_type_update(BaseModel):
    server_id: str
    server_type: str = ""

class Server_timezone_update(BaseModel):
    server_id: str
    timezone: str = ""

class Server_notifications_update(BaseModel):
    server_id: str
    default_notifications: str = ""

class Server_privacy_update(BaseModel):
    server_id: str
    privacy_mode: str = "private"
    discoverable: bool = False

class Server_notify_prefs_update(BaseModel):
    server_id: str
    muted: bool | None = None
    notify_level: str | None = None
    suppress_everyone: bool | None = None

class Server_delete(BaseModel):
    server_id: str
    confirm_name: str = ""

class Server_emoji_create(BaseModel):
    server_id: str
    name: str = ""
    image_key: str
    filename: str = ""

class Server_emoji_rename(BaseModel):
    server_id: str
    emoji_id: int
    name: str

class Server_emoji_delete(BaseModel):
    server_id: str
    emoji_id: int

class Server_role_in(BaseModel):
    id: int | None = None
    client_id: str = ""
    name: str = ""
    color: str = ""
    position: int = 0
    mentionable: bool = False
    hoist: bool = False
    name_color: bool = False
    self_assignable: bool = False
    permissions: dict[str, bool] = {}

class Server_roles_save(BaseModel):
    server_id: str
    roles: list[Server_role_in] = []

class Mini_profile_note_in(BaseModel):
    user_id: int
    text: str = ""

class Server_role_member_in(BaseModel):
    server_id: str
    user_id: int
    role_id: int
    assigned: bool = True

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

class Server_moderation_in(BaseModel):
    server_id: str
    user_id: int
    reason: str = ""
    seconds: int = 0

class Server_bulk_kick_in(BaseModel):
    server_id: str
    user_ids: list[int]
    reason: str = ""
    seconds: int = 0

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

class Forum_toggle(BaseModel):
    on: bool

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