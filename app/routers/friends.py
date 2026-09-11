from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.models import UserInfo, Block_user, Friend_request
from app.schemas import Block_schema, Friend_user
from app.database import get_db
from app.auth import get_current_user
from app.routers.realtime import active_connections

router = APIRouter()

@router.post("/block")
def block_account(block_user: Block_schema, database: Session= Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    are_friends_1 = database.query(Friend_request).filter(Friend_request.user_1 == current_user.id, Friend_request.user_2 == block_user.blocked_user).first()
    are_friends_2 = database.query(Friend_request).filter(Friend_request.user_1 == block_user.blocked_user, Friend_request.user_2 == current_user.id).first()

    if are_friends_1:
        info = Friend_user(user_id_1 = are_friends_1.user_1, user_id_2= are_friends_1.user_2)
        remove_user(info, database= database, current_user= current_user)
    elif are_friends_2:
        info = Friend_user(user_id_1 = are_friends_2.user_1, user_id_2= are_friends_2.user_2)
        remove_user(info, database= database, current_user= current_user)

    block = Block_user(initiated_by= current_user.id ,blocked_user = block_user.blocked_user)
    database.add(block)
    database.commit()
    database.refresh(block)
    return

@router.post("/unblock")
def unblock_account(block_user: Block_schema, database: Session= Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    is_blocked = database.query(Block_user).filter(Block_user.initiated_by == current_user.id, Block_user.blocked_user == block_user.blocked_user).first()
    if not is_blocked:
        raise HTTPException(status_code= 404, detail= "blocked user not found.")

    if is_blocked.initiated_by != current_user.id:
        raise HTTPException(status_code= 409, detail="Current user did not create Block.") 
    database.delete(is_blocked)
    database.commit()
    return

@router.post("/friend_user")
async def add_user(friends: Friend_user, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    friend_exists = database.query(UserInfo).filter(UserInfo.username == friends.username).first()
    if not friend_exists:
        raise HTTPException(status_code= 404, detail= "Friend not found")
    if current_user.id == friend_exists.id:
        raise HTTPException(status_code=409, detail="Cannot friend yourself")

    blocked_1 = database.query(Block_user).filter(Block_user.initiated_by == friend_exists.id, Block_user.blocked_user == current_user.id).first()
    blocked_2 = database.query(Block_user).filter(Block_user.initiated_by == current_user.id, Block_user.blocked_user == friend_exists.id).first()
    is_blocked = blocked_1 or blocked_2
    if is_blocked:
        raise HTTPException(status_code=400, detail="User is blocked from sending request")

    reversed_pending = database.query(Friend_request).filter(Friend_request.user_1 == friend_exists.id, Friend_request.user_2 == current_user.id).first()
    if reversed_pending and reversed_pending.pending == True:
        reversed_pending.pending = False
        database.commit()
        return
    
    pending_request = database.query(Friend_request).filter(Friend_request.user_1 == current_user.id, Friend_request.user_2 == friend_exists.id).first()
    if pending_request and pending_request.pending == True:
        raise HTTPException(status_code=409, detail="account has pending request.")
    elif (pending_request and pending_request.pending == False) or (reversed_pending and reversed_pending.pending == False):
        raise HTTPException(status_code=400, detail="accounts are already friends.")

    add_friend = Friend_request(user_1 = current_user.id, user_2 = friend_exists.id, pending = True)
    database.add(add_friend)
    database.commit()
    database.refresh(add_friend)

    if friend_exists.id in active_connections:
        await active_connections[friend_exists.id].send_json({"type": "friend_request", "sender_id": current_user.id, "username": current_user.username})
    return

@router.get("/get_friends")
def get_friends(database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    pending_requests = database.query(Friend_request).filter(Friend_request.user_2 == current_user.id, Friend_request.pending == True).all()
    accepted_friends = database.query(Friend_request).filter(or_(Friend_request.user_1 == current_user.id, Friend_request.user_2 == current_user.id), Friend_request.pending == False).all()
    all_requests = []
    online_friends = []
    offline_friends = []

    for entry in pending_requests:
        other_id = entry.user_2 if entry.user_1 == current_user.id else entry.user_1
        actual_account = database.query(UserInfo).filter(UserInfo.id == other_id).first()
        all_requests.append({"id": other_id, "username": actual_account.username})

    for friends in accepted_friends:
        other_id = friends.user_2 if friends.user_1 == current_user.id else friends.user_1
        actual_account = database.query(UserInfo).filter(UserInfo.id == other_id).first()

        if actual_account.id in active_connections:
            online_friends.append({"id": other_id, "username": actual_account.username})
        else:
            offline_friends.append({"id": other_id, "username": actual_account.username})

    return {"pending_requests": all_requests, "online_friends": online_friends, "offline_friends": offline_friends}

@router.post("/unfriend_user")
def remove_user(friends: Friend_user, database: Session = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):

    friend_file_1 = database.query(Friend_request).filter(Friend_request.user_1 == current_user.id, Friend_request.user_2 == friends.user_id_2).first()
    friend_file_2 = database.query(Friend_request).filter(Friend_request.user_1 == friends.user_id_2, Friend_request.user_2 == current_user.id).first()

    if friend_file_1:
        database.delete(friend_file_1)
        database.commit()
    elif friend_file_2:
        database.delete(friend_file_2)
        database.commit()
    else:
        raise HTTPException(status_code= 404, detail="Friend not found.")
    return
