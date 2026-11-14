import { Link } from "react-router";
import { ChevronRight, GitBranch, RefreshCw } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { cn } from "@pes/ui/lib/utils";

import { formatRelativeTime } from "@/lib/format-date";
import { useFlowRuns, type FlowRunSummary } from "@/hooks/useFlowRuns";

function traceText(run: FlowRunSummary, key: string): string | null {
    const value = run.trace?.[key];
    return typeof value === "string" ? value : null;
}

function statusClass(status: string): string {
    if (status === "matched") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    if (status === "deferred") return "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300";
    if (status === "skipped") return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    if (status === "error") return "border-destructive/25 bg-destructive/10 text-destructive";
    return "border-border bg-muted/40 text-muted-foreground";
}

export default function FlowRunsPage() {
    const { runs, loading, error, reload } = useFlowRuns(75);

    return (
        <div className="space-y-4 px-4 md:px-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">
                        Events / Runs
                    </p>
                    <h2 className="text-lg font-semibold tracking-tight">Flow runs</h2>
                    <p className="text-xs text-muted-foreground/60">
                        Persisted rule evaluations, node traces and effect ledger.
                    </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
                    <RefreshCw className={cn("mr-1.5 size-3.5", loading && "animate-spin")} />
                    Refresh
                </Button>
            </div>

            {error && (
                <p className="rounded-lg border border-destructive/25 bg-destructive/10 p-2 text-xs text-destructive">
                    {error}
                </p>
            )}

            {runs.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
                    <span className="flex size-11 items-center justify-center rounded-full border border-violet-500/25 bg-violet-500/10">
                        <GitBranch className="size-5 text-violet-600 dark:text-violet-400" />
                    </span>
                    <p className="text-sm font-semibold">No server-side runs yet</p>
                    <p className="max-w-md text-xs text-muted-foreground/60">
                        Enable <span className="font-mono">EVENTS_V3_TELEMETRY=true</span> in the backend
                        environment and restart the app. Runs will appear here as events fire.
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border border-border/70">
                    <table className="w-full table-fixed text-sm">
                        <thead>
                            <tr className="border-b border-border/70 bg-muted/30">
                                <th className="px-3 py-2 text-left font-mono text-[8px] uppercase tracking-widest text-muted-foreground/45">
                                    Status
                                </th>
                                <th className="px-3 py-2 text-left font-mono text-[8px] uppercase tracking-widest text-muted-foreground/45">
                                    Rule
                                </th>
                                <th className="hidden px-3 py-2 text-left font-mono text-[8px] uppercase tracking-widest text-muted-foreground/45 md:table-cell">
                                    Flow
                                </th>
                                <th className="hidden px-3 py-2 text-left font-mono text-[8px] uppercase tracking-widest text-muted-foreground/45 lg:table-cell">
                                    Latency
                                </th>
                                <th className="px-3 py-2 text-left font-mono text-[8px] uppercase tracking-widest text-muted-foreground/45">
                                    Started
                                </th>
                                <th className="w-8 px-3 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {runs.map((run) => (
                                <tr key={run.id} className="border-b border-border/50 last:border-b-0 hover:bg-muted/20">
                                    <td className="px-3 py-2 align-top">
                                        <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[8px]", statusClass(run.status))}>
                                            {run.status.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="min-w-0 px-3 py-2 align-top">
                                        <Link to={`/app/events/runs/${run.id}`} className="block min-w-0">
                                            <span className="block truncate text-[11.5px] font-medium text-foreground">
                                                {traceText(run, "rule_name") ?? run.flow_id}
                                            </span>
                                            <span className="block truncate font-mono text-[8.5px] text-muted-foreground/45">
                                                event {run.event_id.slice(0, 10)}…
                                            </span>
                                        </Link>
                                    </td>
                                    <td className="hidden px-3 py-2 align-top font-mono text-[9px] text-muted-foreground/50 md:table-cell">
                                        {run.flow_id}
                                    </td>
                                    <td className="hidden px-3 py-2 align-top font-mono text-[9px] text-muted-foreground/50 lg:table-cell">
                                        {run.latency_ms ?? "—"} ms
                                    </td>
                                    <td className="px-3 py-2 align-top font-mono text-[9px] text-muted-foreground/50">
                                        {formatRelativeTime(run.started_at)}
                                    </td>
                                    <td className="px-3 py-2 align-top">
                                        <Button asChild variant="ghost" size="icon-sm">
                                            <Link to={`/app/events/runs/${run.id}`} aria-label="Open run">
                                                <ChevronRight className="size-3.5" />
                                            </Link>
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
