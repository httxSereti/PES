"""REST and relay WebSocket routes owned by the Lovense integration."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, WebSocket
from pydantic import BaseModel, Field

from api.helpers import require_permission
from integrations import integration_registry
from typings import Permission

router = APIRouter(prefix="/lovense", tags=["lovense"])


def _hub():
    integration = integration_registry.get("lovense")
    if integration is None:
        raise HTTPException(status_code=503, detail="Lovense integration unavailable")
    return integration.hub  # type: ignore[attr-defined]


class NodeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    kind: str = "direct"
    url: str | None = None
    enabled: bool = True


class NodeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    url: str | None = None
    enabled: bool | None = None


class DeviceUpdate(BaseModel):
    alias: str | None = None
    tags: list[str] | None = None
    max_intensity_pct: int | None = Field(default=None, ge=0, le=100)
    control_policy: str | None = None


class PatternCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    definition: dict[str, Any]
    description: str | None = None
    visibility: str = "private"
    tags: list[str] = Field(default_factory=list)


class PatternUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    definition: dict[str, Any] | None = None
    description: str | None = None
    visibility: str | None = None
    tags: list[str] | None = None


class PatternImport(BaseModel):
    document: dict[str, Any]


# ───────── Nodes ─────────


@router.get("/nodes")
async def list_nodes(
    _: dict = Depends(require_permission(Permission.READ_DEVICES)),
):
    hub = _hub()
    return {"nodes": hub.serialize_nodes(), "health": hub.health()}


@router.post("/nodes")
async def create_node(
    body: NodeCreate,
    _: dict = Depends(require_permission(Permission.MANAGE_DEVICES)),
):
    try:
        return await _hub().add_node(
            name=body.name, kind=body.kind, url=body.url, enabled=body.enabled
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.patch("/nodes/{node_id}")
async def update_node(
    node_id: str,
    body: NodeUpdate,
    _: dict = Depends(require_permission(Permission.MANAGE_DEVICES)),
):
    try:
        return await _hub().update_node(
            node_id, name=body.name, url=body.url, enabled=body.enabled
        )
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err


@router.delete("/nodes/{node_id}")
async def delete_node(
    node_id: str,
    _: dict = Depends(require_permission(Permission.MANAGE_DEVICES)),
):
    await _hub().delete_node(node_id)
    return {"status": "ok"}


@router.post("/nodes/{node_id}/token")
async def rotate_token(
    node_id: str,
    _: dict = Depends(require_permission(Permission.MANAGE_DEVICES)),
):
    try:
        token = await _hub().rotate_token(node_id)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"token": token}


@router.post("/nodes/{node_id}/reconnect")
async def reconnect_node(
    node_id: str,
    _: dict = Depends(require_permission(Permission.MANAGE_DEVICES)),
):
    await _hub().reconnect_node(node_id)
    return {"status": "ok"}


# ───────── Devices ─────────


@router.get("/devices")
async def list_devices(
    _: dict = Depends(require_permission(Permission.READ_DEVICES)),
):
    return _hub().serialize_devices()


@router.patch("/devices/{device_id}")
async def update_device(
    device_id: str,
    body: DeviceUpdate,
    _: dict = Depends(require_permission(Permission.WRITE_DEVICES)),
):
    try:
        return await _hub().update_device(
            device_id,
            alias=body.alias,
            tags=body.tags,
            max_intensity_pct=body.max_intensity_pct,
            control_policy=body.control_policy,
        )
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err


# ───────── Patterns ─────────


@router.get("/patterns")
async def list_patterns(
    _: dict = Depends(require_permission(Permission.READ_DEVICES)),
):
    return _hub().serialize_patterns()


@router.post("/patterns")
async def create_pattern(
    body: PatternCreate,
    user: dict = Depends(require_permission(Permission.WRITE_DEVICES)),
):
    try:
        row = await _hub().save_pattern(
            name=body.name,
            definition=body.definition,
            description=body.description or "",
            visibility=body.visibility,
            tags=body.tags,
            author_id=str(user.get("id") or "system"),
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"id": row.id, "name": row.name}


@router.patch("/patterns/{pattern_id}")
async def update_pattern(
    pattern_id: str,
    body: PatternUpdate,
    _: dict = Depends(require_permission(Permission.WRITE_DEVICES)),
):
    hub = _hub()
    row = hub.get_pattern_row(pattern_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Pattern not found")
    try:
        updated = await hub.save_pattern(
            name=body.name or row.name,
            definition=body.definition or row.definition,
            description=body.description
            if body.description is not None
            else (row.description or ""),
            visibility=body.visibility or row.visibility,
            tags=body.tags if body.tags is not None else list(row.tags or []),
            pattern_id=pattern_id,
            author_id=row.author_id,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"id": updated.id, "name": updated.name}


@router.delete("/patterns/{pattern_id}")
async def delete_pattern(
    pattern_id: str,
    _: dict = Depends(require_permission(Permission.WRITE_DEVICES)),
):
    try:
        await _hub().delete_pattern(pattern_id)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"status": "ok"}


@router.get("/patterns/{pattern_id}/export")
async def export_pattern(
    pattern_id: str,
    _: dict = Depends(require_permission(Permission.READ_DEVICES)),
):
    row = _hub().get_pattern_row(pattern_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Pattern not found")
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description or "",
        "visibility": row.visibility,
        "tags": list(row.tags or []),
        "definition": row.definition,
    }


@router.post("/patterns/import")
async def import_pattern(
    body: PatternImport,
    user: dict = Depends(require_permission(Permission.WRITE_DEVICES)),
):
    document = body.document
    name = str(document.get("name") or "Imported pattern")
    definition = dict(document.get("definition") or document)
    definition["name"] = name
    try:
        row = await _hub().save_pattern(
            name=name,
            definition=definition,
            description=str(document.get("description") or ""),
            visibility=str(document.get("visibility") or "private"),
            tags=list(document.get("tags") or []),
            author_id=str(user.get("id") or "system"),
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"id": row.id, "name": row.name}


# ───────── Health ─────────


@router.get("/health")
async def health(
    _: dict = Depends(require_permission(Permission.READ_DEVICES)),
):
    return _hub().health()


# ───────── Managed Intiface ─────────


@router.get("/intiface")
async def intiface_status(
    _: dict = Depends(require_permission(Permission.READ_DEVICES)),
):
    return _hub().intiface_status()


@router.post("/intiface/start")
async def intiface_start(
    _: dict = Depends(require_permission(Permission.MANAGE_DEVICES)),
):
    return await _hub().start_intiface()


@router.post("/intiface/stop")
async def intiface_stop(
    _: dict = Depends(require_permission(Permission.MANAGE_DEVICES)),
):
    return await _hub().stop_intiface()


@router.post("/intiface/restart")
async def intiface_restart(
    _: dict = Depends(require_permission(Permission.MANAGE_DEVICES)),
):
    return await _hub().restart_intiface()


# ───────── Companion tunnel ─────────


@router.websocket("/relay/{node_id}")
async def relay_tunnel(node_id: str, websocket: WebSocket):
    integration = integration_registry.get("lovense")
    relay = getattr(getattr(integration, "hub", None), "_relay", None)
    if relay is None:
        await websocket.close(code=4002, reason="relay disabled")
        return
    await relay.tunnel(node_id, websocket)
