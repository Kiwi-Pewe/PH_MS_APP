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

class Account_delete_own(BaseModel):
    confirm_username: str = ""
    password: str = ""

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

class Feed_alert_prefs_in(BaseModel):
    prefs: dict[str, bool] = {}

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

class Channel_role_perms_save(BaseModel):
    channel_id: int
    role_id: int
    permissions: dict[str, bool] = {}

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
    channel_id: int | None = None
    max_age: int | None = None
    max_uses: int | None = None
    role_ids: list[int] = []
    temporary: bool = False
    replace: bool = False

class Invite_staff(BaseModel):
    server_id: str
    code: str

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

class Reorder_server_rail(BaseModel):
    server_id: str
    before_server_id: str | None = None

class Reorder_category(BaseModel):
    category_id: int
    before_category_id: int | None = None

class Reorder_channel(BaseModel):
    channel_id: int
    category_id: int
    before_channel_id: int | None = None

class Channel_update(BaseModel):
    channel_id: int
    name: str | None = None
    is_private: bool | None = None
    topic: str | None = None
    slowmode: int | None = None
    user_limit: int | None = None

class Category_update(BaseModel):
    category_id: int
    name: str | None = None
    is_private: bool | None = None

class Announcement_channel_settings(BaseModel):
    channel_id: int
    announce_public: bool = False
    blog_enabled: bool = False

class Channel_follow_body(BaseModel):
    dest_channel_id: int
    source_channel_id: int

class Voice_join(BaseModel):
    channel_id: int

class Voice_moderate(BaseModel):
    server_id: str
    user_id: int
    muted: bool | None = None
    deafened: bool | None = None

class Voice_call(BaseModel):
    kind: str
    chat_id: int

class Announcements(BaseModel):
    channel_id: int
    title: str
    body: str = ""
    attachments: list[Attachment_in] = []
    attachment: Attachment_in | None = None
    notify_all: bool = False
    comments_open: bool = True

class Comment_create(BaseModel):
    post_id: int
    content: str

class Comment_edit(BaseModel):
    comment_id: int
    content: str

class Announcement_highlight(BaseModel):
    post_id: int
    on: bool = True

class Forum_post_create(BaseModel):
    channel_id: int
    title: str
    body: str = ""
    tag_ids: list[int] = []
    attachments: list[Attachment_in] = []
    attachment: Attachment_in | None = None

class Forum_toggle(BaseModel):
    on: bool

class Forum_message_create(BaseModel):
    post_id: int
    content: str = ""
    attachment: Attachment_in | None = None
    reply_to_id: int | None = None

class Forum_settings_save(BaseModel):
    channel_id: int
    guidelines: str | None = None
    require_tags: bool | None = None
    default_reaction: str | None = None

class Forum_tag_create(BaseModel):
    channel_id: int
    name: str
    emoji: str | None = None

class Forum_tag_update(BaseModel):
    tag_id: int
    name: str | None = None
    emoji: str | None = None

class Forum_tag_delete(BaseModel):
    tag_id: int

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

class Pin_message(BaseModel):
    kind: str
    message_id: int

class Search_messages(BaseModel):
    scope_kind: str
    scope_id: str | int
    content: str = ""
    page: int = 1
    author_id: int | None = None
    channel_id: int | None = None
    mentions_user_id: int | None = None
    has: list[str] = []
    pinned: bool | None = None
    before: str | None = None
    after: str | None = None
    during: str | None = None

class List_item_create(BaseModel):
    channel_id: int
    title: str
    note: str = ""

class List_item_check(BaseModel):
    item_id: int
    on: bool = True

class List_item_delete(BaseModel):
    item_id: int

class List_item_edit(BaseModel):
    item_id: int
    title: str

class List_item_note(BaseModel):
    item_id: int
    note: str = ""

class List_item_move(BaseModel):
    item_id: int
    channel_id: int

class List_items_reorder(BaseModel):
    channel_id: int
    item_ids: list[int] = []

class Doc_entry_create(BaseModel):
    channel_id: int
    title: str = ""
    body: str = ""

class Doc_entry_edit(BaseModel):
    doc_id: int
    title: str = ""
    body: str = ""

class Doc_entry_delete(BaseModel):
    doc_id: int

class Media_item_create(BaseModel):
    channel_id: int
    title: str = ""
    description: str = ""
    kind: str = "image"
    url: str = ""
    width: int = 0
    height: int = 0

class Media_item_edit(BaseModel):
    item_id: int
    title: str = ""
    description: str = ""

class Media_item_delete(BaseModel):
    item_id: int

class Media_comment_create(BaseModel):
    item_id: int
    content: str

class Schedule_block_create(BaseModel):
    channel_id: int
    starts_at: str
    ends_at: str
    x_ratio: float = 0.5

class Schedule_block_delete(BaseModel):
    block_id: int

class Schedule_block_update(BaseModel):
    block_id: int
    ends_at: str

class Calendar_event_create(BaseModel):
    channel_id: int
    name: str
    starts_at: str
    color: int = 14910017
    description: str = ""
    repeat_kind: str = "once"
    is_private: bool = False
    rsvp_enabled: bool = True
    rsvp_limit: int | None = None
    role_ids: list[int] = []
    invite_ids: list[int] = []
    ends_at: str = ""
    from_schedule: bool = False

class Calendar_event_edit(BaseModel):
    event_id: int
    name: str
    starts_at: str
    color: int = 14910017
    description: str = ""
    repeat_kind: str = "once"
    is_private: bool = False
    rsvp_enabled: bool = True
    rsvp_limit: int | None = None
    role_ids: list[int] = []
    invite_ids: list[int] = []
    ends_at: str = ""

class Calendar_event_delete(BaseModel):
    event_id: int

class Calendar_event_rsvp_set(BaseModel):
    event_id: int
    occurrence_at: str
    status: str
    user_id: int = 0

class Calendar_event_cancel(BaseModel):
    event_id: int

class Calendar_event_comment_create(BaseModel):
    event_id: int
    content: str

class Calendar_event_member(BaseModel):
    event_id: int
    user_id: int

class List_thread_create(BaseModel):
    item_id: int
    content: str

class Edit_announcement(BaseModel):
    post_id: int
    title: str
    body: str = ""
    attachments: list[Attachment_in] = []
    comments_open: bool = True

class Edit_forum(BaseModel):
    post_id: int
    title: str
    body: str = ""
    attachments: list[Attachment_in] = []