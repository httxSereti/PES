export type EventGroupDef = { label: string; types: string[] };

export const EVENT_GROUPS: Record<string, EventGroupDef> = {
    chaster: {
        label: "Chaster",
        types: [
            "chaster_pillory_vote",
            "chaster_pillory_started",
            "chaster_pillory_ended",
            "chaster_vote_add",
            "chaster_vote_sub",
            "chaster_time_add",
            "chaster_time_sub",
            "chaster_wof_turned",
        ],
    },
    sensor: {
        label: "Sensor",
        types: [
            "sensor_sound_alarm",
            "sensor_position_alarm",
            "sensor_move_alarm",
        ],
    },
};

export const ALL_KNOWN_TYPES = new Set(
    Object.values(EVENT_GROUPS).flatMap(g => g.types)
);

/** Returns the group key for a given event type, or null. */
export function getEventGroup(eventType: string): string | null {
    for (const [key, g] of Object.entries(EVENT_GROUPS)) {
        if (g.types.includes(eventType)) return key;
    }
    return null;
}

/** Static map of groupKey → type list (module-level, no re-computation). */
export const STATIC_GROUPED: Record<string, string[]> = Object.fromEntries(
    Object.entries(EVENT_GROUPS).map(([key, g]) => [key, g.types])
);
