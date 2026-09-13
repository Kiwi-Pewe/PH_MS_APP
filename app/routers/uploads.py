from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.schemas import Upload_request
from app.database import get_db
from app.auth import get_current_user
from app.models import UserInfo
from app.r2 import presign_put

router = APIRouter()


@router.post("/upload_url")
def create_upload_url(
    request: Upload_request,
    database: Session = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    return presign_put(current_user, request.mime, request.size, request.name)
