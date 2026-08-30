# Database table definitions (User, Message, etc.) go here.
from app.database import Base
from sqlalchemy import Column, String, Integer,Boolean, ForeignKey, func, DateTime

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
    read = Column(Boolean, default= False)


class Active_Sessions(Base):
    __tablename__ = "sessions"

    session_id = Column(String, primary_key = True)
    account_id = Column(Integer, ForeignKey("users.id"))
    last_active = Column(DateTime, server_default= func.now())
    created_at = Column(DateTime, server_default= func.now())

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
    party_id = Column(Integer)
    party_name = Column(String)
    user_id = Column(Integer, ForeignKey("users.id"))
    created_by_id = Column(Integer, ForeignKey("users.id"))
    joined_at = Column(DateTime, server_default=func.now())
    last_activity = Column(DateTime, server_default=func.now())

class Party_messages(Base):
    __tablename__ = "party_messages"
    id = Column(Integer, primary_key=True)
    party_id = Column(Integer, ForeignKey("parties.id"))
    sender_id = Column(Integer, ForeignKey("users.id"))
    content = Column(String)
    timestamp = Column(DateTime, server_default=func.now())