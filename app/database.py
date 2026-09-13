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


# create_all never alters existing tables. Add attachment on the four
# chat tables if the live .db predates this column.
def ensure_attachment_columns():
    tables = ("messages", "party_messages", "channel_messages", "forum_messages")
    with engine.connect() as conn:
        for table in tables:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN attachment VARCHAR"))
                conn.commit()
            except Exception:
                conn.rollback()