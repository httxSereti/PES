from enum import Enum


class RampMode(str, Enum):
    """Shape of one ramp cycle."""

    RESET = "reset"  # start% -> 100%, reset to start% and repeat (sawtooth)
    WAVE = "wave"  # start% -> 100% -> start% and repeat (triangle)
    ASCEND = "ascend"  # start% -> 100% then hold at the max value
