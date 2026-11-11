import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AlertCircle,
    Check,
    ChevronDown,
    Filter,
    Search,
    X,
} from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { Input } from "@pes/ui/components/input";
import { Label } from "@pes/ui/components/label";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@pes/ui/components/popover";
import { Switch } from "@pes/ui/components/switch";
import {
    ALL_LOG_LEVELS,
    formatLogTime,
    LEVEL_BADGE_COLORS,
    LEVEL_COLORS,
    parseLogLine,
    valueToText,
} from "@/lib/logs";
import {
    usePersistedLogExclusions,
    usePersistedLogLevels,
} from "@/hooks/usePersistedLogFilters";
import { useAppSelector } from "@/store/hooks";
import type { LogLevel, ParsedLogEntry, RawLogLine } from "@/types/logs.types";
import { LogEntryDialog } from "./log-entry-dialog";

const API_URL = import.meta.env.VITE_API_URL;

// Soft cap while following live; hard cap when the user scrolls/pauses.
const LOG_SOFT_CAP = 1000;
const LOG_HARD_CAP = 10000;
const HISTORY_LIMIT = 1000;

function LogLine({
    entry,
    onSelect,
    onMute,
}: {
    entry: ParsedLogEntry;
    onSelect: () => void;
    onMute: () => void;
}) {
    const extraKeys = Object.keys(entry.extra);
    const clickable = entry.isJson;

    const handleMute = (event: React.MouseEvent) => {
        event.stopPropagation();
        onMute();
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (clickable && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            onSelect();
        }
    };

    return (
        <div
            className={`group flex gap-2 py-0.5 whitespace-nowrap hover:bg-muted/50 ${
                clickable
                    ? "cursor-pointer focus:bg-muted/50 focus:outline-none"
                    : ""
            }`}
            onClick={clickable ? onSelect : undefined}
            onKeyDown={handleKeyDown}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
        >
            <span className="w-[62px] shrink-0 tabular-nums text-muted-foreground/60">
                {formatLogTime(entry.time)}
            </span>
            <button
                type="button"
                onClick={handleMute}
                title="Mute similar entries"
                className={`group/mute inline-flex h-4 w-12 shrink-0 cursor-pointer items-center justify-center rounded text-[10px] font-medium uppercase ${LEVEL_BADGE_COLORS[entry.level]}`}
            >
                <span className="group-hover/mute:hidden">{entry.level}</span>
                <X className="hidden size-2.5 group-hover/mute:block" />
            </button>
            <span className={LEVEL_COLORS[entry.level]}>{entry.message}</span>
            {extraKeys.length > 0 && (
                <span className="text-muted-foreground/50">
                    {extraKeys.map((key) => (
                        <span key={key} className="ml-2">
                            <span className="text-muted-foreground/70">
                                {key}
                            </span>
                            <span className="text-muted-foreground/40">=</span>
                            <span className="text-muted-foreground/60">
                                {valueToText(entry.extra[key])}
                            </span>
                        </span>
                    ))}
                </span>
            )}
        </div>
    );
}

