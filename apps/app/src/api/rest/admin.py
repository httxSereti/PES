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


class UserUpdate(BaseModel):
    """Partial update: only the provided fields are applied."""

    display_name: str | None = None
    is_active: bool | None = None


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

    if user_role == Role.HOST:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="HOST role can't be assigned; it's bootstrap-only",
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
    target = Store().get_user(user_id)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Safety rails mirrored from the UI: HOST is bootstrap-only and admins
    # must not reassign their own role.
    if target.role == Role.HOST:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="HOST role can't be changed",
        )
    if target.id == current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You can't change your own role",
        )

    try:
        user_role = Role(role)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect Role selected",
        )
    if user_role == Role.HOST:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="HOST role can't be assigned; it's bootstrap-only",
        )

    if not await user_service.set_user_role(user_id, user_role):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return {"status": "ok"}


@router.patch("/users/{user_id}", tags=["admin"])
async def update_user(
    user_id: str,
    body: UserUpdate,
    current_user: dict = Depends(require_permission(Permission.MANAGE_USERS)),
):
    """Update a user's display name and/or active state (partial update)."""
    target = Store().get_user(user_id)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    if target.is_ephemeral:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ephemeral guests can't be modified",
        )

    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nothing to update",
        )

    # Validate everything before writing anything.
    display_name: str | None = None
    if "display_name" in fields:
        display_name = (fields["display_name"] or "").strip()
        if not display_name or len(display_name) > 32:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Display name must be between 1 and 32 characters",
            )

    is_active: bool | None = None
    if "is_active" in fields:
        is_active = bool(fields["is_active"])
        if target.role == Role.HOST and not is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="HOST users can't be deactivated",
            )
        if target.id == current_user["id"] and not is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You can't deactivate your own account",
            )

    if display_name is not None:
        await user_service.set_user_display_name(target.id, display_name)
    if is_active is not None:
        await user_service.set_user_active(target.id, is_active)

    updated = Store().get_user(user_id)
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return _serialize_user(updated)


@router.delete("/users/{user_id}", tags=["admin"])
async def delete_user(
    user_id: str,
    current_user: dict = Depends(require_permission(Permission.MANAGE_USERS)),
):
    """
    Permanently delete a user (magic tokens included). The HOST account and
    your own account are protected; ephemeral guests aren't persisted.
    """
    target = Store().get_user(user_id)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    if target.is_ephemeral:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ephemeral guests can't be deleted",
        )
    if target.role == Role.HOST:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="HOST users can't be deleted",
        )
    if target.id == current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You can't delete your own account",
        )

    if not await user_service.delete_user(user_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return {"status": "ok"}
