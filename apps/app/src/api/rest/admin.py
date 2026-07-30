import os
from fastapi import APIRouter, HTTPException, status, Depends

from typings import Permission, Role
from api.helpers import require_permission
from services.users import user_service

FRONT_URL: str = os.getenv("FRONT_URL")

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/generateMagicLink", tags=["admin"])
async def generate_magic_link(
    role: str,
    display_name: str,
    current_user: dict = Depends(require_permission(Permission.MANAGE_USERS)),
):
    """Create a persisted user and return its one-shot magic login link."""
    try:
        user_role = Role(role)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect Role selected",
        )

    _, raw_token = await user_service.create_user(user_role, display_name)

    return {"magic_link": f"{FRONT_URL}/auth?magic_token={raw_token}"}


@router.post("/users/{user_id}/role", tags=["admin"])
async def set_user_role(
    user_id: str,
    role: str,
    current_user: dict = Depends(require_permission(Permission.MANAGE_USERS)),
):
    """Change a user's role (write-through; live WS sessions are refreshed)."""
    try:
        user_role = Role(role)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect Role selected",
        )

    if not await user_service.set_user_role(user_id, user_role):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return {"status": "ok"}
