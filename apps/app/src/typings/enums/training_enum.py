from enum import Enum


class EdgingSessionStatus(Enum):
    """Lifecycle of an edging training session."""

    CONFIGURED = "configured"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    # The process stopped while the session was running (crash/restart).
    INTERRUPTED = "interrupted"


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


class EdgingNotificationLevel(Enum):
    """How many training notifications a session sends to its recipients."""

    ALL = "all"  # every lifecycle event, including pause/resume
    EDGES = "edges"  # edges, goals and the final outcome
    FAILURES = "failures"  # failed sessions only
    SUMMARY = "summary"  # only the end-of-session message
    NONE = "none"
