import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, Clock3, GitBranch, SlidersHorizontal, Zap } from "lucide-react";

import { cn } from "@pes/ui/lib/utils";

import { EventTypeBadge } from "@/components/common/events/event-badges";
import { formatRelativeTime, formatDateTime } from "@/lib/format-date";
import { computeEventStats, formatBucketTime } from "@/lib/trigger-rules/event-stats";
import { buildRuleStats } from "@/lib/trigger-rules/rule-stats";
import { useAppSelector } from "@/store/hooks";
import { triggerRulesSelectors } from "@/store/slices/triggerRulesSlice";
import type { TriggeredEvent } from "@/types";

function Metric({
    label,
    value,
    hint,
    tone = "violet",
}: {
    label: string;
    value: string | number;
    hint?: string;
    tone?: "violet" | "emerald" | "amber" | "muted";
}) {
    const toneClass = {
        violet: "text-violet-600 dark:text-violet-300",
        emerald: "text-emerald-600 dark:text-emerald-300",
        amber: "text-amber-600 dark:text-amber-300",
        muted: "text-foreground/80",
    }[tone];
    return (
        <div className="rounded-xl border border-border/70 bg-card/40 p-3">
            <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/45">
                {label}
            </p>
            <p className={cn("mt-1 font-mono text-xl tabular-nums", toneClass)}>{value}</p>
            {hint && <p className="mt-0.5 truncate text-[10px] text-muted-foreground/45">{hint}</p>}
        </div>
    );
}

function Bar({ value, max, color = "bg-violet-500/70" }: { value: number; max: number; color?: string }) {
    const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
    return (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
            <div className={cn("h-full rounded-full", color)} style={{ width: `${width}%` }} />
        </div>
    );
}

