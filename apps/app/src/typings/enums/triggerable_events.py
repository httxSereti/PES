from enum import Enum

class TriggerableEvent(Enum):
    """
        Chaster Events
    """
    # Pillory Extension
    CHASTER_PILLORY_VOTE = "chaster_pillory_vote",
    CHASTER_PILLORY_STARTED = "chaster_pillory_started",
    CHASTER_PILLORY_ENDED = "chaster_pillory_ended",
    
    # Shared Link vote add/sub
    CHASTER_VOTE_ADD = "chaster_vote_add",
    CHASTER_VOTE_SUB = "chaster_vote_sub",
    
    # User/Kh add/sub
    CHASTER_TIME_ADD = "chaster_time_add",
    CHASTER_TIME_SUB = "chaster_time_sub",
    
    # Wheel Of Fortune Extension
    CHASTER_WOF_TURNED = "chaster_wof_turned",
    
    """
        Sensors Events
    """
    SENSOR_SOUND_ALARM = "sensor_sound_alarm",
    SENSOR_POSITION_ALARM = "sensor_position_alarm",
    SENSOR_MOVE_ALARM = "sensor_move_alarm",
    
    """
        # TODO: X/Twitter Events
        WIP, release date; TBA
    """
    
    # TWITTER_RETWEET = "twitter_ReTweet",
    # TWITTER_FAVORITE = "twitter_Favorite",
    # TWITTER_FOLLOW = "twitter_Follow"