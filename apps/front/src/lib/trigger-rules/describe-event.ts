import type { TriggeredEvent } from "@/store/slices/eventsSlice";

export type EventTone = "violet" | "pink" | "teal" | "slate";

export interface DescribedEvent {
    /** Human sentence used as the stream title and inspector heading. */
    title: string;
    /** Optional secondary line (author, amount, threshold, ...). */
    detail: string | null;
}

const TYPE_PREFIXES = new Set(["chaster", "puryfi", "sensor", "sensors", "unit", "units", "custom"]);

/** "chaster_pillory_vote" → "Pillory vote", "puryfi_detected_female_breast" → "Detected female breast". */
export function humanizeEventType(type: string): string {
    const base = type.includes(":") ? (type.split(":").pop() ?? type) : type;
    const parts = base.split("_").filter(Boolean);
    const first = parts[0];
    if (parts.length > 1 && first && TYPE_PREFIXES.has(first)) parts.shift();
    const label = parts.join(" ");
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function str(value: unknown): string | null {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function num(value: unknown): number | null {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

/** "45s", "12 min", "1h 20m" — used for event payload durations. */
export function formatEventSpan(seconds: number): string {
    const abs = Math.abs(seconds);
    if (abs < 60) return `${Math.round(abs)}s`;

    const minutes = Math.round(abs / 60);
    if (minutes < 60) return `${minutes} min`;

    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function signedSpan(seconds: number): string {
    return `${seconds > 0 ? "+" : "−"}${formatEventSpan(seconds)}`;
}

/** Picks a couple of primitive payload entries for the fallback detail line. */
function summarizeData(data: Record<string, unknown>): string | null {
    const skipped = new Set(["triggeredAt", "triggered_at", "event_id", "id"]);
    const parts: string[] = [];

    for (const [key, value] of Object.entries(data ?? {})) {
        if (skipped.has(key)) continue;
        if (typeof value === "string" && value.trim() !== "") {
            parts.push(`${key} ${value.trim()}`);
        } else if (typeof value === "number" && Number.isFinite(value)) {
            parts.push(`${key} ${value}`);
        } else if (typeof value === "boolean") {
            parts.push(`${key} ${value ? "yes" : "no"}`);
        }
        if (parts.length === 2) break;
    }

    return parts.length > 0 ? parts.join(" · ") : null;
}

const SENSOR_TITLES: Record<string, string> = {
    sound: "Sound alarm",
    move: "Movement alarm",
    position: "Position alarm",
};

function describeSensor(eventType: string, origin: string): DescribedEvent {
    const sensor = origin.split(":")[1] ?? null;
    const measure = eventType.replace(/^sensor_/, "").replace(/_alarm$/, "");
    const title = SENSOR_TITLES[measure] ?? humanizeEventType(eventType);

    return {
        title: sensor ? `${title} · ${sensor}` : title,
        detail: "No payload — thresholds are configured on the sensor",
    };
}

function describeChaster(eventType: string, data: Record<string, unknown>): DescribedEvent {
    const author = str(data.author) ?? str(data.username);
    const duration = num(data.duration);

    switch (eventType) {
        case "chaster_pillory_vote": {
            const votes = num(data.votes) ?? num(data.vote);
            return {
                title: author ? `Pillory vote from ${author}` : "Pillory vote",
                detail: votes !== null ? `${votes} votes` : null,
            };
        }

        case "chaster_pillory_started":
            return {
                title: "Pillory started",
                detail: duration !== null ? formatEventSpan(duration) : null,
            };

        case "chaster_pillory_ended":
            return {
                title: "Pillory ended",
                detail: duration !== null ? formatEventSpan(duration) : null,
            };

        case "chaster_vote_add":
            return {
                title: author ? `${author} added a vote` : "Vote added",
                detail: duration !== null ? signedSpan(duration) : null,
            };

        case "chaster_vote_sub":
            return {
                title: author ? `${author} removed a vote` : "Vote removed",
                detail: duration !== null ? signedSpan(duration) : null,
            };

        case "chaster_time_add":
            return {
                title: author ? `${author} added time` : "Time added",
                detail: duration !== null ? signedSpan(duration) : null,
            };

        case "chaster_time_sub":
            return {
                title: author ? `${author} removed time` : "Time removed",
                detail: duration !== null ? signedSpan(duration) : null,
            };

        case "chaster_lock_frozen":
            return { title: "Lock frozen", detail: "Chaster lock is on hold" };

        case "chaster_lock_unfrozen":
            return { title: "Lock unfrozen", detail: "Chaster lock resumed" };

        case "chaster_wof_turned": {
            const text = str(data.wofText);
            const segment = str(data.segmentType);
            return {
                title: text ? `Wheel: ${text}` : "Wheel of Fortune turned",
                detail: segment ? `segment ${segment}` : null,
            };
        }

        default:
            break;
    }

    if (eventType.startsWith("custom:wof_profile_")) {
        const action = str(data.wofAction) ?? eventType.split(":").pop() ?? "";
        return {
            title: `Wheel profile action${action ? ` · ${action}` : ""}`,
            detail: str(data.wofText),
        };
    }

    if (eventType.startsWith("custom:wof_unit_")) {
        const action = str(data.wofAction) ?? eventType.split(":").pop() ?? "";
        return {
            title: `Wheel unit action${action ? ` · ${action}` : ""}`,
            detail: str(data.wofText),
        };
    }

    return { title: humanizeEventType(eventType), detail: summarizeData(data) };
}

function describePuryfi(eventType: string, data: Record<string, unknown>): DescribedEvent {
    const label = str(data.label);
    const count = num(data.count);

    return {
        title: label ? `${label} detected` : humanizeEventType(eventType),
        detail: count !== null ? `${count} object${count === 1 ? "" : "s"}` : null,
    };
}

/**
 * Single source of truth for how a triggered event reads in the UI.
 * Kept React-free so the console, the stream and notifications can share it.
 */
export function describeEvent(event: Pick<TriggeredEvent, "event_type" | "origin" | "event_data">): DescribedEvent {
    const data = event.event_data ?? {};

    if (event.event_type.startsWith("sensor_")) {
        return describeSensor(event.event_type, event.origin);
    }

    if (event.event_type.startsWith("puryfi_")) {
        return describePuryfi(event.event_type, data);
    }

    if (event.event_type.startsWith("chaster_") || event.event_type.startsWith("custom:wof_")) {
        return describeChaster(event.event_type, data);
    }

    return {
        title: humanizeEventType(event.event_type),
        detail: summarizeData(data),
    };
}

/** Colour family of the event source, used by the stream status dot. */
export function eventTone(eventType: string, origin: string): EventTone {
    if (eventType.startsWith("puryfi_") || origin.startsWith("puryfi:")) return "pink";
    if (eventType.startsWith("sensor_") || origin.startsWith("sensor:")) return "teal";
    if (eventType.startsWith("chaster_") || origin.startsWith("chaster:")) return "violet";
    return "slate";
}
