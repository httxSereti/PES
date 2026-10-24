import type { TriggeredEvent } from "@/types";
import { cn } from "@pes/ui/lib/utils";
import type { FC } from "react";

import { SectionHeading } from "@/components/common/sensors/common/section-heading";

const EVENT_LABELS: Record<string, string> = {
    sensor_sound_alarm: "Sound alarm",
    sensor_move_alarm: "Movement alarm",
    sensor_position_alarm: "Position alarm",
};

type SensorRecentProps = {
    events: TriggeredEvent[];
    color: string;
    live?: boolean;
    className?: string;
};

function eventLabel(event: TriggeredEvent): string {
    return (
        EVENT_LABELS[event.event_type] ?? event.event_type.replaceAll("_", " ")
    );
}

function eventTime(event: TriggeredEvent): string {
    const date = new Date(event.triggered_at);
    if (Number.isNaN(date.getTime())) return "--:--";

    return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

export const SensorRecent: FC<SensorRecentProps> = ({
    events,
    color,
    live = true,
    className,
}) => (
    <div className={cn("flex flex-col gap-1.5", className)}>
        <SectionHeading
            label="Recent"
            meta={
                events.length > 0
                    ? `${events.length} event${events.length === 1 ? "" : "s"}`
                    : live
                      ? "listening"
                      : "idle"
            }
        />

        {events.length === 0 ? (
            <div className="flex items-center gap-2 py-0.5 font-mono text-[9px] text-muted-foreground/40">
                <span className="size-1 rounded-full bg-muted-foreground/30" />
                No recent alarms
            </div>
        ) : (
            events.map((event) => (
                <div
                    key={event.id}
                    className="flex min-w-0 items-center gap-2 font-mono text-[9px]"
                >
                    <span className="w-8 shrink-0 text-muted-foreground/40 tabular-nums">
                        {eventTime(event)}
                    </span>
                    <span
                        aria-hidden="true"
                        className="size-1 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                    />
                    <span className="min-w-0 truncate text-muted-foreground/70">
                        {eventLabel(event)}
                    </span>
                </div>
            ))
        )}
    </div>
);
