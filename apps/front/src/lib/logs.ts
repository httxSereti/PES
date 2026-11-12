import type { LogLevel, ParsedLogEntry, RawLogLine } from "@/types/logs.types";

export const ALL_LOG_LEVELS: LogLevel[] = [
    "trace",
    "debug",
    "info",
    "warn",
    "error",
];

export const ALL_LEVELS_SET = new Set<LogLevel>(ALL_LOG_LEVELS);

export const LEVEL_COLORS: Record<LogLevel, string> = {
    trace: "text-muted-foreground",
    debug: "text-blue-600 dark:text-blue-400",
    info: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    error: "text-red-600 dark:text-red-400",
};

export const LEVEL_BADGE_COLORS: Record<LogLevel, string> = {
    trace: "bg-muted text-muted-foreground",
    debug: "bg-blue-500/15 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
    info: "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
    warn: "bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
    error: "bg-red-500/15 text-red-600 dark:bg-red-500/20 dark:text-red-400",
};

const RESERVED_LOG_KEYS = new Set([
    "level",
    "time",
    "timestamp",
    "event",
    "message",
]);

export function isLogLevel(value: unknown): value is LogLevel {
    return typeof value === "string" && ALL_LEVELS_SET.has(value as LogLevel);
}

function normalizeLevel(raw: string | undefined): LogLevel {
    const level = raw?.trim().toLowerCase();
    if (level === "warning") return "warn";
    if (
        level === "fatal" ||
        level === "critical" ||
        level === "panic" ||
        level === "exception"
    ) {
        return "error";
    }
    return isLogLevel(level) ? level : "info";
}

export function parseLogLine(entry: RawLogLine): ParsedLogEntry {
    try {
        const parsed = JSON.parse(entry.text) as Record<string, unknown>;
        const timeValue = parsed.timestamp ?? parsed.time;
        const messageValue = parsed.event ?? parsed.message;
        const extra = Object.fromEntries(
            Object.entries(parsed).filter(
                ([key]) => !RESERVED_LOG_KEYS.has(key),
            ),
        );

        return {
            id: entry.id,
            level: normalizeLevel(
                typeof parsed.level === "string" ? parsed.level : undefined,
            ),
            time: typeof timeValue === "string" ? timeValue : "",
            message:
                typeof messageValue === "string"
                    ? messageValue
                    : messageValue == null
                      ? ""
                      : valueToText(messageValue),
            extra,
            raw: entry.text,
            isJson: true,
        };
    } catch {
        // Plain-text lines still render (e.g. output from a foreign writer).
        return {
            id: entry.id,
            level: "info",
            time: "",
            message: entry.text,
            extra: {},
            raw: entry.text,
            isJson: false,
        };
    }
}

export function valueToText(value: unknown): string {
    if (typeof value === "string") return value;
    return JSON.stringify(value) ?? String(value);
}

export function formatLogTime(value: string): string {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("fr-FR", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

export function isCompressedLogFile(name: string): boolean {
    return name.toLowerCase().endsWith(".gz");
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const exponent = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1,
    );
    const value = bytes / 1024 ** exponent;
    return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function entryToJson(entry: ParsedLogEntry): string {
    return JSON.stringify(
        {
            level: entry.level,
            time: entry.time,
            message: entry.message,
            ...entry.extra,
        },
        null,
        2,
    );
}
