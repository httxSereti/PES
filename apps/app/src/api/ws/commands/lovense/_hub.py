"""Shared accessor for the Lovense hub inside WS command handlers."""

from __future__ import annotations

import time
from collections import defaultdict, deque

from integrations.lovense.hub import LovenseHub

_rate_buckets: dict[str, deque[float]] = defaultdict(deque)


def get_hub() -> LovenseHub:
    from integrations import integration_registry

    integration = integration_registry.get("lovense")
    if integration is None:
        raise RuntimeError("Lovense integration is not registered")
    hub = getattr(integration, "hub", None)
    if hub is None:
        raise RuntimeError("Lovense integration is not started")
    return hub


def rate_limited(hub: LovenseHub, user_id: str) -> bool:
    """Sliding one-second window per user (manual control only)."""
    limit = max(1, hub._int("command_rate_limit", 20))
    now = time.monotonic()
    bucket = _rate_buckets[user_id]
    while bucket and bucket[0] <= now - 1.0:
        bucket.popleft()
    if len(bucket) >= limit:
        return True
    bucket.append(now)
    return False


def target_permission_error(hub: LovenseHub, targets: dict, user) -> str | None:
    """Refuse control of a device owned by another user (unless manager)."""
    from typings import Permission

    if user.has_permission(Permission.MANAGE_DEVICES):
        return None
    for device in hub.resolve_devices(targets):
        owner = device.get("owner_user_id")
        if owner and owner != user.id:
            return "This device belongs to another user"
    return None
