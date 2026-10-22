import { useMemo } from "react";
import { ArrowRight, Plus, Zap } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@pes/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pes/ui/components/card";
import { cn } from "@pes/ui/lib/utils";
import { formatRelativeTime } from "@/lib/format-date";
import type { RulePerformanceEntry } from "@/lib/trigger-rules/dashboard-data";

const MAX_ITEMS = 5;

function RuleRow({ entry, max, now }: { entry: RulePerformanceEntry; max: number; now: number }) {
    const width = max > 0 ? Math.max(4, Math.round((entry.count / max) * 100)) : 0;

    return (
        <Link
            to={`/app/events/trigger-rules/triggered?rule=${encodeURIComponent(entry.id)}`}
            className="group block border-b border-border/40 py-2.5 last:border-b-0"
            title={`${entry.actionCount} action${entry.actionCount === 1 ? "" : "s"} · priority ${entry.priority}`}
        >
            <div className="flex items-center gap-2">
                <span
                    className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        entry.enabled ? "bg-emerald-500" : "bg-muted-foreground/30",
                    )}
                />
                <span className="min-w-0 truncate text-[12.5px] font-semibold text-foreground/85 transition-colors group-hover:text-violet-600 dark:group-hover:text-violet-300">
                    {entry.name}
                </span>
                <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/60">
                    ×{entry.count}
                </span>
            </div>

            <div className="mt-1.5 flex items-center gap-2 pl-3.5">
                <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                        className={cn(
                            "h-full rounded-full transition-[width] duration-500",
                            entry.enabled ? "bg-violet-500/70" : "bg-muted-foreground/30",
                        )}
                        style={{ width: `${width}%` }}
                    />
                </div>
                <span className="shrink-0 font-mono text-[9px] text-muted-foreground/40">
                    {entry.lastFired ? formatRelativeTime(entry.lastFired, now) : "never fired"}
                </span>
            </div>
        </Link>
    );
}

export default function LatestRulesList({ performance, now }: { performance: RulePerformanceEntry[]; now: number }) {
    const fired = useMemo(() => performance.filter((entry) => entry.count > 0).slice(0, MAX_ITEMS), [performance]);
    const firedCount = performance.filter((entry) => entry.count > 0).length;
    const max = Math.max(1, ...fired.map((entry) => entry.count));

    return (
        <Card className="h-full gap-0 py-0">
            <CardHeader className="flex flex-row items-center justify-between gap-3 px-5 pb-3 pt-5">
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                    <Zap size={13} className="accent-tile-icon" />
                    Rule performance
                    <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-px font-mono text-[9px] font-normal uppercase tracking-widest text-muted-foreground/50">
                        last 250 events
                    </span>
                </CardTitle>
                <Link
                    to="/app/events/trigger-rules"
                    className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground/70 transition-colors hover:text-violet-600 dark:hover:text-violet-400"
                >
                    view all
                    <ArrowRight size={11} />
                </Link>
            </CardHeader>

            <CardContent className="px-5 pb-4">
                {fired.length === 0 ? (
                    <div className="flex min-h-44 flex-col items-center justify-center gap-2.5 text-center">
                        <span className="flex size-9 items-center justify-center rounded-full border border-violet-500/25 bg-violet-500/10">
                            <Zap size={15} className="text-violet-600 dark:text-violet-400" />
                        </span>
                        <p className="text-sm text-muted-foreground/60">
                            {performance.length > 0 ? "No recent firings" : "No trigger rules yet"}
                        </p>
                        <p className="max-w-xs text-[11px] text-muted-foreground/40">
                            {performance.length > 0
                                ? "Rules that fire in the current event buffer will be ranked here."
                                : "Create a rule to react to events automatically."}
                        </p>
                        {performance.length === 0 && (
                            <Button asChild variant="outline" size="sm" className="mt-1 gap-1.5">
                                <Link to="/app/events/trigger-rules/new">
                                    <Plus size={13} />
                                    Create a rule
                                </Link>
                            </Button>
                        )}
                    </div>
                ) : (
                    <>
                        <div>
                            {fired.map((entry) => (
                                <RuleRow key={entry.id} entry={entry} max={max} now={now} />
                            ))}
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2.5 font-mono text-[9px] text-muted-foreground/40">
                            <span>
                                {firedCount} of {performance.length} rules fired
                            </span>
                            <Link
                                to="/app/events/trigger-rules/triggered"
                                className="transition-colors hover:text-violet-600 dark:hover:text-violet-400"
                            >
                                full rule history →
                            </Link>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
