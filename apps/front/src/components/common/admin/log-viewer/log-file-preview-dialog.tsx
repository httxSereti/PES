import { useEffect, useMemo, useState } from "react";
import {
    AlertCircle,
    Download,
    FileArchive,
    FileText,
    Loader2,
    RefreshCw,
    Search,
    X,
} from "lucide-react";

import { Button } from "@pes/ui/components/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@pes/ui/components/dialog";
import { Input } from "@pes/ui/components/input";
import { Skeleton } from "@pes/ui/components/skeleton";
import { formatDateTime } from "@/lib/format-date";
import {
    formatBytes,
    formatLogTime,
    isCompressedLogFile,
    LEVEL_BADGE_COLORS,
    LEVEL_COLORS,
    parseLogLine,
    valueToText,
} from "@/lib/logs";
import type {
    LogFileEntry,
    ParsedLogEntry,
    RawLogLine,
} from "@/types/logs.types";

const API_URL = import.meta.env.VITE_API_URL;

/** Only the tail of a file is loaded so huge logs stay fast to preview. */
const PREVIEW_MAX_BYTES = 512 * 1024;
const PREVIEW_MAX_LINES = 2000;

function PreviewLogLine({ entry }: { entry: ParsedLogEntry }) {
    const extraKeys = Object.keys(entry.extra);

    return (
        <div className="flex gap-2 py-0.5 whitespace-nowrap hover:bg-muted/50">
            <span className="w-[62px] shrink-0 text-muted-foreground/60 tabular-nums">
                {formatLogTime(entry.time)}
            </span>
            <span
                className={`inline-flex h-4 w-12 shrink-0 items-center justify-center rounded text-[10px] font-medium uppercase ${LEVEL_BADGE_COLORS[entry.level]}`}
            >
                {entry.level}
            </span>
            <span className={LEVEL_COLORS[entry.level]}>{entry.message}</span>
            {extraKeys.map((key) => (
                <span key={key} className="ml-2 text-muted-foreground/50">
                    <span className="text-muted-foreground/70">{key}</span>
                    <span className="text-muted-foreground/40">=</span>
                    <span className="text-muted-foreground/60">
                        {valueToText(entry.extra[key])}
                    </span>
                </span>
            ))}
        </div>
    );
}

