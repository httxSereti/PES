import { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertCircle,
    Download,
    Eye,
    FileArchive,
    FileText,
    FolderOpen,
    Loader2,
    RefreshCw,
    Search,
    X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@pes/ui/components/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@pes/ui/components/card";
import { Input } from "@pes/ui/components/input";
import { Skeleton } from "@pes/ui/components/skeleton";
import { cn } from "@pes/ui/lib/utils";
import { formatDateTime, formatRelativeTime } from "@/lib/format-date";
import { formatBytes, isCompressedLogFile } from "@/lib/logs";
import { useAppSelector } from "@/store/hooks";
import type { LogFileEntry } from "@/types/logs.types";
import { LogFilePreviewDialog } from "./log-file-preview-dialog";

const API_URL = import.meta.env.VITE_API_URL;

interface LogFileGroup {
    key: string;
    label: string;
    files: LogFileEntry[];
    totalBytes: number;
}

function startOfDay(date: Date): number {
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
    ).getTime();
}

function dayKey(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "unknown";
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown date";

    const today = new Date();
    const diffDays = Math.round(
        (startOfDay(today) - startOfDay(date)) / 86_400_000,
    );

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";

    return date.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year:
            date.getFullYear() === today.getFullYear() ? undefined : "numeric",
    });
}

function buildGroups(files: LogFileEntry[], query: string): LogFileGroup[] {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized
        ? files.filter((file) => file.name.toLowerCase().includes(normalized))
        : files;

    const groups = new Map<string, LogFileGroup>();
    for (const file of filtered) {
        const key = dayKey(file.modTime);
        const existing = groups.get(key);
        if (existing) {
            existing.files.push(file);
            existing.totalBytes += file.sizeBytes;
        } else {
            groups.set(key, {
                key,
                label: dayLabel(file.modTime),
                files: [file],
                totalBytes: file.sizeBytes,
            });
        }
    }

    return Array.from(groups.values());
}

function LogFileRow({
    file,
    downloading,
    onPreview,
    onDownload,
}: {
    file: LogFileEntry;
    downloading: boolean;
    onPreview: () => void;
    onDownload: () => void;
}) {
    const archive = isCompressedLogFile(file.name);
    const extension = file.name.includes(".")
        ? (file.name.split(".").pop() ?? "").toLowerCase()
        : "";

    return (
        <li>
            <div className="group flex items-center gap-3 rounded-md border border-transparent px-2 py-2 transition-colors hover:border-border/70 hover:bg-muted/40">
                <button
                    type="button"
                    onClick={archive ? undefined : onPreview}
                    tabIndex={archive ? -1 : undefined}
                    title={archive ? file.name : `Preview ${file.name}`}
                    className={cn(
                        "flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
                        archive && "cursor-default",
                    )}
                >
                    <span
                        className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-md border",
                            archive
                                ? "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                : "border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-400",
                        )}
                    >
                        {archive ? (
                            <FileArchive className="size-4" />
                        ) : (
                            <FileText className="size-4" />
                        )}
                    </span>

                    <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                            <span
                                className="truncate font-mono text-[13px]"
                                title={file.name}
                            >
                                {file.name}
                            </span>
                            <span className="hidden shrink-0 rounded border border-border/60 px-1 py-px font-mono text-[9px] tracking-wide text-muted-foreground/60 uppercase sm:inline">
                                {extension || "file"}
                            </span>
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground/70">
                            <span className="font-mono tabular-nums">
                                {formatBytes(file.sizeBytes)}
                            </span>
                            <span className="text-muted-foreground/30">·</span>
                            <span title={formatDateTime(file.modTime)}>
                                {formatDateTime(file.modTime)}
                            </span>
                            <span className="text-muted-foreground/30">·</span>
                            <span>{formatRelativeTime(file.modTime)}</span>
                        </span>
                    </span>
                </button>

                <div className="flex shrink-0 items-center gap-1">
                    {!archive && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground/60 opacity-70 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                            aria-label={`Preview ${file.name}`}
                            title="Preview"
                            onClick={onPreview}
                        >
                            <Eye className="size-3.5" />
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground/60 hover:text-foreground"
                        disabled={downloading}
                        aria-label={`Download ${file.name}`}
                        title="Download"
                        onClick={onDownload}
                    >
                        {downloading ? (
                            <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                            <Download className="size-3.5" />
                        )}
                    </Button>
                </div>
            </div>
        </li>
    );
}

