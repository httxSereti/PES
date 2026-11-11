import { useCallback, useEffect, useState } from "react";
import { Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@pes/ui/components/button";
import { formatDateTime } from "@/lib/format-date";
import { formatBytes } from "@/lib/logs";
import { useAppSelector } from "@/store/hooks";
import type { LogFileEntry } from "@/types/logs.types";

const API_URL = import.meta.env.VITE_API_URL;

export function LogFilesList() {
    const token = useAppSelector((state) => state.auth.token);
    const [files, setFiles] = useState<LogFileEntry[] | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [downloading, setDownloading] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!token) return;
        setRefreshing(true);
        try {
            const response = await fetch(`${API_URL}/logs/files`, {
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

    const download = async (file: LogFileEntry) => {
        if (!token) return;
        setDownloading((prev) => new Set(prev).add(file.name));
        try {
            const response = await fetch(
                `${API_URL}/logs/files/${encodeURIComponent(file.name)}`,
                { headers: { Authorization: `Bearer ${token}` } },
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
    };

    return (
        <section className="space-y-2">
            <div className="flex items-center gap-2">
                <h2 className="flex items-center gap-2 text-xs font-semibold">
                    <FileText className="size-3.5 text-muted-foreground" />
                    Log files
                </h2>
                <span className="text-[11px] text-muted-foreground/50">
                    {files
                        ? `${files.length} file${files.length === 1 ? "" : "s"}`
                        : ""}
                </span>
                <div className="flex-1" />
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    disabled={refreshing}
                    onClick={() => void load()}
                >
                    <RefreshCw
                        className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
                    />
                    Refresh
                </Button>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            {files === null ? (
                <p className="rounded-md border px-3 py-6 text-center text-xs italic text-muted-foreground/50">
                    Loading log files…
                </p>
            ) : files.length === 0 ? (
                <p className="rounded-md border px-3 py-6 text-center text-xs italic text-muted-foreground/50">
                    No log files in the log directory yet.
                </p>
            ) : (
                <div className="divide-y rounded-md border">
                    {files.map((file) => (
                        <div
                            key={file.name}
                            className="flex items-center justify-between gap-4 px-3 py-2"
                        >
                            <div className="min-w-0">
                                <p
                                    className="truncate font-mono text-sm"
                                    title={file.name}
                                >
                                    {file.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {formatBytes(file.sizeBytes)} ·{" "}
                                    {formatDateTime(file.modTime)}
                                </p>
                            </div>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="shrink-0"
                                disabled={downloading.has(file.name)}
                                onClick={() => void download(file)}
                            >
                                {downloading.has(file.name) ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <Download className="size-4" />
                                )}
                                <span className="sr-only">
                                    Download {file.name}
                                </span>
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
