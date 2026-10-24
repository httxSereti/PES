"""Track Chaster time changes caused by PES itself.

The Chaster API action `CHASTER_TIME_UPDATE` can produce a `time_changed`
webhook. That echo must not be allowed to trigger another Chaster time update,
or a rule on time-added/time-removed would feed back into itself.
"""

from __future__ import annotations

from integrations.echo_guard import EchoGuard

_TIME_ECHO_TTL_SECONDS = 15.0

_guard = EchoGuard()


def expect_time_echo(event_type: str, depth: int, count: int = 1) -> None:
    """Mark upcoming time_changed webhooks as local action echoes."""
    _guard.expect(event_type, _TIME_ECHO_TTL_SECONDS, depth, count=count)


def consume_time_echo(event_type: str) -> int | None:
    """Return the causation depth of the next matching time echo, if any."""
    return _guard.consume(event_type)


def clear() -> None:
    """Drop pending expectations (app shutdown/tests)."""
    _guard.clear()
