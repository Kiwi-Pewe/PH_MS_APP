# Database table definitions (User, Message, etc.) go here.
from app.database import Base
from sqlalchemy import Column, String, Integer,Boolean, ForeignKey, func, DateTime, Index, UniqueConstraint

class UserInfo(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key = True)
    username = Column(String, unique= True, nullable= False)
    hashed_password = Column(String, nullable= False)
    display_name = Column(String, nullable= True)
    email = Column(String, nullable= True)
    phone = Column(String, nullable= True)
    mfa_enabled = Column(Boolean, default= False)
    mfa_secret = Column(String, nullable= True)
    mfa_challenge = Column(String, nullable= True)
    mfa_challenge_until = Column(DateTime, nullable= True)
    profile_visibility = Column(String, nullable= True)
    friend_req_everyone = Column(Boolean, default= True)
    friend_req_friends_of_friends = Column(Boolean, default= True)
    friend_req_server_members = Column(Boolean, default= True)
    allow_server_dms = Column(Boolean, default= True)
    notify_sound_message = Column(Boolean, default= True)
    notify_sound_current = Column(Boolean, default= False)
    notify_sound_ring = Column(Boolean, default= True)
    notify_sound_mute_all = Column(Boolean, default= False)
    notify_reactions = Column(String, nullable= True)
    appearance_theme = Column(String, nullable= True)
    appearance_brightness = Column(String, nullable= True)
    appearance_color_bg = Column(String, nullable= True)
    appearance_color_surface = Column(String, nullable= True)
    appearance_color_accent = Column(String, nullable= True)
    appearance_color_highlight = Column(String, nullable= True)
    appearance_show_link_media = Column(Boolean, default= True)
    appearance_show_uploads = Column(Boolean, default= True)
    appearance_show_embeds = Column(Boolean, default= True)
    appearance_show_reactions = Column(Boolean, default= True)
    appearance_show_send = Column(Boolean, default= False)
    appearance_show_bubbles = Column(Boolean, default= True)
    appearance_self_side = Column(String, nullable= True)
    appearance_search = Column(String, nullable= True)
    accessibility_prefs = Column(String, nullable= True)
    language_time_prefs = Column(String, nullable= True)
    profile_layout = Column(String, nullable= True)
    profile_status = Column(String, nullable= True)
    profile_pronouns = Column(String, nullable= True)
    display_name_history = Column(String, nullable= True)
    created_at = Column(DateTime, server_default= func.now())

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key = True)
    sender_id = Column(Integer, ForeignKey("users.id"))
    receiver_id = Column(Integer, ForeignKey("users.id"))
    content = Column(String)
    attachment = Column(String, nullable=True)
    timestamp = Column(DateTime, server_default=func.now())
    read = Column(Boolean, default= False)
    deletion_state = Column(String, nullable=True)
    deletion_requested_at = Column(DateTime, nullable=True)
    edited = Column(Boolean, default= False)
    reply_to_id = Column(Integer, nullable=True)

class Active_Sessions(Base):
    __tablename__ = "sessions"

    session_id = Column(String, primary_key = True)
    account_id = Column(Integer, ForeignKey("users.id"))
    last_active = Column(DateTime, server_default= func.now())
    created_at = Column(DateTime, server_default= func.now())
    user_agent = Column(String, nullable= True)
    ip_address = Column(String, nullable= True)
    location = Column(String, nullable= True)
    device_label = Column(String, nullable= True)
    client_label = Column(String, nullable= True)

class Friend_request(Base):
    __tablename__ = "friend"

    id = Column(Integer,primary_key= True)
    user_1 = Column(Integer, ForeignKey("users.id"))
    user_2 = Column(Integer, ForeignKey("users.id"))
    date_created = Column(DateTime, server_default= func.now())
    pending = Column(Boolean)

class Block_user(Base):
    __tablename__ = "blocked"
 
    id = Column(Integer,primary_key= True)
    initiated_by = Column(Integer, ForeignKey("users.id"))
    blocked_user = Column(Integer, ForeignKey("users.id"))
    date_created = Column(DateTime, server_default= func.now())

class Conversations(Base):
    __tablename__ = "conversations"
    id = Column(Integer, primary_key=True)
    user_1 = Column(Integer, ForeignKey("users.id"))
    user_2 = Column(Integer, ForeignKey("users.id"))
    last_message_at = Column(DateTime)
    closed_by_user_1 = Column(Boolean, default=False)
    closed_by_user_2 = Column(Boolean, default=False)

class Parties(Base):
    __tablename__ = "parties"
    id = Column(Integer, primary_key=True) 
    party_name = Column(String)
    created_by_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, server_default=func.now())

