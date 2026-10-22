import { cn } from "@pes/ui/lib/utils";
import { formatBucketTime, type EventStats } from "@/lib/trigger-rules/event-stats";

function Metric({
    label,
    value,
    unit,
    sub,
    tone,
    progress,
    children,
}: {
    label: string;
    value: string;
    unit: string;
    sub: React.ReactNode;
    tone?: "default" | "green";
    progress?: number;
    children?: React.ReactNode;
}) {
    return (
        <div className="relative flex min-w-0 items-end justify-between gap-3 overflow-hidden bg-card px-5 py-4">
            <div className="flex min-w-0 flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/50">
                    {label}
                </span>
                <div className="flex items-baseline gap-1.5">
                    <span className="text-[26px] font-semibold leading-none tabular-nums text-foreground">{value}</span>
                    <span className="truncate text-[11px] text-muted-foreground/55">{unit}</span>
                </div>
                <span
                    className={cn(
                        "truncate font-mono text-[10px]",
                        tone === "green" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/55",
                    )}
                >
                    {sub}
                </span>
            </div>
            {children}
            {progress !== undefined && (
                <div className="absolute inset-x-0 bottom-0 h-[2px] bg-muted-foreground/10">
                    <div
                        className="h-full bg-violet-500/70"
                        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                    />
                </div>
            )}
        </div>
    );
}

export function EventStats({ stats }: { stats: EventStats }) {
    const max = Math.max(1, ...stats.buckets.map((bucket) => bucket.count));

    return (
        <div className="grid grid-cols-2 gap-px border-b border-border/60 bg-border/50 lg:grid-cols-4">
            <Metric
                label="In buffer"
                value={String(stats.buffer)}
                unit={`/ ${stats.capacity} events`}
                sub={`${stats.bufferPct}% of cap`}
                progress={stats.bufferPct}
            />
            <Metric
                label="Rules fired"
                value={String(stats.fired)}
                unit="events with rules"
                sub={`${stats.firedPct}% of events · ${stats.rules} rules`}
                tone={stats.fired > 0 ? "green" : "default"}
                progress={stats.firedPct}
            />
            <Metric
                label="Actions queued"
                value={String(stats.actions)}
                unit="from the stream"
                sub={stats.actions === 0 ? "nothing queued yet" : `${stats.unmatched} events unmatched`}
            />
            <Metric
                label="Throughput"
                value={String(stats.rate)}
                unit="events / min"
                sub={
                    stats.peakAt !== null
                        ? `peak ${stats.peak} at ${formatBucketTime(stats.peakAt)}`
                        : "waiting for events"
                }
            >
                <div className="hidden h-9 items-end gap-1 md:flex" aria-hidden>
                    {stats.buckets.map((bucket, index) => {
                        const isLatest = index === stats.buckets.length - 1;
                        const height = bucket.count === 0 ? 4 : 6 + Math.round((bucket.count / max) * 28);
                        return (
                            <span
                                key={bucket.start}
                                title={`${formatBucketTime(bucket.start)} · ${bucket.count} event${bucket.count === 1 ? "" : "s"}`}
                                className={cn(
                                    "w-[5px] rounded-sm transition-[height]",
                                    bucket.count === 0
                                        ? "bg-muted-foreground/15"
                                        : isLatest
                                          ? "bg-violet-500"
                                          : "bg-violet-500/30",
                                )}
                                style={{ height }}
                            />
                        );
                    })}
                </div>
            </Metric>
        </div>
    );
}
