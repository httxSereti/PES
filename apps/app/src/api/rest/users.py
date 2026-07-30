from fastapi import APIRouter, Depends

from models import User
from typings import Permission
from store import Store

from api.helpers import require_permission

router = APIRouter(tags=["users"])
store = Store()


def _serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "display_name": user.display_name,
        "role": user.role.value,
        "permissions": [p.value for p in user.get_permissions()],
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat(),
        "last_login_at": user.last_login_at.isoformat()
        if user.last_login_at
        else None,
    }


@router.get("/users", tags=["users"])
async def read_users(
    current_user: dict = Depends(require_permission(Permission.READ_USERS)),
):
    return [_serialize_user(u) for u in store.get_all_users().values()]


@router.get("/users/{user_id}", tags=["users"])
async def read_user(
    user_id: str,
    current_user: dict = Depends(require_permission(Permission.READ_USERS)),
):
    user = store.get_user(user_id)
    return _serialize_user(user) if user else None
