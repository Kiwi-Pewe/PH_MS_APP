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