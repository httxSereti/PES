from enum import Enum


class RampMode(str, Enum):
    """Shape of one ramp cycle."""

    RESET = "reset"  # 0% -> 100%, reset to 0% and repeat (sawtooth)
    WAVE = "wave"  # 0% -> 100% -> 0% and repeat (triangle)