class Party_members(Base):
    __tablename__ = "party_members"
    id = Column(Integer, primary_key=True)
    party_id = Column(Integer, ForeignKey("parties.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    joined_at = Column(DateTime, server_default=func.now())
    last_activity = Column(DateTime, server_default=func.now())

class Party_messages(Base):
    __tablename__ = "party_messages"
    id = Column(Integer, primary_key=True)
    party_id = Column(Integer, ForeignKey("parties.id"))
    sender_id = Column(Integer, ForeignKey("users.id"))
    content = Column(String)
    attachment = Column(String, nullable=True)
    timestamp = Column(DateTime, server_default=func.now())
    deletion_state = Column(String, nullable=True)
    deletion_requested_at = Column(DateTime, nullable=True)
    edited = Column(Boolean, default= False)
    reply_to_id = Column(Integer, nullable=True)

class Servers(Base):
    __tablename__ = "servers"
    id = Column(String(10), primary_key=True)  # 10-char code, doubles as PK
    name = Column(String)
    owner_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, server_default=func.now())

class Server_members(Base):
    __tablename__ = "server_members"
    id = Column(Integer, primary_key=True)
    server_id = Column(String(10), ForeignKey("servers.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    joined_at = Column(DateTime, server_default=func.now())
    position = Column(Integer)

class Dm_server_pref(Base):
    __tablename__ = "dm_server_prefs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    server_id = Column(String(10), ForeignKey("servers.id"))
    allow_dms = Column(Boolean, default=True)
    __table_args__ = (UniqueConstraint("user_id", "server_id"),) 

class Server_categories(Base):
    __tablename__ = "server_categories"
    id = Column(Integer, primary_key=True)
    server_id = Column(String(10), ForeignKey("servers.id"))
    name = Column(String)
    position = Column(Integer)
    is_private = Column(Boolean, default=False)

class Server_channels(Base):
    __tablename__ = "server_channels"
    id = Column(Integer, primary_key=True)
    category_id = Column(Integer, ForeignKey("server_categories.id"))
    name = Column(String)
    channel_type = Column(String)
    position = Column(Integer)
    is_private = Column(Boolean, default=False)

class Channel_messages(Base):
    __tablename__ = "channel_messages"
    id = Column(Integer, primary_key=True)
    channel_id = Column(Integer,ForeignKey("server_channels.id"))
    sender_id = Column(Integer, ForeignKey("users.id"))
    content = Column(String)
    attachment = Column(String, nullable=True)
    timestamp = Column(DateTime, server_default=func.now())
    edited = Column(Boolean, default= False)
    reply_to_id = Column(Integer, nullable=True)

class Invite_model(Base):
    __tablename__ = "invites"
    id = Column(Integer, primary_key=True)
    code = Column(String(8), unique= True)
    type = Column(String)
    creator_id = Column(Integer, ForeignKey("users.id"))
    server_id = Column(String(10), ForeignKey("servers.id"), nullable= True)
    party_id = Column(Integer, ForeignKey("parties.id"), nullable= True)
    use_count = Column(Integer, default= 0)
    created_at = Column(DateTime, server_default=func.now())

class Announcement_post(Base):
    __tablename__ = "announcements"
    id = Column(Integer, primary_key=True)
    channel_id = Column(Integer, ForeignKey("server_channels.id"))
    title = Column(String)
    body = Column(String)
    sender_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, server_default=func.now())
    comment_count = Column(Integer, default= 0)
    attachment = Column(String, nullable=True)
    edited = Column(Boolean, default= False)

class Announcement_comment(Base):
    __tablename__= "announcement_comments"
    id = Column(Integer, primary_key = True)
    post_id = Column(Integer, ForeignKey("announcements.id"))
    sender_id = Column(Integer, ForeignKey("users.id"))
    content = Column(String)
    created_at = Column(DateTime, server_default=func.now())

class Forum_post(Base):
    __tablename__ = "forum_posts"
    id = Column(Integer, primary_key=True)
    channel_id = Column(Integer, ForeignKey("server_channels.id"))
    author_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String)
    body = Column(String)
    tags = Column(String)
    message_count = Column(Integer, default=0)
    last_activity_at = Column(DateTime, server_default=func.now())
    created_at = Column(DateTime, server_default=func.now())
    attachment = Column(String, nullable=True)
    edited = Column(Boolean, default= False)

class Forum_messages(Base):
    __tablename__ = "forum_messages"
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey("forum_posts.id"))
    author_id = Column(Integer, ForeignKey("users.id"))
    content = Column(String)
    attachment = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    edited = Column(Boolean, default= False)
    reply_to_id = Column(Integer, nullable=True)

class Doc_page(Base):
    __tablename__ = "doc_pages"
    id = Column(Integer, primary_key=True)
    channel_id = Column(Integer, ForeignKey("server_channels.id"), unique=True)
    content = Column(String, default="")
    updated_at = Column(DateTime, server_default=func.now())
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    editor_id = Column(Integer, ForeignKey("users.id"), nullable=True)

class Message_reaction(Base):
    __tablename__ = "message_reactions"
    id = Column(Integer, primary_key = True)
    kind = Column(String)
    message_id = Column(Integer)
    user_id = Column(Integer, ForeignKey("users.id"))
    emoji = Column(String)
    created_at = Column(DateTime, server_default=func.now())
    __table_args__ = (UniqueConstraint("kind", "message_id", "user_id", "emoji", name= "uq_message_reaction"),)

class Audit_log(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key = True)
    server_id = Column(String(10), ForeignKey("servers.id"))
    actor_id = Column(Integer, ForeignKey("users.id"))
    action = Column(String)
    target_type = Column(String)
    target_id = Column(Integer)
    detail = Column(String)
    created_at = Column(DateTime, server_default=func.now())

class Channel_last_viewed(Base):
    __tablename__ = "channel_last_viewed"
    id = Column(Integer, primary_key = True)
    channel_id = Column(Integer, ForeignKey("server_channels.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    last_viewed_at = Column(DateTime, server_default=func.now())
    __table_args__ = (UniqueConstraint("channel_id", "user_id", name= "uq_channel_last_viewed"),)

class Message_mention(Base):
    __tablename__ = "message_mentions"
    id = Column(Integer, primary_key = True)
    kind = Column(String)
    message_id = Column(Integer)
    server_id = Column(String(10), nullable= True)
    channel_id = Column(Integer, nullable= True)
    party_id = Column(Integer, nullable= True)
    user_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, server_default=func.now())

Index(
    "ix_forum_post_activity",
    Forum_post.channel_id,
    Forum_post.last_activity_at,
    Forum_post.id,
)