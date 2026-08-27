from fastapi import APIRouter, Depends

from models import User
from typings import Permission
from store import Store

from api.helpers import require_permission, to_utc_iso

router = APIRouter(tags=["users"])
store = Store()


def _serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "display_name": user.display_name,
        "role": user.role.value,
        "permissions": [p.value for p in user.get_permissions()],
        "custom_permissions": [p.value for p in user.custom_permissions],
        "is_active": user.is_active,
        # online == currently holding a live WebSocket connection
        "is_online": user.id in store.websocket.get_connected_clients(),
        "created_at": to_utc_iso(user.created_at),
        "last_login_at": to_utc_iso(user.last_login_at),
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
