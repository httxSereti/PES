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


class RampEndAction(str, Enum):
    """What happens to the field when a ramp finishes or is stopped."""

    HOLD_PEAK = "hold_peak"  # keep the ramp's max value (legacy behaviour)
    HOLD_CURRENT = "hold_current"  # keep the level the ramp last wrote
    RESTORE_START = "restore_start"  # return to the ramp's start level
    SET_LEVEL = "set_level"  # go to an explicit end_value (capped at max)
