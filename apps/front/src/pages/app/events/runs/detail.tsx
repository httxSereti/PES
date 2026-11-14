import { Link, useParams } from "react-router";
import { ArrowLeft, CheckCircle2, Clock3, GitBranch, Loader2, Play, RefreshCw, XCircle } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { cn } from "@pes/ui/lib/utils";

import { formatDateTime } from "@/lib/format-date";
import { useEventReplay, useFlowRun } from "@/hooks/useFlowRuns";

function statusIcon(status: string) {
    if (status === "passed" || status === "planned" || status === "matched") {
        return <CheckCircle2 className="size-3.5 text-emerald-500" />;
    }
    if (status === "skipped") return <Clock3 className="size-3.5 text-amber-500" />;
    return <XCircle className="size-3.5 text-destructive" />;
}

function JsonPreview({ value }: { value: unknown }) {
    if (!value) return <span className="text-muted-foreground/35">—</span>;
    return (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-[8.5px] leading-4 text-muted-foreground/65">
            {JSON.stringify(value, null, 2)}
        </pre>
    );
}

export default function FlowRunDetailPage() {
    const { id } = useParams();
    const { run, loading, error, reload } = useFlowRun(id);
    const replay = useEventReplay();

    if (loading && !run) {
        return (
            <div className="flex items-center justify-center py-20 text-muted-foreground/50">
                <Loader2 className="mr-2 size-4 animate-spin" />
                Loading run…
            </div>
        );
    }

    if (error || !run) {
        return (
            <div className="px-5 py-16 text-center">
                <p className="text-sm text-destructive">{error ?? "Flow run not found"}</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link to="/app/events/runs">Back to runs</Link>
                </Button>
            </div>
        );
    }

    const ruleName = typeof run.trace?.rule_name === "string" ? run.trace.rule_name : run.flow_id;

    return (
        <div className="space-y-4 px-4 md:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Button asChild variant="ghost" size="sm">
                    <Link to="/app/events/runs">
                        <ArrowLeft className="mr-1.5 size-3.5" />
                        Back to runs
                    </Link>
                </Button>
                <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
                        <RefreshCw className="mr-1.5 size-3.5" />
                        Refresh
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => void replay.replay(run.event_id)}
                        disabled={replay.loading}
                    >
                        {replay.loading ? (
                            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                        ) : (
                            <Play className="mr-1.5 size-3.5" />
                        )}
                        Replay dry-run
                    </Button>
                </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-card/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">
                            Flow run
                        </p>
                        <h2 className="truncate text-lg font-semibold tracking-tight">{ruleName}</h2>
                        <p className="mt-0.5 font-mono text-[9px] text-muted-foreground/45">
                            {run.flow_id} · v{run.flow_version} · {run.id}
                        </p>
                    </div>
                    <span
                        className={cn(
                            "rounded border px-2 py-1 font-mono text-[9px]",
                            run.status === "matched"
                                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                        )}
                    >
                        {run.status.toUpperCase()}
                    </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[9px] md:grid-cols-4">
                    <div>
                        <p className="text-muted-foreground/40">EVENT</p>
                        <p className="truncate text-foreground/75">{run.event_id}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground/40">STARTED</p>
                        <p className="text-foreground/75">{formatDateTime(run.started_at)}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground/40">LATENCY</p>
                        <p className="text-foreground/75">{run.latency_ms ?? "—"} ms</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground/40">NODES / EFFECTS</p>
                        <p className="text-foreground/75">
                            {run.node_runs.length} / {run.effects.length}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <section className="rounded-xl border border-border/70 bg-card/40 p-3">
                    <div className="flex items-center gap-2">
                        <GitBranch className="size-3.5 text-violet-500" />
                        <h3 className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                            Node trace
                        </h3>
                    </div>
                    <div className="mt-2 space-y-1.5">
                        {run.node_runs.map((node) => (
                            <div key={node.id} className="rounded-lg border border-border/60 bg-background/40 p-2">
                                <div className="flex items-center gap-2">
                                    {statusIcon(node.status)}
                                    <span className="font-mono text-[9px] text-foreground/80">{node.node_id}</span>
                                    <span className="ml-auto font-mono text-[8px] text-muted-foreground/40">
                                        {node.node_type}
                                    </span>
                                </div>
                                {node.reason && (
                                    <p className="mt-1 font-mono text-[8px] text-amber-600 dark:text-amber-400">
                                        {node.reason}
                                    </p>
                                )}
                                <div className="mt-1 grid gap-1 md:grid-cols-2">
                                    <JsonPreview value={node.input_preview} />
                                    <JsonPreview value={node.output_preview} />
                                </div>
                            </div>
                        ))}
                        {run.node_runs.length === 0 && (
                            <p className="py-6 text-center text-[11px] text-muted-foreground/40">No node trace.</p>
                        )}
                    </div>
                </section>

                <section className="rounded-xl border border-border/70 bg-card/40 p-3">
                    <div className="flex items-center gap-2">
                        <Clock3 className="size-3.5 text-emerald-500" />
                        <h3 className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                            Effect ledger
                        </h3>
                    </div>
                    <div className="mt-2 space-y-1.5">
                        {run.effects.map((effect) => (
                            <div key={effect.id} className="rounded-lg border border-border/60 bg-background/40 p-2">
                                <div className="flex items-center gap-2">
                                    {statusIcon(effect.status)}
                                    <span className="font-mono text-[9px] text-foreground/80">{effect.effect_kind}</span>
                                    <span className="ml-auto font-mono text-[8px] text-muted-foreground/40">
                                        {effect.status}
                                    </span>
                                </div>
                                <div className="mt-1 grid gap-1 md:grid-cols-2">
                                    <div>
                                        <p className="font-mono text-[7px] uppercase tracking-widest text-muted-foreground/35">
                                            Before
                                        </p>
                                        <JsonPreview value={effect.params_before} />
                                    </div>
                                    <div>
                                        <p className="font-mono text-[7px] uppercase tracking-widest text-muted-foreground/35">
                                            After
                                        </p>
                                        <JsonPreview value={effect.params_after} />
                                    </div>
                                </div>
                                {effect.modifiers && effect.modifiers.length > 0 && (
                                    <p className="mt-1 font-mono text-[8px] text-violet-600 dark:text-violet-300">
                                        modifiers: {JSON.stringify(effect.modifiers)}
                                    </p>
                                )}
                            </div>
                        ))}
                        {run.effects.length === 0 && (
                            <p className="py-6 text-center text-[11px] text-muted-foreground/40">No effect planned.</p>
                        )}
                    </div>
                </section>
            </div>

            {replay.result && (
                <section className="rounded-xl border border-violet-500/25 bg-violet-500/[0.04] p-3">
                    <p className="font-mono text-[9px] uppercase tracking-widest text-violet-600 dark:text-violet-300">
                        Replay result
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                        {String((replay.result.counts as { actions?: number } | undefined)?.actions ?? 0)} action(s),
                        {" "}
                        {String((replay.result.counts as { rules?: number } | undefined)?.rules ?? 0)} rule(s).
                    </p>
                    <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-border/60 bg-background/50 p-2 font-mono text-[8.5px] leading-4 text-muted-foreground/70">
                        {JSON.stringify(replay.result, null, 2)}
                    </pre>
                </section>
            )}
            {replay.error && <p className="text-xs text-destructive">{replay.error}</p>}
        </div>
    );
}
