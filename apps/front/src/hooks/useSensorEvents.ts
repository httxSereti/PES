import { useMemo } from "react";

import { useAppSelector } from "@/store/hooks";
import type { TriggeredEvent } from "@/types";

export type SensorEventHistory = {
    /** Newest first, limited to the requested count. */
    events: TriggeredEvent[];
    /** Timestamp of the newest event for this sensor, if any. */
    latestAt: number | null;
    /** Newest timestamp per event type, e.g. sensor_move_alarm. */
    latestByType: Record<string, number>;
};

function eventTimestamp(event: TriggeredEvent): number {
    const timestamp = new Date(event.triggered_at).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * Sensor alarm events already arrive through the shared events feed. Filter
 * them by the backend origin (`sensor:<id>:<signal>`) so each card can show
 * its own recent activity without a new endpoint.
 */
export function useSensorEvents(
    sensorId: string,
    limit = 4,
): SensorEventHistory {
    const allEvents = useAppSelector((state) => state.events.events);

    return useMemo(() => {
        const originPrefix = `sensor:${sensorId}:`;
        const matching = allEvents
            .filter((event) => event.origin.startsWith(originPrefix))
            .sort((a, b) => eventTimestamp(b) - eventTimestamp(a));

        const latestByType: Record<string, number> = {};
        for (const event of matching) {
            if (latestByType[event.event_type] === undefined) {
                latestByType[event.event_type] = eventTimestamp(event);
            }
        }

        return {
            events: matching.slice(0, limit),
            latestAt: matching[0] ? eventTimestamp(matching[0]) : null,
            latestByType,
        };
    }, [allEvents, sensorId, limit]);
}
