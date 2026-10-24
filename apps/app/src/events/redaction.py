"""Redact secrets from persisted events and WebSocket history payloads.

Trigger-rule actions can carry secrets (notably legacy PuryFi per-rule
passwords). Event history is readable by the `READ_EVENTS` permission, which
is broader than the admin-only trigger-rule editor, so action payloads must be
sanitised before they are stored or broadcast.

The key-name fallback protects payloads from integrations that do not declare
`ActionDef.secret_fields`; declared fields are always redacted.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

REDACTED = "••••••••"

_SENSITIVE_KEYS = frozenset(
    {
        "authorization",
        "cookie",
        "credentials",
        "otp",
        "password",
        "passwd",
        "pin",
        "pw",
        "pwd",
        "secret",
        "secret_key",
        "secretkey",
        "token",
        "api_token",
        "access_token",
        "accesstoken",
        "refresh_token",
        "refreshtoken",
        "emergency_token",
        "lock_password",
        "lockpassword",
        "api_key",
        "apikey",
        "private_key",
        "privatekey",
    }
)

_SENSITIVE_SUFFIXES = (
    "password",
    "passwd",
    "secret",
    "token",
    "api_key",
    "private_key",
)


def _is_sensitive_key(key: str, secret_fields: frozenset[str]) -> bool:
    normalized = key.strip().lower().replace("-", "_")
    if normalized in secret_fields or normalized in _SENSITIVE_KEYS:
        return True
    return any(
        normalized == suffix or normalized.endswith(f"_{suffix}")
        for suffix in _SENSITIVE_SUFFIXES
    )


def redact_payload(
    value: Any, secret_fields: Iterable[str] = ()
) -> Any:
    """Return a deep copy with sensitive keys replaced by a placeholder."""
    extra = frozenset(
        field.strip().lower().replace("-", "_") for field in secret_fields
    )
    return _redact_value(value, extra)


def _redact_value(value: Any, secret_fields: frozenset[str]) -> Any:
    if isinstance(value, Mapping):
        return {
            key: (
                REDACTED
                if _is_sensitive_key(str(key), secret_fields)
                else _redact_value(item, secret_fields)
            )
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_redact_value(item, secret_fields) for item in value]
    if isinstance(value, tuple):
        return tuple(_redact_value(item, secret_fields) for item in value)
    return value


def redact_triggered_rules(triggered_rules: Any) -> Any:
    """Redact action payloads in a stored `TriggeredEvent.triggered_rules` value."""
    if not isinstance(triggered_rules, list):
        return triggered_rules

    redacted_rules = []
    for rule in triggered_rules:
        if not isinstance(rule, Mapping):
            redacted_rules.append(rule)
            continue

        safe_rule = dict(rule)
        actions = safe_rule.get("actions")
        if isinstance(actions, list):
            safe_rule["actions"] = [
                {
                    **action,
                    "payload": redact_payload(action.get("payload") or {}),
                }
                if isinstance(action, Mapping)
                else action
                for action in actions
            ]
        redacted_rules.append(safe_rule)

    return redacted_rules
