import type { EdgingSessionStats } from "@/types";
import { formatDuration } from "@/lib/training";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

interface SessionStatsProps {
    stats: EdgingSessionStats;
}

function Delta({ value, compare, invert = false }: { value: number | null | undefined; compare: number | null | undefined; invert?: boolean }) {
    if (value == null || compare == null) return null;
    const diff = value - compare;
    if (Math.abs(diff) < 0.001) {
        return <Minus size={12} className="text-muted-foreground/50" />;
    }
    const up = diff > 0;
    // For "performance" metrics (pace), up = good. invert flips the color for
    // metrics where lower is better (none for now — kept for future goals).
    const good = invert ? !up : up;
    return (
        <span className={`flex items-center gap-0.5 text-[10px] ${good ? "text-emerald-500" : "text-rose-500"}`}>
            {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(diff).toFixed(1)}
        </span>
    );
}

function MetricCard({
    label,
    value,
    previous,
    average,
    delta,
}: {
    label: string;
    value: string;
    previous: string | null;
    average: string | null;
    delta: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-card p-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {label}
            </span>
            <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-semibold tabular-nums">{value}</span>
                {delta}
            </div>
            <div className="flex flex-col text-[10px] text-muted-foreground/70">
                <span>Previous: {previous ?? "—"}</span>
                <span>Average: {average ?? "—"}</span>
            </div>
        </div>
    );
}

/** This session's performance vs the previous session and the average. */
export function SessionStats({ stats }: SessionStatsProps) {
    const pace = stats.edges_per_minute != null ? `${stats.edges_per_minute}/min` : "—";
    const pacePrev = stats.edges_per_minute_previous != null ? `${stats.edges_per_minute_previous}/min` : null;
    const paceAvg = stats.edges_per_minute_average != null ? `${stats.edges_per_minute_average}/min` : null;

    const difficulty = Object.entries(stats.difficulty_counts ?? {})
        .map(([name, count]) => `${name}×${count}`)
        .join(" · ");

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <MetricCard
                    label="Duration"
                    value={formatDuration(stats.duration_seconds)}
                    previous={formatDuration(stats.duration_previous_seconds)}
                    average={formatDuration(stats.duration_average_seconds)}
                    delta={
                        <Delta
                            value={stats.duration_seconds}
                            compare={stats.duration_previous_seconds}
                        />
                    }
                />
                <MetricCard
                    label="Edges"
                    value={String(stats.success_edges)}
                    previous={stats.edges_previous != null ? String(stats.edges_previous) : null}
                    average={stats.edges_average != null ? String(stats.edges_average) : null}
                    delta={
                        <Delta value={stats.success_edges} compare={stats.edges_previous} />
                    }
                />
                <MetricCard
                    label="Pace"
                    value={pace}
                    previous={pacePrev}
                    average={paceAvg}
                    delta={
                        <Delta
                            value={stats.edges_per_minute}
                            compare={stats.edges_per_minute_previous}
                        />
                    }
                />
                <MetricCard
                    label="Failed edges"
                    value={String(stats.failed_edges)}
                    previous={null}
                    average={null}
                    delta={null}
                />
            </div>
            {difficulty && (
                <p className="text-[11px] text-muted-foreground/70">
                    Difficulty breakdown:{" "}
                    <span className="font-medium text-foreground/80">{difficulty}</span>
                </p>
            )}
        </div>
    );
}
