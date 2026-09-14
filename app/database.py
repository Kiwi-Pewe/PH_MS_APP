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
    tables = ("messages", "party_messages", "channel_messages", "announcements", "forum_posts")
    with engine.connect() as conn:
        for table in tables:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN edited BOOLEAN DEFAULT 0"))
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