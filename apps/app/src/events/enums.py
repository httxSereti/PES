from enum import Enum


class ActionType(str, Enum):
    """Types of actions that can be triggered by events."""

    PROFILE = "PROFILE"
    LEVEL = "LEVEL"
    MULT = "MULT"
    CHASTER_TIME_UPDATE = "CHASTER_TIME_UPDATE"

    # PuryFi (browser blocker)
    PURYFI_SET_ENABLED = "PURYFI_SET_ENABLED"
    PURYFI_SET_LOCK = "PURYFI_SET_LOCK"
    PURYFI_SET_LOCK_TIMER = "PURYFI_SET_LOCK_TIMER"
    PURYFI_ENTER_LOCK_PASSWORD = "PURYFI_ENTER_LOCK_PASSWORD"
    PURYFI_EMERGENCY_UNLOCK = "PURYFI_EMERGENCY_UNLOCK"
    PURYFI_UPDATE_WBLIST = "PURYFI_UPDATE_WBLIST"

    # Training / edging session control
    TRAINING_START = "TRAINING_START"
    TRAINING_PAUSE = "TRAINING_PAUSE"
    TRAINING_RESUME = "TRAINING_RESUME"
    TRAINING_END = "TRAINING_END"
    TRAINING_NEXT_PROGRAM_STEP = "TRAINING_NEXT_PROGRAM_STEP"
    TRAINING_RECORD_EDGE = "TRAINING_RECORD_EDGE"
    TRAINING_STOP_AND_NEUTRALIZE = "TRAINING_STOP_AND_NEUTRALIZE"

    # Lovense / Buttplug devices
    LOVENSE_SET = "LOVENSE_SET"
    LOVENSE_PULSE = "LOVENSE_PULSE"
    LOVENSE_STOP = "LOVENSE_STOP"
    LOVENSE_PATTERN_PLAY = "LOVENSE_PATTERN_PLAY"
    LOVENSE_PATTERN_STOP = "LOVENSE_PATTERN_STOP"
    LOVENSE_RANDOM_PATTERN = "LOVENSE_RANDOM_PATTERN"
    LOVENSE_SCAN = "LOVENSE_SCAN"
    LOVENSE_SET_CAP = "LOVENSE_SET_CAP"
    LOVENSE_ASSIGN = "LOVENSE_ASSIGN"
    LOVENSE_RECONNECT = "LOVENSE_RECONNECT"


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
    SENSOR_SOUND_ALARM = "sensor_sound_alarm"
    SENSOR_POSITION_ALARM = "sensor_position_alarm"
    SENSOR_MOVE_ALARM = "sensor_move_alarm"

    # Training / edging
    TRAINING_SESSION_STARTED = "training_session_started"
    TRAINING_EDGE_RECORDED = "training_edge_recorded"
    TRAINING_GOAL_REACHED = "training_goal_reached"
    TRAINING_SESSION_PAUSED = "training_session_paused"
    TRAINING_SESSION_RESUMED = "training_session_resumed"
    TRAINING_SESSION_SUCCEEDED = "training_session_succeeded"
    TRAINING_SESSION_FAILED = "training_session_failed"
    TRAINING_SESSION_CANCELLED = "training_session_cancelled"
    TRAINING_PROGRAM_COMPLETED = "training_program_completed"

    # Lovense / Buttplug devices
    LOVENSE_NODE_ONLINE = "lovense_node_online"
    LOVENSE_NODE_OFFLINE = "lovense_node_offline"
    LOVENSE_DEVICE_CONNECTED = "lovense_device_connected"
    LOVENSE_DEVICE_DISCONNECTED = "lovense_device_disconnected"
    LOVENSE_BATTERY_LOW = "lovense_battery_low"
    LOVENSE_BATTERY_CHARGED = "lovense_battery_charged"
    LOVENSE_PATTERN_STARTED = "lovense_pattern_started"
    LOVENSE_PATTERN_COMPLETED = "lovense_pattern_completed"
    LOVENSE_PATTERN_STOPPED = "lovense_pattern_stopped"
    LOVENSE_OUTPUT_LIMITED = "lovense_output_limited"
    LOVENSE_MANUAL_RELEASED = "lovense_manual_released"
    LOVENSE_SCAN_FINISHED = "lovense_scan_finished"
    LOVENSE_DEVICE_ERROR = "lovense_device_error"
    LOVENSE_NODE_LATENCY_HIGH = "lovense_node_latency_high"
