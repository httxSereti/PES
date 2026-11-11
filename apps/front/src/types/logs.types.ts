export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

/** One raw SSE message, numbered client-side to keep React keys stable. */
export interface RawLogLine {
    id: number;
    text: string;
}

export interface ParsedLogEntry {
    id: number;
    level: LogLevel;
    time: string;
    message: string;
    extra: Record<string, unknown>;
    raw: string;
    isJson: boolean;
}

export interface LogFileEntry {
    name: string;
    sizeBytes: number;
    modTime: string;
}

export interface LogSettings {
    level: string;
    logDir: string;
}
