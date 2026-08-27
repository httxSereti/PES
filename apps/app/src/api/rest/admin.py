import os
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

from typings import ROLE_PERMISSIONS, Permission, Role
from api.helpers import require_permission
from api.rest.users import _serialize_user
from services.users import user_service
from store import Store

FRONT_URL: str = os.getenv("FRONT_URL")

router = APIRouter(prefix="/admin", tags=["admin"])


class PermissionsUpdate(BaseModel):
    grant: list[str] = []
    revoke: list[str] = []


def _parse_permissions(values: list[str]) -> set[Permission]:
    perms: set[Permission] = set()
    for value in values:
        try:
            perms.add(Permission(value))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown permission: {value}",
            )
    return perms


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


@router.post("/users/{user_id}/magic-link", tags=["admin"])
async def generate_user_magic_link(
    user_id: str,
    current_user: dict = Depends(require_permission(Permission.MANAGE_USERS)),
):
    """Issue a fresh one-shot magic login link for an existing user."""
    raw_token = await user_service.generate_magic_link_for_user(user_id)
    if raw_token is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return {"magic_link": f"{FRONT_URL}/auth?magic_token={raw_token}"}


@router.get("/roles", tags=["admin"])
async def get_roles(
    current_user: dict = Depends(require_permission(Permission.MANAGE_USERS)),
):
    """Static role → permission-bundle map, so the UI can tell role grants
    apart from custom ones without hardcoding it."""
    return {
        role.value: sorted(p.value for p in perms)
        for role, perms in ROLE_PERMISSIONS.items()
    }


@router.post("/users/{user_id}/permissions", tags=["admin"])
async def set_user_permissions(
    user_id: str,
    body: PermissionsUpdate,
    current_user: dict = Depends(require_permission(Permission.MANAGE_USERS)),
):
    """Grant/revoke custom permissions (write-through; live WS sessions refreshed)."""
    if not await user_service.set_user_permissions(
        user_id,
        grant=_parse_permissions(body.grant),
        revoke=_parse_permissions(body.revoke),
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    updated = Store().get_user(user_id)
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return _serialize_user(updated)


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
