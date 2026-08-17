# Database table definitions (User, Message, etc.) go here.
from app.database import Base
from sqlalchemy import Column, String, Integer, ForeignKey,func, DateTime

class UserInfo(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key = True)
    username = Column(String, unique= True)

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key = True)
    sender_id = Column(Integer, ForeignKey("users.id"))
    receiver_id = Column(Integer, ForeignKey("users.id"))
    content = Column(String)
    timestamp = Column(DateTime, server_default=func.now())