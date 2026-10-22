import { ArrowRight, Radio } from "lucide-react";
import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@pes/ui/components/card";
import { cn } from "@pes/ui/lib/utils";
import { formatRelativeTime } from "@/lib/format-date";
import { formatBucketTime, type EventStats } from "@/lib/trigger-rules/event-stats";
import type { SourceBreakdown } from "@/lib/trigger-rules/dashboard-data";
import type { EventTone } from "@/lib/trigger-rules/describe-event";

const TONE_DOT: Record<EventTone, string> = {
    violet: "bg-violet-500",
    teal: "bg-teal-500",
    pink: "bg-pink-500",
    slate: "bg-muted-foreground/40",
};

const TONE_BAR: Record<EventTone, string> = {
    violet: "bg-violet-500",
    teal: "bg-teal-500",
    pink: "bg-pink-500",
    slate: "bg-muted-foreground/40",
};

function ChartMetric({ value, label, sub }: { value: string; label: string; sub?: string }) {
    return (
        <div className="min-w-0 px-3 py-2.5">
            <div className="flex items-baseline gap-1.5">
                <span className="font-syne text-lg font-extrabold leading-none tabular-nums text-foreground">
                    {value}
                </span>
                <span className="truncate font-mono text-[9px] uppercase tracking-widest text-muted-foreground/45">
                    {label}
                </span>
            </div>
            {sub && <div className="mt-1 truncate font-mono text-[9px] text-muted-foreground/40">{sub}</div>}
        </div>
    );
}

export default function StreamPulse({
    stats,
    sources,
    lastEventAt,
    now,
}: {
    stats: EventStats;
    sources: SourceBreakdown[];
    lastEventAt: string | null;
    now: number;
}) {
    const max = Math.max(1, ...stats.buckets.map((bucket) => bucket.count));
    const total = stats.buckets.reduce((sum, bucket) => sum + bucket.count, 0);
    const average = total / Math.max(1, stats.buckets.length);

    const lastEventLabel = lastEventAt
        ? `last event ${formatRelativeTime(lastEventAt, now)}`
        : "waiting for the first event";

    return (
        <Card className="gap-0 py-0">
            <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pb-4 pt-5">
                <div className="min-w-0">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="relative flex size-2 shrink-0">
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                        </span>
                        Stream pulse
                        <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-px font-mono text-[9px] font-normal uppercase tracking-widest text-muted-foreground/50">
                            last 12 min
                        </span>
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground/60">
                        Event volume and source mix from the live buffer · {lastEventLabel}
                    </p>
                </div>
                <Link
                    to="/app/events/triggered"
                    className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground/70 transition-colors hover:text-violet-600 dark:hover:text-violet-400"
                >
                    open stream
                    <ArrowRight size={11} />
                </Link>
            </CardHeader>

            <CardContent className="space-y-4 px-5 pb-5">
                <div className="rounded-lg border border-border/50 bg-muted/15 p-3">
                    <div className="flex h-28 items-end gap-1 sm:gap-1.5">
                        {stats.buckets.map((bucket, index) => {
                            const isLatest = index === stats.buckets.length - 1;
                            const height = bucket.count === 0 ? 2 : Math.max(6, Math.round((bucket.count / max) * 100));
                            return (
                                <div
                                    key={bucket.start}
                                    title={`${formatBucketTime(bucket.start)} · ${bucket.count} event${bucket.count === 1 ? "" : "s"}`}
                                    className="group/bar flex h-full flex-1 flex-col justify-end"
                                >
                                    <div
                                        className={cn(
                                            "w-full rounded-t-[3px] transition-colors",
                                            bucket.count === 0
                                                ? "bg-muted-foreground/15"
                                                : isLatest
                                                  ? "bg-violet-500"
                                                  : "bg-violet-500/35 group-hover/bar:bg-violet-500/60",
                                        )}
                                        style={{ height: `${height}%` }}
                                    />
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-muted-foreground/35">
                        <span>{formatBucketTime(stats.buckets[0]?.start ?? now)}</span>
                        <span className="inline-flex items-center gap-1.5">
                            <Radio size={9} className="text-violet-500" />
                            now
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border/50 bg-border/50">
                    <div className="bg-card">
                        <ChartMetric
                            value={String(stats.buckets[stats.buckets.length - 1]?.count ?? 0)}
                            label="this minute"
                            sub={`${total} in window`}
                        />
                    </div>
                    <div className="bg-card">
                        <ChartMetric
                            value={stats.peakAt === null ? "—" : String(stats.peak)}
                            label="peak"
                            sub={stats.peakAt === null ? "no events yet" : `at ${formatBucketTime(stats.peakAt)}`}
                        />
                    </div>
                    <div className="bg-card">
                        <ChartMetric value={average.toFixed(1)} label="avg / min" sub="rolling 12 minutes" />
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/50">
                            By source
                        </span>
                        <span className="font-mono text-[9px] text-muted-foreground/35">
                            {stats.buffer} events buffered
                        </span>
                    </div>

                    {sources.length === 0 ? (
                        <p className="rounded-md border border-dashed border-border/70 px-3 py-4 text-center text-[11px] text-muted-foreground/40">
                            Source breakdown appears once events start arriving.
                        </p>
                    ) : (
                        <>
                            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                                {sources.map((source) => (
                                    <div
                                        key={source.key}
                                        className={cn("h-full", TONE_BAR[source.tone])}
                                        style={{ width: `${source.percent}%` }}
                                        title={`${source.label} · ${source.count} event${source.count === 1 ? "" : "s"}`}
                                    />
                                ))}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                {sources.map((source) => (
                                    <span key={source.key} className="inline-flex items-center gap-1.5 text-[11px]">
                                        <span className={cn("size-1.5 rounded-full", TONE_DOT[source.tone])} />
                                        <span className="text-muted-foreground/75">{source.label}</span>
                                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground/50">
                                            {source.count}
                                        </span>
                                        <span className="font-mono text-[9px] tabular-nums text-muted-foreground/30">
                                            {Math.round(source.percent)}%
                                        </span>
                                    </span>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
