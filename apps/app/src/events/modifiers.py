"""Action modifiers for trigger rules.

Supported modifiers (applied in this order):

    probability → scale → clamp → repeat → delay

`scale` multiplies numeric fields, `clamp` only reduces a value to a maximum
(never increases it), `repeat` duplicates the effect, and `delay` postpones
the first iteration. Every modifier can carry an optional `when` condition.

Modifiers are stored as JSON on `trigger_actions.modifiers`, so the same
engine powers the Composer and the compiled FlowSpec.
"""

from __future__ import annotations

import copy
import random
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
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

_MAX_REPEAT = 10
_MAX_DELAY_SECONDS = 3600


class _ModifierBase(BaseModel):
    when: ConditionSpec | None = None


class ScaleModifier(_ModifierBase):
    type: Literal["scale"] = "scale"
    factor: float = Field(default=2.0, gt=0, le=10)
    fields: list[str] = Field(default_factory=lambda: ["value"])

    @field_validator("fields")
    @classmethod
    def _known_fields(cls, values: list[str]) -> list[str]:
        known = [value for value in values if value in _ALLOWED_FIELDS]
        if not known:
            raise ValueError("fields must contain at least one known field")
        return known


class ClampModifier(_ModifierBase):
    """Cap numeric fields to a maximum. Never raises a value."""

    type: Literal["clamp"] = "clamp"
    max: float = Field(default=100, ge=0, le=100_000)
    fields: list[str] = Field(default_factory=lambda: ["value"])

    @field_validator("fields")
    @classmethod
    def _known_fields(cls, values: list[str]) -> list[str]:
        known = [value for value in values if value in _ALLOWED_FIELDS]
        if not known:
            raise ValueError("fields must contain at least one known field")
        return known


class DelayModifier(_ModifierBase):
    type: Literal["delay"] = "delay"
    seconds: int = Field(default=5, ge=0, le=_MAX_DELAY_SECONDS)


class RepeatModifier(_ModifierBase):
    type: Literal["repeat"] = "repeat"
    count: int = Field(default=2, ge=2, le=_MAX_REPEAT)
    interval_seconds: int = Field(default=0, ge=0, le=_MAX_DELAY_SECONDS)


class ProbabilityModifier(_ModifierBase):
    type: Literal["probability"] = "probability"
    probability: float = Field(default=0.5, ge=0, le=1)


Modifier = (
    ScaleModifier
    | ClampModifier
    | DelayModifier
    | RepeatModifier
    | ProbabilityModifier
)

_MODIFIER_CLASSES: dict[str, type[_ModifierBase]] = {
    "scale": ScaleModifier,
    "clamp": ClampModifier,
    "delay": DelayModifier,
    "repeat": RepeatModifier,
    "probability": ProbabilityModifier,
}

_ORDER = {"probability": 0, "scale": 1, "clamp": 2, "repeat": 3, "delay": 4}


@dataclass
class ModifierOutcome:
    """Result of applying one action's modifier chain."""

    payload: dict[str, Any]
    duration: int
    applied: list[dict[str, Any]] = field(default_factory=list)
    repeat: int = 1
    delay_seconds: int = 0
    repeat_interval_seconds: int = 0
    blocked_reason: str | None = None


def validate_modifier(raw: Mapping[str, Any] | _ModifierBase) -> Modifier:
    """Validate one modifier dict (or return it unchanged if already parsed)."""

    if isinstance(raw, _ModifierBase):
        return raw  # type: ignore[return-value]
    modifier_type = raw.get("type")
    cls = _MODIFIER_CLASSES.get(str(modifier_type))
    if cls is None:
        raise ValueError(f"Unknown modifier type: {modifier_type!r}")
    return cls.model_validate(raw)  # type: ignore[return-value]


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


def clamp_value(value: Any, maximum: float) -> Any:
    """Cap a numeric or MagicNumber-like value, never increasing it."""

    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, (int, float)):
        return maximum if value > maximum else value
    if not isinstance(value, str):
        return value

    text = value.strip()
    match = _NUMBER_RE.match(text)
    if match:
        prefix, sign, number = match.groups()
        if sign == "-":
            # A relative decrease can only lower the value: leave it alone.
            return value
        numeric = float(number)
        if numeric <= maximum:
            return value
        return f"{prefix}{sign}{_format_number(maximum)}"

    match = _RANGE_RE.match(text)
    if match:
        prefix, sign, low, high = match.groups()
        if sign == "-":
            return value
        clamped = min(float(high), maximum)
        if clamped >= float(high):
            return value
        return f"{prefix}{sign}[{_format_number(float(low))}-{_format_number(clamped)}]"

    return value


