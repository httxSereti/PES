"""Action modifiers for trigger rules.

The first modifier is `scale`: it multiplies numeric fields of an action
payload and/or its duration when an optional condition matches. This is what
powers rules like "double the effect when Sereti is the author".

Modifiers are stored as JSON on `trigger_actions.modifiers`, so the same
engine can later support repeat/delay/clamp without another migration.
"""

from __future__ import annotations

import copy
import re
from collections.abc import Mapping, Sequence
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from .conditions import ConditionSpec, evaluate_condition

_NUMBER_RE = re.compile(r"^(%?)([+-]?)(\d+(?:\.\d+)?)$")
_RANGE_RE = re.compile(r"^(%?)([+-]?)\[(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\]$")

_ALLOWED_FIELDS = {
    "value",
    "duration",
    "pct",
    "level_pct",
    "duration_minutes",
    "max_pct",
    "scale_pct",
    "seconds",
}


class ScaleModifier(BaseModel):
    type: Literal["scale"] = "scale"
    factor: float = Field(default=2.0, gt=0, le=10)
    fields: list[str] = Field(default_factory=lambda: ["value"])
    when: ConditionSpec | None = None

    @field_validator("fields")
    @classmethod
    def _known_fields(cls, values: list[str]) -> list[str]:
        known = [value for value in values if value in _ALLOWED_FIELDS]
        if not known:
            raise ValueError("fields must contain at least one known field")
        return known


def _format_number(value: float) -> str:
    if abs(value - round(value)) < 1e-9:
        return str(int(round(value)))
    return f"{value:.4f}".rstrip("0").rstrip(".")


def scale_value(value: Any, factor: float) -> Any:
    """Scale a MagicNumber-like value while preserving its operator/range."""

    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, (int, float)):
        scaled = value * factor
        return int(round(scaled)) if isinstance(value, int) else scaled
    if not isinstance(value, str):
        return value

    text = value.strip()
    match = _NUMBER_RE.match(text)
    if match:
        prefix, sign, number = match.groups()
        scaled = float(number) * factor
        return f"{prefix}{sign}{_format_number(scaled)}"

    match = _RANGE_RE.match(text)
    if match:
        prefix, sign, low, high = match.groups()
        scaled_low = float(low) * factor
        scaled_high = float(high) * factor
        return f"{prefix}{sign}[{_format_number(scaled_low)}-{_format_number(scaled_high)}]"

    return value


def scale_duration(duration: int, factor: float) -> int:
    """Scale a duration in seconds; -1 (permanent) is left untouched."""

    if duration < 0:
        return duration
    return max(0, int(round(duration * factor)))


def normalize_modifiers(
    modifiers: Sequence[Mapping[str, Any]] | None,
) -> list[ScaleModifier]:
    normalized: list[ScaleModifier] = []
    for raw in list(modifiers or ())[:20]:
        try:
            modifier = ScaleModifier.model_validate(raw)
        except Exception:
            continue
        if modifier.factor <= 0:
            continue
        modifier.fields = [field for field in modifier.fields if field in _ALLOWED_FIELDS]
        if not modifier.fields:
            continue
        normalized.append(modifier)
    return normalized


def apply_modifiers(
    payload: Mapping[str, Any] | None,
    duration: int,
    modifiers: Sequence[Mapping[str, Any]] | None,
    context: Mapping[str, Any],
) -> tuple[dict[str, Any], int, list[dict[str, Any]]]:
    """
    Apply every matching modifier to a copy of the payload and duration.

    Returns `(payload, duration, applied)` where `applied` is a serializable
    trace of the modifiers that fired (useful for the run inspector).
    """

    result = copy.deepcopy(dict(payload or {}))
    result_duration = duration
    applied: list[dict[str, Any]] = []

    for modifier in normalize_modifiers(modifiers):
        if modifier.when is not None and not evaluate_condition(modifier.when, context):
            continue

        changed: list[str] = []
        for field in modifier.fields:
            if field == "duration":
                result_duration = scale_duration(result_duration, modifier.factor)
                changed.append(field)
                continue
            if field not in result:
                continue
            scaled = scale_value(result[field], modifier.factor)
            if scaled != result[field]:
                result[field] = scaled
                changed.append(field)

        if changed:
            applied.append(
                {
                    "type": "scale",
                    "factor": modifier.factor,
                    "fields": changed,
                    "when": (
                        modifier.when.model_dump(mode="json")
                        if modifier.when is not None
                        else None
                    ),
                }
            )

    return result, result_duration, applied
