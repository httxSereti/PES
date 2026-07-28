"""
Software ramp for channel levels (currently not implemented).

Design notes from the original ramp thread (removed in `ref(ramp)`):
- Use new vars max/min/cycle/back_to_min
- max = current set for level
- min = % of max, if 100% -> no ramp
- cycle = duration in sec of for min->max
- back_to_min = bool if decrease after max to min or restart from min
- task with 0,5 cycle for calc new value for each channel
"""
