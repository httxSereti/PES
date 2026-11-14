"""
REST surface of the integrations module.

The catalog is also broadcast over WS (`integrations:load` / `integrations:update`);
this router additionally exposes declared settings values (env-backed secrets
masked) for the admin integrations page, plus a small connector manifest for
third-party authors and health checks.
"""

from fastapi import APIRouter, Depends, HTTPException

from api.helpers import require_permission
from integrations import integration_registry
from typings import Permission

router = APIRouter(prefix="/integrations", tags=["integrations"])

MANIFEST_VERSION = 1


def _manifest_entry(integration) -> dict:
    entry = integration_registry.catalog_entry(integration, include_settings=False)
    try:
        health = integration.health()
    except Exception as exc:  # pragma: no cover - defensive
        health = {"status": "error", "error": str(exc)}
    entry["manifest_version"] = MANIFEST_VERSION
    entry["health"] = health
    return entry


@router.get("")
async def list_integrations(
    current_user: dict = Depends(require_permission(Permission.ADMIN)),
):
    """
    Every registered integration with its events, actions, settings (and
    current values — env-backed secrets are masked).
    """
    return integration_registry.catalog(include_settings=True)


@router.get("/manifests")
async def list_connector_manifests(
    current_user: dict = Depends(require_permission(Permission.ADMIN)),
):
    """Connector SDK manifests for every registered integration."""
    return [_manifest_entry(integration) for integration in integration_registry.all()]


@router.get("/{integration_id}/manifest")
async def get_connector_manifest(
    integration_id: str,
    current_user: dict = Depends(require_permission(Permission.ADMIN)),
):
    """One connector manifest, including its live health snapshot."""
    integration = integration_registry.get(integration_id)
    if integration is None:
        raise HTTPException(status_code=404, detail="Integration not found")
    return _manifest_entry(integration)
