# Database table definitions (User, Message, etc.) go here.
from app.database import Base
from sqlalchemy import Column, String, Integer, ForeignKey, func, DateTime

class UserInfo(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key = True)
    username = Column(String, unique= True, nullable= False)
    hashed_password = Column(String, nullable= False)

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key = True)
    sender_id = Column(Integer, ForeignKey("users.id"))
    receiver_id = Column(Integer, ForeignKey("users.id"))
    content = Column(String)
    timestamp = Column(DateTime, server_default=func.now())


class Active_Sessions(Base):
    __tablename__ = "sessions"

    session_id = Column(String, primary_key = True)
    account_id = Column(Integer, ForeignKey("users.id"))
    last_active = Column(DateTime, server_default= func.now())
    created_at = Column(DateTime, server_default= func.now())