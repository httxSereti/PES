"""
Wheel of Fortune custom action codes (Chaster).

A WOF text segment can carry a code the rule engine never sees:

    {p:[Profile][Level][Duration]} description...
    {u:[Units]@[Channels]@[Value]} description...   (WIP)

These bypass trigger rules: the dispatcher enqueues the parsed items
directly while still logging the event.
"""

from __future__ import annotations

import random
import re
from datetime import datetime

import structlog
from cuid2 import cuid_wrapper

from events.enums import ActionType, QueueItemStatus
from events.models import QueueItem

logger = structlog.get_logger("pes")
generate_id = cuid_wrapper()

# Full code match (used to build the event type, e.g. "custom:wof_profile_Jfa")
PROFILE_CODE = re.compile(r"^\{p:([A-Z][A-Za-z][A-Za-z])\}")
UNIT_CODE = re.compile(r"^\{u:([A-Z]@[A-Za-z]@[A-Za-z])\}")

# Detail match (profile letter / level char / duration char)
PROFILE_DETAILS = re.compile(r"^\{p:([A-Z])([A-Za-z])([A-Za-z])\}")


def match_profile(text: str) -> re.Match[str] | None:
    return PROFILE_CODE.match(text)


def match_unit(text: str) -> re.Match[str] | None:
    return UNIT_CODE.match(text)


def build_profile_items(text: str, origin: str) -> list[QueueItem]:
    """
    Parse a dynamic WOF profile code (e.g. {p:Jfa}) into queue items.

    Format: {p:[Profile][Level][Duration]}
      - Profile: uppercase letter A-J (or X for random)
      - Level: uppercase = +5% per step from A, lowercase = -2% per step from a
      - Duration: uppercase = 10s per step from A, lowercase = random up to 10s per step from a
    """
    m = PROFILE_DETAILS.match(text)
    if not m:
        return []

    profile = m.group(1)

    # Level coefficient
    level_char = m.group(2)
    if level_char.isupper():
        level_pct = 100 + (ord(level_char) - 65) * 5
    else:
        level_pct = 100 - (ord(level_char) - 97) * 2

    # Duration
    dur_char = m.group(3)
    if dur_char.isupper():
        duration = (ord(dur_char) - 64) * 10
    else:
        duration = random.randint(10, (ord(dur_char) - 96) * 10)

    logger.info(
        f"[Chaster|WOF] Parsed dynamic profile profile={profile}, level={level_pct}%, duration={duration}s",
        profile=profile,
        origin=origin,
    )

    return [
        QueueItem(
            id=generate_id(),
            action_type=ActionType.PROFILE,
            payload={"profile": profile, "level_pct": level_pct},
            duration=duration,
            cumulative=False,
            priority=0,
            status=QueueItemStatus.WAITING,
            origin=origin,
            display_name=f"WOF | Profile: {profile} at {level_pct}% for {duration}s",
            created_at=datetime.now(),
        )
    ]
