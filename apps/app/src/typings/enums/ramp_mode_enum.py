from enum import Enum


class RampMode(str, Enum):
    """Shape of one ramp cycle."""

    RESET = "reset"  # start% -> 100%, reset to start% and repeat (sawtooth)
    WAVE = "wave"  # start% -> 100% -> start% and repeat (triangle)
    ASCEND = "ascend"  # start% -> 100% then hold at the max value
    SQUARE = "square"  # start% <-> 100% every step (on/off)
    DRIFT = "drift"  # random walk between start% and 100%
    SURGE = "surge"  # climb at step, descend at step * release
    DWELL = "dwell"  # wave with a dwell at both ends
