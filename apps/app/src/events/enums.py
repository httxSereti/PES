from enum import Enum


class ActionType(str, Enum):
    """Types of actions that can be triggered by events."""

    PROFILE = "PROFILE"
    LEVEL = "LEVEL"
    MULT = "MULT"
    CHASTER_TIME_ADD = "CHASTER_TIME_ADD"


class QueueItemStatus(str, Enum):
    """Status of an item in the action queue."""

    WAITING = "WAITING"
    RUNNING = "RUNNING"
    DONE = "DONE"
    CANCELLED = "CANCELLED"


class TriggerableEvent(str, Enum):
    """All events that can trigger actions."""

    # Chaster — Pillory Extension
    CHASTER_PILLORY_VOTE = "chaster_pillory_vote"
    CHASTER_PILLORY_STARTED = "chaster_pillory_started"
    CHASTER_PILLORY_ENDED = "chaster_pillory_ended"

    # Chaster — Shared Link vote add/sub
    CHASTER_VOTE_ADD = "chaster_vote_add"
    CHASTER_VOTE_SUB = "chaster_vote_sub"

    # Chaster — User/KH add/sub time
    CHASTER_TIME_ADD = "chaster_time_add"
    CHASTER_TIME_SUB = "chaster_time_sub"

    # Chaster — Wheel Of Fortune Extension
    CHASTER_WOF_TURNED = "chaster_wof_turned"

    # Chaster — Lock state
    CHASTER_LOCK_FROZEN = "chaster_lock_frozen"
    CHASTER_LOCK_UNFROZEN = "chaster_lock_unfrozen"

    # Sensors
    SENSOR_SOUND = "sensor_sound"
    SENSOR_POSITION = "sensor_position"
    SENSOR_MOVE = "sensor_move"