function EventDetail({ event }: { event: TriggeredEvent }) {
    const rules = event.triggered_rules ?? [];
    return (
        <div className="space-y-3">
            <div>
                <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40">
                    Selected event
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <EventTypeBadge type={event.event_type} />
                    <span className="font-mono text-[9px] text-muted-foreground/50">
                        {formatDateTime(event.triggered_at)}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 font-mono text-[9px]">
                <div>
                    <p className="text-muted-foreground/40">SOURCE</p>
                    <p className="truncate text-foreground/75">{event.origin || "—"}</p>
                </div>
                <div>
                    <p className="text-muted-foreground/40">EVENT ID</p>
                    <p className="truncate text-foreground/75">{event.id}</p>
                </div>
                <div>
                    <p className="text-muted-foreground/40">RULES</p>
                    <p className="text-foreground/75">{rules.length}</p>
                </div>
            </div>

            <div>
                <p className="mb-1 font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40">
                    Payload
                </p>
                <pre className="max-h-44 overflow-auto rounded-lg border border-border/60 bg-background/50 p-2 font-mono text-[9px] leading-4 text-muted-foreground/75">
                    {JSON.stringify(event.event_data ?? {}, null, 2)}
                </pre>
            </div>

            <div>
                <p className="mb-1 font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40">
                    Triggered rules
                </p>
                {rules.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border/70 p-2 text-[10px] text-muted-foreground/45">
                        No rule matched this event.
                    </p>
                ) : (
                    <div className="space-y-1.5">
                        {rules.map((rule, index) => (
                            <div
                                key={`${rule.rule_id ?? rule.rule_name}-${index}`}
                                className="rounded-lg border border-border/60 bg-background/40 p-2"
                            >
                                <div className="flex items-center gap-2">
                                    <GitBranch className="size-3 text-violet-500" />
                                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                                        {rule.rule_name}
                                    </span>
                                    <span className="font-mono text-[8px] text-muted-foreground/40">
                                        {rule.actions.length} action{rule.actions.length === 1 ? "" : "s"}
                                    </span>
                                </div>
                                {rule.actions.map((action) => (
                                    <div key={action.queue_item_id} className="mt-1 flex items-center gap-1.5">
                                        <span className="font-mono text-[8px] text-violet-600 dark:text-violet-300">
                                            {action.action_type}
                                        </span>
                                        <span className="truncate font-mono text-[8px] text-muted-foreground/50">
                                            {action.payload &&
                                                Object.entries(action.payload)
                                                    .slice(0, 3)
                                                    .map(([key, value]) => `${key}=${String(value)}`)
                                                    .join(" · ")}
                                        </span>
                                        {Array.isArray(action.modifiers) && action.modifiers.length > 0 && (
                                            <span className="ml-auto rounded border border-violet-500/25 bg-violet-500/10 px-1 font-mono text-[7px] text-violet-600 dark:text-violet-300">
                                                ×{String((action.modifiers[0] as { factor?: number })?.factor ?? "?")}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function TelemetryPage() {
    const events = useAppSelector((state) => state.events.events);
    const rules = useAppSelector((state) => triggerRulesSelectors.selectAll(state));
    const [, setClock] = useState(0);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        const timer = window.setInterval(() => setClock((value) => value + 1), 15_000);
        return () => window.clearInterval(timer);
    }, []);

    const now = Date.now();
    const stats = useMemo(
        () => computeEventStats(events, 1000, now),
        [events, now],
    );
    const ruleStats = useMemo(() => buildRuleStats(events), [events]);

    const topTypes = useMemo(() => {
        const counts = new Map<string, number>();
        for (const event of events) {
            counts.set(event.event_type, (counts.get(event.event_type) ?? 0) + 1);
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    }, [events]);

    const topRules = useMemo(() => {
        const byId = new Map(rules.map((rule) => [rule.id, rule]));
        return [...ruleStats.entries()]
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 6)
            .map(([id, stat]) => ({ rule: byId.get(id), id, stat }));
    }, [ruleStats, rules]);

    const latest = events[events.length - 1];
    const selected = events.find((event) => event.id === selectedId) ?? latest;
    const recent = [...events].reverse().slice(0, 10);
    const maxBucket = Math.max(1, ...stats.buckets.map((bucket) => bucket.count));
    const maxType = topTypes[0]?.[1] ?? 1;
    const maxRule = topRules[0]?.stat.count ?? 1;

    return (
        <div className="space-y-4 px-4 md:px-5">
            <div>
                <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">
                    Events / Telemetry
                </p>
                <h2 className="text-lg font-semibold tracking-tight">Telemetry</h2>
                <p className="text-xs text-muted-foreground/60">
                    Live view of the in-memory event buffer. Click an event to inspect its payload and triggered rules.
                </p>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
                <Metric label="Buffer" value={stats.buffer} hint="last 1000 events" />
                <Metric label="Fired" value={`${stats.firedPct}%`} hint={`${stats.fired} matched`} tone="emerald" />
                <Metric label="Unmatched" value={stats.unmatched} hint="no rule" tone="muted" />
                <Metric label="Actions" value={stats.actions} hint="queued effects" tone="violet" />
                <Metric label="Rules" value={stats.rules} hint="distinct fired" tone="amber" />
                <Metric label="Rate" value={`${stats.rate}/m`} hint="last 60 seconds" tone="emerald" />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
                <section className="rounded-xl border border-border/70 bg-card/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <Activity className="size-3.5 text-violet-500" />
                            <h3 className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                                Throughput
                            </h3>
                        </div>
                        <span className="font-mono text-[8px] text-muted-foreground/40">12 min</span>
                    </div>
                    <div className="mt-3 flex h-28 items-end gap-1">
                        {stats.buckets.map((bucket) => (
                            <div key={bucket.start} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                                <div
                                    className={cn(
                                        "w-full rounded-t-sm",
                                        bucket.count > 0 ? "bg-violet-500/60" : "bg-muted/40",
                                    )}
                                    style={{
                                        height: `${Math.max(4, Math.round((bucket.count / maxBucket) * 88))}px`,
                                    }}
                                    title={`${bucket.count} events at ${formatBucketTime(bucket.start)}`}
                                />
                                <span className="font-mono text-[7px] text-muted-foreground/35">
                                    {formatBucketTime(bucket.start)}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="rounded-xl border border-border/70 bg-card/40 p-3">
                    <div className="flex items-center gap-2">
                        <Zap className="size-3.5 text-amber-500" />
                        <h3 className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                            Top events
                        </h3>
                    </div>
                    <div className="mt-2 space-y-2">
                        {topTypes.map(([type, count]) => (
                            <div key={type} className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                    <EventTypeBadge type={type} className="max-w-[240px]" />
                                    <span className="font-mono text-[9px] text-muted-foreground/50">{count}</span>
                                </div>
                                <Bar value={count} max={maxType} />
                            </div>
                        ))}
                        {topTypes.length === 0 && (
                            <p className="py-8 text-center text-[11px] text-muted-foreground/40">No events yet.</p>
                        )}
                    </div>
                </section>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
                <section className="rounded-xl border border-border/70 bg-card/40 p-3">
                    <div className="flex items-center gap-2">
                        <SlidersHorizontal className="size-3.5 text-emerald-500" />
                        <h3 className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                            Top rules
                        </h3>
                    </div>
                    <div className="mt-2 space-y-2">
                        {topRules.map(({ rule, id, stat }) => (
                            <div key={id} className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="min-w-0 truncate text-[11px] text-foreground/80">
                                        {rule?.name ?? id}
                                    </span>
                                    <span className="shrink-0 font-mono text-[9px] text-muted-foreground/50">
                                        ×{stat.count}
                                    </span>
                                </div>
                                <Bar value={stat.count} max={maxRule} color="bg-emerald-500/60" />
                            </div>
                        ))}
                        {topRules.length === 0 && (
                            <p className="py-8 text-center text-[11px] text-muted-foreground/40">
                                No rule has fired in the buffer.
                            </p>
                        )}
                    </div>
                </section>

                <section className="rounded-xl border border-border/70 bg-card/40 p-3">
                    <div className="flex items-center gap-2">
                        <Clock3 className="size-3.5 text-violet-500" />
                        <h3 className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                            Recent events
                        </h3>
                    </div>
                    <div className="mt-2 space-y-1">
                        {recent.map((event) => (
                            <button
                                key={event.id}
                                type="button"
                                onClick={() => setSelectedId(event.id)}
                                className={cn(
                                    "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors",
                                    selected?.id === event.id
                                        ? "border-violet-500/35 bg-violet-500/[0.06]"
                                        : "border-transparent hover:bg-muted/30",
                                )}
                            >
                                <span className="w-12 shrink-0 font-mono text-[8px] text-muted-foreground/40">
                                    {formatRelativeTime(event.triggered_at)}
                                </span>
                                <EventTypeBadge type={event.event_type} className="max-w-[200px]" />
                                <span className="ml-auto shrink-0 font-mono text-[8px] text-muted-foreground/40">
                                    {event.triggered_rules?.length ?? 0} rule
                                    {(event.triggered_rules?.length ?? 0) === 1 ? "" : "s"}
                                </span>
                                <ArrowUpRight className="size-3 text-muted-foreground/30" />
                            </button>
                        ))}
                        {recent.length === 0 && (
                            <p className="py-8 text-center text-[11px] text-muted-foreground/40">
                                Waiting for the first event.
                            </p>
                        )}
                    </div>
                </section>
            </div>

            {selected && (
                <section className="rounded-xl border border-border/70 bg-card/40 p-4">
                    <EventDetail event={selected} />
                </section>
            )}
        </div>
    );
}
