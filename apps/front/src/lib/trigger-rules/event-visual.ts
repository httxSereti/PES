import {
    Activity,
    Clock,
    Compass,
    Disc3,
    Lock,
    LockOpen,
    Move,
    ScanEye,
    Sparkles,
    Volume2,
    Vote,
    type LucideIcon,
} from "lucide-react";
import type { EventTone } from "./describe-event";

/** Best-effort icon per event family, used by the stream and the inspector. */
export function eventIcon(eventType: string): LucideIcon {
    if (eventType.startsWith("custom:wof_")) return Sparkles;
    if (eventType === "chaster_wof_turned") return Disc3;
    if (eventType.includes("pillory") || eventType.includes("vote_")) return Vote;
    if (eventType.includes("time_")) return Clock;
    if (eventType === "chaster_lock_frozen") return Lock;
    if (eventType === "chaster_lock_unfrozen") return LockOpen;
    if (eventType.startsWith("puryfi_")) return ScanEye;
    if (eventType === "sensor_sound_alarm") return Volume2;
    if (eventType === "sensor_move_alarm") return Move;
    if (eventType === "sensor_position_alarm") return Compass;
    return Activity;
}

/** Tinted tile behind the event icon, by source family. */
export const TONE_TILE: Record<EventTone, string> = {
    violet: "border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-300",
    teal: "border-teal-500/25 bg-teal-500/10 text-teal-600 dark:text-teal-300",
    pink: "border-pink-500/25 bg-pink-500/10 text-pink-600 dark:text-pink-300",
    slate: "border-border bg-muted/40 text-muted-foreground",
};

/** Very subtle wash at the top of the inspector, by source family. */
export const TONE_GRADIENT: Record<EventTone, string> = {
    violet: "from-violet-500/[0.07]",
    teal: "from-teal-500/[0.06]",
    pink: "from-pink-500/[0.06]",
    slate: "from-muted/40",
};