export function LogFilesList({ logDir }: { logDir?: string | null }) {
    const token = useAppSelector((state) => state.auth.token);
    const [files, setFiles] = useState<LogFileEntry[] | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [downloading, setDownloading] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [previewFile, setPreviewFile] = useState<LogFileEntry | null>(null);

    const load = useCallback(async () => {
        if (!token) return;
        setRefreshing(true);
        try {
            const response = await fetch(`${API_URL}/logs/files`, {
                cache: "no-store",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) {
                throw new Error(
                    `Failed to load log files (${response.status})`,
                );
            }
            setFiles((await response.json()) as LogFileEntry[]);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Network error");
        } finally {
            setRefreshing(false);
        }
    }, [token]);

    useEffect(() => {
        void load();
    }, [load]);

    const download = useCallback(
        async (file: LogFileEntry) => {
            if (!token) return;
            setDownloading((prev) => new Set(prev).add(file.name));
            try {
                const response = await fetch(
                    `${API_URL}/logs/files/${encodeURIComponent(file.name)}`,
                    {
                        cache: "no-store",
                        headers: { Authorization: `Bearer ${token}` },
                    },
                );
                if (!response.ok) {
                    throw new Error(`Download failed (${response.status})`);
                }
                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = objectUrl;
                anchor.download = file.name;
                anchor.click();
                window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
                toast.success(`Downloaded ${file.name}`);
            } catch (err) {
                toast.error(
                    err instanceof Error
                        ? err.message
                        : `Failed to download ${file.name}`,
                );
            } finally {
                setDownloading((prev) => {
                    const next = new Set(prev);
                    next.delete(file.name);
                    return next;
                });
            }
        },
        [token],
    );

    const sortedFiles = useMemo(
        () =>
            files
                ? [...files].sort(
                      (a, b) =>
                          new Date(b.modTime).getTime() -
                          new Date(a.modTime).getTime(),
                  )
                : null,
        [files],
    );

    const totalBytes = useMemo(
        () => (files ?? []).reduce((sum, file) => sum + file.sizeBytes, 0),
        [files],
    );

    const groups = useMemo(
        () => (sortedFiles ? buildGroups(sortedFiles, query) : []),
        [sortedFiles, query],
    );

    const filteredCount = useMemo(
        () => groups.reduce((sum, group) => sum + group.files.length, 0),
        [groups],
    );

    const newest = sortedFiles?.[0]?.modTime;

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="accent-tile mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md">
                        <FileArchive className="size-4 accent-tile-icon" />
                    </span>
                    <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            Log files
                            {files && (
                                <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                                    {files.length}
                                </span>
                            )}
                        </CardTitle>
                        <CardDescription className="text-xs">
                            {files === null
                                ? "Session logs written to disk"
                                : files.length === 0
                                  ? "Session logs will appear here once the backend writes them"
                                  : `${files.length} file${files.length === 1 ? "" : "s"} · ${formatBytes(totalBytes)} total${newest ? ` · latest ${formatRelativeTime(newest)}` : ""}`}
                        </CardDescription>
                    </div>
                </div>

                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5"
                    disabled={refreshing}
                    aria-label="Refresh log files"
                    onClick={() => void load()}
                >
                    <RefreshCw
                        className={cn("size-3.5", refreshing && "animate-spin")}
                    />
                    <span className="hidden text-xs sm:inline">Refresh</span>
                </Button>
            </CardHeader>

            <CardContent className="space-y-3">
                {files && (files.length > 2 || query !== "") && (
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative min-w-0 flex-1 sm:max-w-72">
                            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={query}
                                onChange={(event) =>
                                    setQuery(event.target.value)
                                }
                                placeholder="Filter log files…"
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
                        {query && (
                            <span className="font-mono text-[11px] text-muted-foreground/60">
                                {filteredCount} match
                                {filteredCount === 1 ? "" : "es"}
                            </span>
                        )}
                    </div>
                )}

                {error && (
                    <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
                        <span className="flex min-w-0 items-center gap-2 text-xs text-destructive">
                            <AlertCircle className="size-3.5 shrink-0" />
                            <span className="truncate">{error}</span>
                        </span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            className="shrink-0"
                            disabled={refreshing}
                            onClick={() => void load()}
                        >
                            Retry
                        </Button>
                    </div>
                )}

                {files === null ? (
                    <div className="space-y-1">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div
                                key={index}
                                className="flex items-center gap-3 px-2 py-2"
                            >
                                <Skeleton className="size-8 shrink-0 rounded-md" />
                                <div className="flex-1 space-y-1.5">
                                    <Skeleton className="h-3.5 w-52 max-w-full" />
                                    <Skeleton className="h-2.5 w-36 max-w-full" />
                                </div>
                                <Skeleton className="size-7 shrink-0 rounded-md" />
                            </div>
                        ))}
                    </div>
                ) : files.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/70 py-10 text-center">
                        <span className="accent-tile flex size-10 items-center justify-center rounded-lg">
                            <FileArchive className="size-4 accent-tile-icon" />
                        </span>
                        <div className="space-y-1">
                            <p className="text-xs font-medium">
                                No log files yet
                            </p>
                            <p className="max-w-sm text-[11px] text-muted-foreground/60">
                                Session logs will appear here once the backend
                                starts writing to{" "}
                                <span className="font-mono text-muted-foreground/80">
                                    {logDir ?? "logs"}
                                </span>
                                .
                            </p>
                        </div>
                    </div>
                ) : groups.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center text-xs text-muted-foreground/60">
                        No files match{" "}
                        <span className="font-mono text-muted-foreground">
                            “{query}”
                        </span>
                        .
                        <Button
                            type="button"
                            variant="link"
                            size="xs"
                            className="ml-1 h-auto p-0 text-xs"
                            onClick={() => setQuery("")}
                        >
                            Clear filter
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {groups.map((group) => (
                            <section key={group.key} className="space-y-1">
                                <div className="flex items-center gap-2 px-1">
                                    <span className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground/60 uppercase">
                                        {group.label}
                                    </span>
                                    <span className="h-px flex-1 bg-border/60" />
                                    <span className="font-mono text-[10px] text-muted-foreground/50">
                                        {group.files.length} ·{" "}
                                        {formatBytes(group.totalBytes)}
                                    </span>
                                </div>
                                <ul className="flex flex-col">
                                    {group.files.map((file) => (
                                        <LogFileRow
                                            key={file.name}
                                            file={file}
                                            downloading={downloading.has(
                                                file.name,
                                            )}
                                            onPreview={() =>
                                                setPreviewFile(file)
                                            }
                                            onDownload={() =>
                                                void download(file)
                                            }
                                        />
                                    ))}
                                </ul>
                            </section>
                        ))}
                    </div>
                )}

                {files !== null && files.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/60 pt-3 text-[11px] text-muted-foreground/60">
                        <FolderOpen className="size-3.5 shrink-0" />
                        <span
                            className="truncate font-mono"
                            title={logDir ?? undefined}
                        >
                            {logDir ?? "logs"}
                        </span>
                        <span className="ml-auto hidden text-muted-foreground/50 sm:inline">
                            Select a file to preview it
                        </span>
                    </div>
                )}
            </CardContent>

            <LogFilePreviewDialog
                key={previewFile?.name ?? "closed"}
                file={previewFile}
                token={token}
                downloading={
                    previewFile ? downloading.has(previewFile.name) : false
                }
                onClose={() => setPreviewFile(null)}
                onDownload={(file) => void download(file)}
            />
        </Card>
    );
}