export function LiveLogViewer() {
    const token = useAppSelector((state) => state.auth.token);
    const [lines, setLines] = useState<RawLogLine[]>([]);
    const [autoScroll, setAutoScroll] = useState(true);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedLevels, setSelectedLevels] = usePersistedLogLevels();
    const [muted, setMuted] = usePersistedLogExclusions();
    const [searchQuery, setSearchQuery] = useState("");
    const [droppedWhilePaused, setDroppedWhilePaused] = useState(false);
    const [selectedEntry, setSelectedEntry] = useState<ParsedLogEntry | null>(
        null,
    );

    const scrollRef = useRef<HTMLDivElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<number | null>(null);
    const nextIdRef = useRef(0);
    const autoScrollRef = useRef(autoScroll);
    const droppedRef = useRef(false);

    useEffect(() => {
        autoScrollRef.current = autoScroll;
        if (autoScroll) {
            setDroppedWhilePaused(false);
            droppedRef.current = false;
            setLines((prev) =>
                prev.length > LOG_SOFT_CAP ? prev.slice(-LOG_SOFT_CAP) : prev,
            );
        }
    }, [autoScroll]);

    const connect = useCallback(() => {
        if (!token) return;

        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }
        if (reconnectTimeoutRef.current !== null) {
            window.clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        setError(null);
        const url = `${API_URL}/logs/stream?limit=${HISTORY_LIMIT}&token=${encodeURIComponent(token)}`;
        const eventSource = new EventSource(url);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
            setIsConnected(true);
            setError(null);
        };

        eventSource.onmessage = (event) => {
            const newEntry: RawLogLine = {
                id: nextIdRef.current++,
                text: event.data as string,
            };

            setLines((prev) => {
                const next = [...prev, newEntry];
                if (autoScrollRef.current && next.length > LOG_SOFT_CAP) {
                    return next.slice(-LOG_SOFT_CAP);
                }
                if (next.length > LOG_HARD_CAP) {
                    droppedRef.current = true;
                    return next.slice(-LOG_HARD_CAP);
                }
                return next;
            });

            if (droppedRef.current) {
                setDroppedWhilePaused(true);
            }
        };

        eventSource.onerror = () => {
            setIsConnected(false);
            setError("Connection lost. Reconnecting…");
            eventSource.close();
            if (reconnectTimeoutRef.current === null) {
                reconnectTimeoutRef.current = window.setTimeout(() => {
                    reconnectTimeoutRef.current = null;
                    connect();
                }, 3000);
            }
        };
    }, [token]);

    useEffect(() => {
        connect();
        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            if (reconnectTimeoutRef.current !== null) {
                window.clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
        };
    }, [connect]);

    // Parse once per batch; filters/search below re-use the parsed entries.
    const parsedEntries = useMemo(() => lines.map(parseLogLine), [lines]);

    const filteredEntries = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();

        return parsedEntries.filter((entry) => {
            if (!selectedLevels.has(entry.level)) return false;
            if (muted.includes(entry.message)) return false;

            if (query) {
                const matchesMessage = entry.message
                    .toLowerCase()
                    .includes(query);
                const matchesExtra = Object.values(entry.extra).some((value) =>
                    valueToText(value).toLowerCase().includes(query),
                );
                if (!matchesMessage && !matchesExtra) return false;
            }

            return true;
        });
    }, [parsedEntries, selectedLevels, muted, searchQuery]);

    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [filteredEntries, autoScroll]);

    const toggleLevel = (level: LogLevel) => {
        setSelectedLevels((prev) => {
            const next = new Set(prev);
            if (next.has(level)) next.delete(level);
            else next.add(level);
            return next;
        });
    };

    const selectAllLevels = () => setSelectedLevels(new Set(ALL_LOG_LEVELS));
    const selectNoLevels = () => setSelectedLevels(new Set());

    const muteMessage = (message: string) => {
        if (!message || muted.includes(message)) return;
        setMuted([...muted, message]);
    };

    const unmuteMessage = (message: string) => {
        setMuted(muted.filter((value) => value !== message));
    };

    const levelFilterLabel =
        selectedLevels.size === ALL_LOG_LEVELS.length
            ? "All levels"
            : selectedLevels.size === 0
              ? "No levels"
              : `${selectedLevels.size} levels`;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <div
                        className={`h-2 w-2 rounded-full ${
                            isConnected ? "bg-emerald-500" : "bg-red-500"
                        }`}
                    />
                    <span className="text-sm text-muted-foreground">
                        {isConnected ? "Connected" : "Disconnected"}
                    </span>
                    {error && (
                        <span className="flex items-center gap-1 text-sm text-amber-500">
                            <AlertCircle className="size-3" />
                            {error}
                        </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Search logs…"
                            value={searchQuery}
                            onChange={(event) =>
                                setSearchQuery(event.target.value)
                            }
                            className="h-8 w-44 pl-7 pr-7 text-xs"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <X className="size-3.5" />
                            </button>
                        )}
                    </div>

                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1"
                            >
                                <Filter className="size-3.5" />
                                <span className="text-xs">
                                    {levelFilterLabel}
                                </span>
                                <ChevronDown className="size-3.5 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-44 p-2" align="start">
                            <div className="mb-2 flex justify-between">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={selectAllLevels}
                                >
                                    All
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={selectNoLevels}
                                >
                                    None
                                </Button>
                            </div>
                            <div className="space-y-1">
                                {ALL_LOG_LEVELS.map((level) => {
                                    const active = selectedLevels.has(level);
                                    return (
                                        <button
                                            key={level}
                                            type="button"
                                            onClick={() => toggleLevel(level)}
                                            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-muted"
                                        >
                                            <span
                                                className={`flex size-3.5 shrink-0 items-center justify-center rounded-sm border ${
                                                    active
                                                        ? "border-violet-500 bg-violet-500 text-white"
                                                        : "border-muted-foreground/30"
                                                }`}
                                            >
                                                {active && (
                                                    <Check className="size-2.5" />
                                                )}
                                            </span>
                                            <span
                                                className={`rounded px-1.5 py-0.5 text-xs font-medium uppercase ${LEVEL_BADGE_COLORS[level]}`}
                                            >
                                                {level}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </PopoverContent>
                    </Popover>

                    {muted.length > 0 && (
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1"
                                >
                                    <span className="text-xs">
                                        {muted.length} muted
                                    </span>
                                    <ChevronDown className="size-3.5 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-72 p-2" align="start">
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-xs font-medium">
                                        Muted messages
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-xs"
                                        onClick={() => setMuted([])}
                                    >
                                        Clear all
                                    </Button>
                                </div>
                                <div className="max-h-48 space-y-1 overflow-auto">
                                    {muted.map((message) => (
                                        <div
                                            key={message}
                                            className="group flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted"
                                        >
                                            <span
                                                className="truncate text-xs"
                                                title={message}
                                            >
                                                {message}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    unmuteMessage(message)
                                                }
                                                className="shrink-0 text-muted-foreground hover:text-foreground"
                                            >
                                                <X className="size-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                    )}

                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => setLines([])}
                    >
                        Clear
                    </Button>

                    <div className="flex items-center gap-2">
                        <Label htmlFor="log-autoscroll" className="text-sm">
                            Auto-scroll
                        </Label>
                        <Switch
                            id="log-autoscroll"
                            checked={autoScroll}
                            onCheckedChange={setAutoScroll}
                        />
                    </div>
                </div>
            </div>

            <div
                ref={scrollRef}
                className="h-[clamp(300px,calc(100dvh-24rem),600px)] overflow-auto rounded-md border bg-muted/30 p-3"
                style={{ overflowAnchor: "none" }}
            >
                <div className="w-fit min-w-full font-mono text-xs leading-relaxed">
                    {filteredEntries.length > 0 ? (
                        filteredEntries.map((entry) => (
                            <LogLine
                                key={entry.id}
                                entry={entry}
                                onSelect={() => setSelectedEntry(entry)}
                                onMute={() => muteMessage(entry.message)}
                            />
                        ))
                    ) : (
                        <span className="text-muted-foreground">
                            {lines.length > 0
                                ? "No entries match the current filters."
                                : "Waiting for log output…"}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                    Showing {filteredEntries.length} of {lines.length} lines
                </span>
                <span className="text-muted-foreground/40">·</span>
                <span>
                    buffer{" "}
                    {autoScroll
                        ? LOG_SOFT_CAP.toLocaleString()
                        : LOG_HARD_CAP.toLocaleString()}
                </span>
                {droppedWhilePaused && (
                    <span className="text-amber-500">oldest entries dropped</span>
                )}
            </div>

            <LogEntryDialog
                entry={selectedEntry}
                onClose={() => setSelectedEntry(null)}
            />
        </div>
    );
}
