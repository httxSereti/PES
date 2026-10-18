"""
REST surface of the integrations module.

The catalog is also broadcast over WS (`integrations:load` / `integrations:update`);
this router additionally exposes declared settings values (secrets masked) for
the admin integrations page.
"""

from fastapi import APIRouter, Depends

from api.helpers import require_permission
from integrations import integration_registry
from typings import Permission

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("")
async def list_integrations(
    current_user: dict = Depends(require_permission(Permission.ADMIN)),
):
    """
    Every registered integration with its events, actions, settings (and
    current values — secrets are masked).
    """
    return integration_registry.catalog(include_settings=True)
