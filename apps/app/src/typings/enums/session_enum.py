from enum import Enum


class SessionType(Enum):
    """Kind of application session."""

    TESTING = "testing"
    SOLO_PLAY = "solo_play"
    MULTIPLAYER = "multiplayer"


class SessionStatus(Enum):
    """Lifecycle of an application session."""

    RUNNING = "running"
    ENDED = "ended"
