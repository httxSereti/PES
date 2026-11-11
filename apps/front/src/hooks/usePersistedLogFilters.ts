import { useEffect, useState } from "react";

import { ALL_LOG_LEVELS, isLogLevel } from "@/lib/logs";
import type { LogLevel } from "@/types/logs.types";

const LEVELS_KEY = "pes.logs.levels";
const MUTED_KEY = "pes.logs.muted";

function readLevels(): Set<LogLevel> {
    if (typeof window === "undefined") return new Set(ALL_LOG_LEVELS);
    try {
        const raw = localStorage.getItem(LEVELS_KEY);
        if (!raw) return new Set(ALL_LOG_LEVELS);
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return new Set(ALL_LOG_LEVELS);
        return new Set(parsed.filter(isLogLevel));
    } catch {
        return new Set(ALL_LOG_LEVELS);
    }
}

function readMuted(): string[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(MUTED_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (value): value is string => typeof value === "string",
        );
    } catch {
        return [];
    }
}

/** Selected log levels, persisted across visits like qui's viewer. */
export function usePersistedLogLevels() {
    const [levels, setLevels] = useState<Set<LogLevel>>(readLevels);

    useEffect(() => {
        localStorage.setItem(LEVELS_KEY, JSON.stringify([...levels]));
    }, [levels]);

    return [levels, setLevels] as const;
}

/** Muted messages (click a log line's level badge to mute it). */
export function usePersistedLogExclusions() {
    const [muted, setMuted] = useState<string[]>(readMuted);

    useEffect(() => {
        localStorage.setItem(MUTED_KEY, JSON.stringify(muted));
    }, [muted]);

    return [muted, setMuted] as const;
}
