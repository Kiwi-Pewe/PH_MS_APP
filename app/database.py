# SQLAlchemy engine/session setup goes here.
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

engine = create_engine("sqlite:///./app.db")
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
Base = declarative_base()

def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


# create_all never alters existing tables. Add attachment if the live
# .db predates this column. Chat tables plus announcement/forum posts.
def ensure_attachment_columns():
    tables = (
        "messages",
        "party_messages",
        "channel_messages",
        "forum_messages",
        "announcements",
        "forum_posts",
    )
    with engine.connect() as conn:
        for table in tables:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN attachment VARCHAR"))
                conn.commit()
            except Exception:
                conn.rollback()


def ensure_edited_columns():
    tables = ("messages", "party_messages", "channel_messages", "announcements", "forum_posts", "forum_messages")
    with engine.connect() as conn:
        for table in tables:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN edited BOOLEAN DEFAULT 0"))
                conn.commit()
            except Exception:
                conn.rollback()


def ensure_reply_columns():
    tables = ("messages", "party_messages", "channel_messages", "forum_messages")
    with engine.connect() as conn:
        for table in tables:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN reply_to_id INTEGER"))
                conn.commit()
            except Exception:
                conn.rollback()


# Same reason as attachment: create_all will not add these to a live
# .db that already has the chat tables. Pending-delete only lives on
# DMs and parties — server messages are wiped immediately.
def ensure_deletion_columns():
    adds = (
        ("messages", "deletion_state", "VARCHAR"),
        ("messages", "deletion_requested_at", "DATETIME"),
        ("party_messages", "deletion_state", "VARCHAR"),
        ("party_messages", "deletion_requested_at", "DATETIME"),
    )
    with engine.connect() as conn:
        for table, column, coltype in adds:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}"))
                conn.commit()
            except Exception:
                conn.rollback()