def scale_duration(duration: int, factor: float) -> int:
    """Scale a duration in seconds; -1 (permanent) is left untouched."""

    if duration < 0:
        return duration
    return max(0, int(round(duration * factor)))


def clamp_duration(duration: int, maximum: float) -> int:
    if duration < 0:
        return duration
    return min(duration, max(0, int(maximum)))


def normalize_modifiers(
    modifiers: Sequence[Mapping[str, Any]] | None,
) -> list[Modifier]:
    normalized: list[Modifier] = []
    for raw in list(modifiers or ())[:20]:
        try:
            modifier = validate_modifier(raw)
        except Exception:
            continue
        normalized.append(modifier)
    return normalized


def apply_modifiers(
    payload: Mapping[str, Any] | None,
    duration: int,
    modifiers: Sequence[Mapping[str, Any]] | None,
    context: Mapping[str, Any],
) -> ModifierOutcome:
    """
    Apply every matching modifier to a copy of the payload and duration.

    Returns a `ModifierOutcome` with the transformed values, the applied
    trace, repeat/delay instructions and a blocked reason when a probability
    gate rejects the effect.
    """

    result = copy.deepcopy(dict(payload or {}))
    result_duration = duration
    outcome = ModifierOutcome(payload=result, duration=result_duration)

    ordered = sorted(
        normalize_modifiers(modifiers),
        key=lambda modifier: _ORDER.get(modifier.type, 99),
    )

    for modifier in ordered:
        if modifier.when is not None and not evaluate_condition(modifier.when, context):
            continue

        if isinstance(modifier, ProbabilityModifier):
            rolled = random.random()
            if rolled > modifier.probability:
                outcome.blocked_reason = "probability"
                outcome.applied.append(
                    {
                        "type": "probability",
                        "probability": modifier.probability,
                        "blocked": True,
                    }
                )
                break
            outcome.applied.append(
                {"type": "probability", "probability": modifier.probability}
            )
            continue

        if isinstance(modifier, ScaleModifier):
            changed: list[str] = []
            for field_name in modifier.fields:
                if field_name == "duration":
                    result_duration = scale_duration(result_duration, modifier.factor)
                    changed.append(field_name)
                    continue
                if field_name not in result:
                    continue
                scaled = scale_value(result[field_name], modifier.factor)
                if scaled != result[field_name]:
                    result[field_name] = scaled
                    changed.append(field_name)
            if changed:
                outcome.applied.append(
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
            continue

        if isinstance(modifier, ClampModifier):
            changed = []
            for field_name in modifier.fields:
                if field_name == "duration":
                    clamped_duration = clamp_duration(
                        result_duration, modifier.max
                    )
                    if clamped_duration != result_duration:
                        result_duration = clamped_duration
                        changed.append(field_name)
                    continue
                if field_name not in result:
                    continue
                clamped = clamp_value(result[field_name], modifier.max)
                if clamped != result[field_name]:
                    result[field_name] = clamped
                    changed.append(field_name)
            if changed:
                outcome.applied.append(
                    {
                        "type": "clamp",
                        "max": modifier.max,
                        "fields": changed,
                        "when": (
                            modifier.when.model_dump(mode="json")
                            if modifier.when is not None
                            else None
                        ),
                    }
                )
            continue

        if isinstance(modifier, RepeatModifier):
            outcome.repeat = min(_MAX_REPEAT, outcome.repeat * modifier.count)
            outcome.repeat_interval_seconds = max(
                outcome.repeat_interval_seconds, modifier.interval_seconds
            )
            outcome.applied.append(
                {
                    "type": "repeat",
                    "count": modifier.count,
                    "interval_seconds": modifier.interval_seconds,
                }
            )
            continue

        if isinstance(modifier, DelayModifier):
            outcome.delay_seconds = min(
                _MAX_DELAY_SECONDS, outcome.delay_seconds + modifier.seconds
            )
            outcome.applied.append(
                {"type": "delay", "seconds": modifier.seconds}
            )

    outcome.payload = result
    outcome.duration = result_duration
    return outcome
