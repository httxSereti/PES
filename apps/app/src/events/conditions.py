"""Condition evaluation for trigger rules.

Conditions are stored as JSON on `trigger_rules.conditions` and evaluated
against the event payload, the resolved actor and the active session. They are
intentionally small and pure: no database access, no side effects.

Field paths:
    event.<path>    / payload.<path>   -> event payload
    actor.<path>                       -> unified actor (or legacy author)
    session.<path>                     -> active session snapshot

Bare paths are treated as event payload paths for backwards compatibility.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any, Literal

from pydantic import BaseModel, Field

ConditionOperator = Literal[
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "in",
    "not_in",
    "contains",
    "icontains",
    "starts_with",
    "ends_with",
    "matches",
    "exists",
    "between",
    "length",
    "is_null",
]

_MISSING = object()
_MAX_PATTERN_LENGTH = 256


class ConditionSpec(BaseModel):
    """One atomic condition."""

    field: str = Field(min_length=1)
    op: ConditionOperator = "eq"
    value: Any = None
    case_sensitive: bool = True


def build_condition_context(
    event_data: Mapping[str, Any] | None,
    actor: Any = None,
    session: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the read-only context used by conditions and modifiers."""

    payload = dict(event_data or {})
    actor_data: dict[str, Any] = {}

    if isinstance(actor, Mapping):
        actor_data = dict(actor)
    elif actor is not None:
        dump = getattr(actor, "model_dump", None)
        if callable(dump):
            actor_data = dict(dump())

    # Legacy payloads often carry `author` as a string or a small dict.
    if not actor_data:
        raw_actor = payload.get("actor")
        if isinstance(raw_actor, Mapping):
            actor_data = dict(raw_actor)
        else:
            raw_author = payload.get("author")
            if isinstance(raw_author, Mapping):
                actor_data = dict(raw_author)
            elif isinstance(raw_author, str):
                actor_data = {"display_name": raw_author}

    # Normalize common author aliases so rules can use actor.display_name.
    if actor_data:
        if not actor_data.get("display_name"):
            actor_data["display_name"] = (
                actor_data.get("username")
                or actor_data.get("name")
                or actor_data.get("author")
            )
        if not actor_data.get("platform_id"):
            actor_data["platform_id"] = actor_data.get("id") or actor_data.get("user_id")
        if "is_blocked" not in actor_data:
            actor_data["is_blocked"] = bool(actor_data.get("blocked", False))

    return {
        "event": payload,
        "payload": payload,
        "actor": actor_data,
        "session": dict(session or {}),
    }


def resolve_field(context: Mapping[str, Any], path: str) -> Any:
    """Resolve a dotted path in the condition context, or `_MISSING`."""

    if not path:
        return _MISSING

    parts = path.split(".")
    root = parts[0]
    if root in {"event", "payload", "actor", "session"}:
        current: Any = context.get(root, {})
        parts = parts[1:]
    else:
        current = context.get("event", {})

    for part in parts:
        if isinstance(current, Mapping):
            if part not in current:
                return _MISSING
            current = current[part]
        elif isinstance(current, Sequence) and not isinstance(current, (str, bytes)):
            try:
                current = current[int(part)]
            except (ValueError, IndexError):
                return _MISSING
        else:
            return _MISSING

    return current


def _as_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _compare_numbers(actual: Any, expected: Any, op: str) -> bool | None:
    left = _as_number(actual)
    right = _as_number(expected)
    if left is None or right is None:
        return None
    if op == "gt":
        return left > right
    if op == "gte":
        return left >= right
    if op == "lt":
        return left < right
    if op == "lte":
        return left <= right
    return None


def _as_text(value: Any, case_sensitive: bool) -> str:
    text = str(value)
    return text if case_sensitive else text.lower()


def evaluate_condition(spec: ConditionSpec | Mapping[str, Any], context: Mapping[str, Any]) -> bool:
    """Evaluate one condition. Invalid specs simply do not match."""

    try:
        condition = (
            spec if isinstance(spec, ConditionSpec) else ConditionSpec.model_validate(spec)
        )
    except Exception:
        return False

    actual = resolve_field(context, condition.field)
    expected = condition.value
    op = condition.op

    if op == "exists":
        return actual is not _MISSING and actual is not None
    if op == "is_null":
        return actual is _MISSING or actual is None

    if actual is _MISSING:
        return False

    if op in {"eq", "neq"}:
        if isinstance(actual, str) and isinstance(expected, str):
            left = _as_text(actual, condition.case_sensitive)
            right = _as_text(expected, condition.case_sensitive)
            equal = left == right
        else:
            equal = actual == expected
        return equal if op == "eq" else not equal

    if op in {"gt", "gte", "lt", "lte"}:
        numeric = _compare_numbers(actual, expected, op)
        if numeric is not None:
            return numeric
        # Fall back to string ordering only for strings.
        if isinstance(actual, str) and isinstance(expected, str):
            left = _as_text(actual, condition.case_sensitive)
            right = _as_text(expected, condition.case_sensitive)
            return {
                "gt": left > right,
                "gte": left >= right,
                "lt": left < right,
                "lte": left <= right,
            }[op]
        return False

    if op in {"in", "not_in"}:
        if not isinstance(expected, (list, tuple, set)):
            return False
        if isinstance(actual, str):
            left = _as_text(actual, condition.case_sensitive)
            values = [
                _as_text(item, condition.case_sensitive)
                for item in expected
            ]
            found = left in values
        else:
            found = actual in expected
        return found if op == "in" else not found

    if op in {"contains", "icontains", "starts_with", "ends_with"}:
        if isinstance(actual, (list, tuple, set)):
            if op == "contains":
                return expected in actual
            return False
        if not isinstance(actual, str):
            return False
        haystack = _as_text(actual, condition.case_sensitive and op != "icontains")
        needle = _as_text(expected, condition.case_sensitive and op != "icontains")
        if op in {"contains", "icontains"}:
            return needle in haystack
        if op == "starts_with":
            return haystack.startswith(needle)
        return haystack.endswith(needle)

    if op == "matches":
        if not isinstance(actual, str):
            return False
        pattern = str(expected)
        if len(pattern) > _MAX_PATTERN_LENGTH:
            return False
        flags = 0 if condition.case_sensitive else re.IGNORECASE
        try:
            return re.search(pattern, actual, flags) is not None
        except re.error:
            return False

    if op == "between":
        if not isinstance(expected, (list, tuple)) or len(expected) != 2:
            return False
        numeric = _as_number(actual)
        low = _as_number(expected[0])
        high = _as_number(expected[1])
        if numeric is not None and low is not None and high is not None:
            return low <= numeric <= high
        if isinstance(actual, str):
            return str(expected[0]) <= actual <= str(expected[1])
        return False

    if op == "length":
        try:
            return len(actual) == int(expected)
        except (TypeError, ValueError):
            return False

    return False


def evaluate_conditions(
    conditions: Sequence[ConditionSpec | Mapping[str, Any]] | None,
    mode: str,
    context: Mapping[str, Any],
) -> bool:
    """Evaluate a flat condition list using `all` or `any` semantics."""

    if not conditions:
        return True
    results = [
        evaluate_condition(condition, context)
        for condition in list(conditions)[:50]
    ]
    return all(results) if mode != "any" else any(results)