def ensure_account_columns():
    adds = (
        ("users", "display_name", "VARCHAR"),
        ("users", "email", "VARCHAR"),
        ("users", "phone", "VARCHAR"),
        ("users", "mfa_enabled", "BOOLEAN"),
        ("users", "mfa_secret", "VARCHAR"),
        ("users", "mfa_challenge", "VARCHAR"),
        ("users", "mfa_challenge_until", "DATETIME"),
        ("sessions", "user_agent", "VARCHAR"),
        ("sessions", "ip_address", "VARCHAR"),
        ("sessions", "location", "VARCHAR"),
        ("sessions", "device_label", "VARCHAR"),
        ("sessions", "client_label", "VARCHAR"),
        ("users", "profile_visibility", "VARCHAR"),
        ("users", "friend_req_everyone", "BOOLEAN"),
        ("users", "friend_req_friends_of_friends", "BOOLEAN"),
        ("users", "friend_req_server_members", "BOOLEAN"),
        ("users", "allow_server_dms", "BOOLEAN"),
        ("users", "notify_sound_message", "BOOLEAN"),
        ("users", "notify_sound_current", "BOOLEAN"),
        ("users", "notify_sound_ring", "BOOLEAN"),
        ("users", "notify_sound_mute_all", "BOOLEAN"),
        ("users", "notify_reactions", "VARCHAR"),
        ("users", "appearance_theme", "VARCHAR"),
        ("users", "appearance_brightness", "VARCHAR"),
        ("users", "appearance_color_bg", "VARCHAR"),
        ("users", "appearance_color_surface", "VARCHAR"),
        ("users", "appearance_color_accent", "VARCHAR"),
        ("users", "appearance_color_highlight", "VARCHAR"),
        ("users", "appearance_show_link_media", "BOOLEAN"),
        ("users", "appearance_show_uploads", "BOOLEAN"),
        ("users", "appearance_show_embeds", "BOOLEAN"),
        ("users", "appearance_show_reactions", "BOOLEAN"),
        ("users", "appearance_show_send", "BOOLEAN"),
        ("users", "appearance_show_bubbles", "BOOLEAN"),
        ("users", "appearance_self_side", "VARCHAR"),
        ("users", "appearance_search", "VARCHAR"),
        ("users", "accessibility_prefs", "VARCHAR"),
        ("users", "language_time_prefs", "VARCHAR"),
        ("users", "profile_layout", "VARCHAR"),
        ("users", "profile_status", "VARCHAR"),
        ("users", "profile_pronouns", "VARCHAR"),
        ("users", "display_name_history", "VARCHAR"),
        ("users", "created_at", "DATETIME"),
    )
    with engine.connect() as conn:
        for table, column, coltype in adds:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}"))
                conn.commit()
            except Exception:
                conn.rollback()
        try:
            conn.execute(text("UPDATE users SET display_name = username WHERE display_name IS NULL OR display_name = ''"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("UPDATE users SET mfa_enabled = 0 WHERE mfa_enabled IS NULL"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("UPDATE users SET profile_visibility = 'friends_all' WHERE profile_visibility IS NULL OR profile_visibility = ''"))
            conn.commit()
        except Exception:
            conn.rollback()
        for column in ("friend_req_everyone", "friend_req_friends_of_friends", "friend_req_server_members", "allow_server_dms"):
            try:
                conn.execute(text(f"UPDATE users SET {column} = 1 WHERE {column} IS NULL"))
                conn.commit()
            except Exception:
                conn.rollback()
        try:
            conn.execute(text("UPDATE users SET notify_sound_message = 1 WHERE notify_sound_message IS NULL"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("UPDATE users SET notify_sound_current = 0 WHERE notify_sound_current IS NULL"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("UPDATE users SET notify_sound_ring = 1 WHERE notify_sound_ring IS NULL"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("UPDATE users SET notify_sound_mute_all = 0 WHERE notify_sound_mute_all IS NULL"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("UPDATE users SET notify_reactions = 'all' WHERE notify_reactions IS NULL OR notify_reactions = ''"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("UPDATE users SET appearance_theme = 'midnight-purple' WHERE appearance_theme IS NULL OR appearance_theme = ''"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("UPDATE users SET appearance_brightness = 'dark' WHERE appearance_brightness IS NULL OR appearance_brightness = ''"))
            conn.commit()
        except Exception:
            conn.rollback()
        for column in ("appearance_show_link_media", "appearance_show_uploads", "appearance_show_embeds", "appearance_show_reactions"):
            try:
                conn.execute(text(f"UPDATE users SET {column} = 1 WHERE {column} IS NULL"))
                conn.commit()
            except Exception:
                conn.rollback()
        try:
            conn.execute(text("UPDATE users SET appearance_show_send = 0 WHERE appearance_show_send IS NULL"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("UPDATE users SET appearance_show_bubbles = 1 WHERE appearance_show_bubbles IS NULL"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("UPDATE users SET appearance_self_side = 'right' WHERE appearance_self_side IS NULL OR appearance_self_side = ''"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("UPDATE users SET appearance_search = 'auto' WHERE appearance_search IS NULL OR appearance_search = ''"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("UPDATE users SET accessibility_prefs = '{}' WHERE accessibility_prefs IS NULL OR accessibility_prefs = ''"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("UPDATE users SET language_time_prefs = '{}' WHERE language_time_prefs IS NULL OR language_time_prefs = ''"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("UPDATE users SET profile_layout = '{}' WHERE profile_layout IS NULL OR profile_layout = ''"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text(
                "UPDATE users SET created_at = ("
                "SELECT MIN(sessions.created_at) FROM sessions WHERE sessions.account_id = users.id"
                ") WHERE created_at IS NULL"
            ))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))
            conn.commit()
        except Exception:
            conn.rollback()


def ensure_server_columns():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE servers ADD COLUMN icon_key VARCHAR"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("ALTER TABLE servers ADD COLUMN banner_key VARCHAR"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("ALTER TABLE servers ADD COLUMN banner_color VARCHAR"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("ALTER TABLE servers ADD COLUMN about VARCHAR"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("ALTER TABLE servers ADD COLUMN url_slug VARCHAR"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("ALTER TABLE servers ADD COLUMN server_type VARCHAR"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("ALTER TABLE servers ADD COLUMN timezone VARCHAR"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("ALTER TABLE servers ADD COLUMN default_notifications VARCHAR"))
            conn.commit()
        except Exception:
            conn.rollback()


def ensure_role_columns():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE server_roles ADD COLUMN self_assignable BOOLEAN DEFAULT 0"))
            conn.commit()
        except Exception:
            conn.rollback()


def ensure_doc_columns():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE doc_pages ADD COLUMN author_id INTEGER"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("UPDATE doc_pages SET author_id = updated_by WHERE author_id IS NULL AND updated_by IS NOT NULL"))
            conn.commit()
        except Exception:
            conn.rollback()


def ensure_forum_columns():
    adds = (
        ("forum_posts", "sticky", "BOOLEAN DEFAULT 0"),
        ("forum_posts", "locked", "BOOLEAN DEFAULT 0"),
    )
    with engine.connect() as conn:
        for table, column, coltype in adds:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}"))
                conn.commit()
            except Exception:
                conn.rollback()


def ensure_moderation_columns():
    adds = (
        ("server_members", "timeout_until", "DATETIME"),
        ("server_members", "timeout_reason", "VARCHAR"),
    )
    with engine.connect() as conn:
        for table, column, coltype in adds:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}"))
                conn.commit()
            except Exception:
                conn.rollback()