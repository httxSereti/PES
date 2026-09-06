from enum import Enum


class EdgingSessionStatus(Enum):
    """Lifecycle of an edging training session."""

    CONFIGURED = "configured"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class EdgingGoalType(Enum):
    """A session goal is reached when *all* configured goals are met."""

    DURATION = "duration"  # value: seconds the session must last
    EDGES = "edges"  # value: number of successful edges to perform


class EdgeDifficulty(Enum):
    """How hard the edge felt, chosen by the one recording it."""

    EASY = "easy"
    NORMAL = "normal"
    HARD = "hard"
    EXTREME = "extreme"


class EdgeOutcome(Enum):
    """Result of an edge attempt."""

    SUCCESS = "success"
    FAIL = "fail"


class EdgingInitiator(Enum):
    """Who initiated the session."""

    SELF = "self"
    MEMBER = "member"
    SYSTEM = "system"
