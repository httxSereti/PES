from fastapi import Depends, HTTPException, status

from api.helpers.jwt_helpers import get_current_user
from store import Store
from typings import Permission

store = Store()


def require_permission(permission: Permission):
    """
    FastAPI dependency factory: gate a REST route on an *effective*
    permission (role bundle ∪ custom grants).
    """

    async def dependency(current_user: dict = Depends(get_current_user)) -> dict:
        if not store.check_permission(current_user["id"], permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permission: {permission.value}",
            )
        return current_user

    return dependency