export function LogFilePreviewDialog({
    file,
    token,
    downloading,
    onClose,
    onDownload,
}: {
    file: LogFileEntry | null;
    token: string | null;
    downloading: boolean;
    onClose: () => void;
    onDownload: (file: LogFileEntry) => void;
}) {
    const [lines, setLines] = useState<RawLogLine[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [wasTrimmed, setWasTrimmed] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    const archive = file ? isCompressedLogFile(file.name) : false;

    useEffect(() => {
        if (!file || !token || isCompressedLogFile(file.name)) return;

        let cancelled = false;
        setLines(null);
        setError(null);
        setQuery("");
        setWasTrimmed(false);

        const load = async () => {
            try {
                const response = await fetch(
                    `${API_URL}/logs/files/${encodeURIComponent(file.name)}`,
                    {
                        cache: "no-store",
                        headers: { Authorization: `Bearer ${token}` },
                    },
                );
                if (!response.ok) {
                    throw new Error(`Failed to load file (${response.status})`);
                }

                const blob = await response.blob();
                const truncated = blob.size > PREVIEW_MAX_BYTES;
                let text = await (
                    truncated ? blob.slice(-PREVIEW_MAX_BYTES) : blob
                ).text();

                // Drop the partial first line left by the byte slice.
                if (truncated) {
                    const newlineIndex = text.indexOf("\n");
                    if (newlineIndex >= 0) {
                        text = text.slice(newlineIndex + 1);
                    }
                }

                if (cancelled) return;

                const rawLines = text
                    .split(/\r?\n/)
                    .filter((line) => line.trim().length > 0);
                const visible = rawLines.slice(-PREVIEW_MAX_LINES);

                setLines(
                    visible.map((line, index) => ({ id: index, text: line })),
                );
                setWasTrimmed(truncated || rawLines.length > PREVIEW_MAX_LINES);
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err instanceof Error ? err.message : "Network error",
                    );
                }
            }
        };

        void load();

        return () => {
            cancelled = true;
        };
    }, [file, token, reloadKey]);

    const entries = useMemo(() => (lines ?? []).map(parseLogLine), [lines]);

    const filteredEntries = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return entries;

        return entries.filter((entry) => {
            const matchesMessage = entry.message
                .toLowerCase()
                .includes(normalized);
            const matchesExtra = Object.values(entry.extra).some((value) =>
                valueToText(value).toLowerCase().includes(normalized),
            );
            return matchesMessage || matchesExtra;
        });
    }, [entries, query]);

    const reload = () => setReloadKey((value) => value + 1);

    return (
        <Dialog
            open={file !== null}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex min-w-0 items-center gap-2">
                        <span className="accent-tile flex size-7 shrink-0 items-center justify-center rounded-md">
                            {archive ? (
                                <FileArchive className="size-4 accent-tile-icon" />
                            ) : (
                                <FileText className="size-4 accent-tile-icon" />
                            )}
                        </span>
                        <span
                            className="truncate font-mono text-sm"
                            title={file?.name}
                        >
                            {file?.name}
                        </span>
                    </DialogTitle>
                    <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className="font-mono tabular-nums">
                            {formatBytes(file?.sizeBytes ?? 0)}
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <span>modified {formatDateTime(file?.modTime)}</span>
                        {wasTrimmed && (
                            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                tail only
                            </span>
                        )}
                    </DialogDescription>
                </DialogHeader>

                {!archive && (
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative min-w-0 flex-1">
                            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={query}
                                onChange={(event) =>
                                    setQuery(event.target.value)
                                }
                                placeholder="Filter lines…"
                                className="h-8 pr-8 pl-8 text-xs"
                            />
                            {query && (
                                <button
                                    type="button"
                                    onClick={() => setQuery("")}
                                    className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    aria-label="Clear filter"
                                >
                                    <X className="size-3.5" />
                                </button>
                            )}
                        </div>
                        <span className="font-mono text-[11px] text-muted-foreground/60">
                            {filteredEntries.length === entries.length
                                ? `${entries.length} lines`
                                : `${filteredEntries.length} of ${entries.length} lines`}
                        </span>
                    </div>
                )}

                <div className="h-[clamp(240px,52dvh,480px)] overflow-auto rounded-md border bg-muted/30 p-3">
                    {archive ? (
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                            <FileArchive className="size-6 text-muted-foreground/40" />
                            <p className="text-xs text-muted-foreground">
                                Compressed log files can’t be previewed.
                            </p>
                            <p className="text-[11px] text-muted-foreground/60">
                                Download the file to inspect its contents.
                            </p>
                        </div>
                    ) : error ? (
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                            <AlertCircle className="size-6 text-destructive/70" />
                            <p className="text-xs text-destructive">{error}</p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-1 h-8"
                                onClick={reload}
                            >
                                <RefreshCw className="size-3.5" />
                                Try again
                            </Button>
                        </div>
                    ) : lines === null ? (
                        <div className="space-y-2">
                            {Array.from({ length: 12 }).map((_, index) => (
                                <div
                                    key={index}
                                    className="flex items-center gap-2"
                                >
                                    <Skeleton className="h-3 w-[62px] shrink-0" />
                                    <Skeleton className="h-3 w-12 shrink-0" />
                                    <Skeleton
                                        className="h-3"
                                        style={{
                                            width: `${35 + ((index * 13) % 50)}%`,
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : filteredEntries.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground/60">
                            {entries.length === 0
                                ? "This file is empty."
                                : "No lines match the current filter."}
                        </div>
                    ) : (
                        <div className="w-fit min-w-full font-mono text-xs leading-relaxed">
                            {filteredEntries.map((entry) => (
                                <PreviewLogLine key={entry.id} entry={entry} />
                            ))}
                        </div>
                    )}
                </div>

                {wasTrimmed && !archive && (
                    <p className="-mt-1 text-[11px] text-muted-foreground/60">
                        Showing the tail of this file (up to{" "}
                        {PREVIEW_MAX_LINES.toLocaleString()} lines / 512 KB).
                        Download it to see the full log.
                    </p>
                )}

                <DialogFooter className="gap-2 sm:gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!file || downloading}
                        onClick={() => {
                            if (file) onDownload(file);
                        }}
                    >
                        {downloading ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <Download className="size-4" />
                        )}
                        Download
                    </Button>
                    <Button type="button" size="sm" onClick={onClose}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
