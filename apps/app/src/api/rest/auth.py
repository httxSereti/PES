from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.helpers import (
    TokenResponse,
    create_access_token,
    get_current_user,
)
from models import User
from services.users import user_service

ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    magic_token: str


class GuestBody(BaseModel):
    display_name: str | None = None


def _issue_token(user: User) -> dict:
    access_token = create_access_token(
        data={"sub": user.id, "role": user.role.value},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {"id": user.id, "role": user.role.value},
    }


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginBody):
    """Exchange a magic token (body, never query params) for a JWT."""
    user = await user_service.authenticate_magic_token(body.magic_token)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return _issue_token(user)


@router.post("/guest", response_model=TokenResponse)
async def guest_login(body: GuestBody | None = None):
    """Issue a JWT for an ephemeral, read-only guest identity."""
    display_name = body.display_name if body else None
    return _issue_token(user_service.get_or_create_guest(display_name))


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user
