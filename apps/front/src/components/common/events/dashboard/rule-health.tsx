import { ArrowRight, History, Plus, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@pes/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pes/ui/components/card";
import { cn } from "@pes/ui/lib/utils";
import type { RuleHealthSummary } from "@/lib/trigger-rules/dashboard-data";

function HealthRow({ label, value, dot }: { label: string; value: number; dot: string }) {
    return (
        <div className="flex items-center gap-2 text-[11px]">
            <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />
            <span className="text-muted-foreground/65">{label}</span>
            <span className="ml-auto font-mono font-medium tabular-nums text-foreground/80">{value}</span>
        </div>
    );
}

function insight(health: RuleHealthSummary): string {
    if (health.total === 0) {
        return "No trigger rules yet. Create one to react to Chaster, PuryFi or sensor events automatically.";
    }
    if (health.neverFiredEnabled > 0) {
        return `${health.neverFiredEnabled} enabled rule${health.neverFiredEnabled === 1 ? "" : "s"} haven't fired in the last 250 events. Check the trigger conditions.`;
    }
    if (health.paused > 0) {
        return `${health.paused} rule${health.paused === 1 ? " is" : "s are"} paused and won't react until re-enabled.`;
    }
    return "Every enabled rule has fired in the recent event buffer. Everything looks healthy.";
}

export default function RuleHealth({ health }: { health: RuleHealthSummary }) {
    const activePct = health.total > 0 ? Math.round((health.enabled / health.total) * 100) : 0;

    return (
        <Card className="h-full gap-0 py-0">
            <CardHeader className="flex flex-row items-center justify-between gap-3 px-5 pb-4 pt-5">
                <CardTitle className="flex items-center gap-2 text-sm">
                    <ShieldCheck size={14} className="text-emerald-500" />
                    Rule health
                </CardTitle>
                <Link
                    to="/app/events/trigger-rules"
                    className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground/70 transition-colors hover:text-violet-600 dark:hover:text-violet-400"
                >
                    manage
                    <ArrowRight size={11} />
                </Link>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-4 px-5 pb-5">
                <div className="flex items-center gap-4">
                    <div
                        className="relative size-24 shrink-0 rounded-full"
                        role="img"
                        aria-label={`${health.enabled} of ${health.total} trigger rules are active`}
                        style={{
                            background: `conic-gradient(#8b5cf6 0 ${activePct}%, var(--border) ${activePct}% 100%)`,
                        }}
                    >
                        <div className="absolute inset-[6px] flex flex-col items-center justify-center rounded-full bg-card">
                            <span className="font-syne text-xl font-extrabold leading-none tabular-nums text-foreground">
                                {health.enabled}
                            </span>
                            <span className="mt-0.5 text-[8px] uppercase tracking-widest text-muted-foreground/45">
                                active
                            </span>
                        </div>
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                        <HealthRow label="Active" value={health.enabled} dot="bg-emerald-500" />
                        <HealthRow label="Paused" value={health.paused} dot="bg-muted-foreground/30" />
                        <HealthRow label="Fired in buffer" value={health.fired} dot="bg-violet-500" />
                        <HealthRow label="Never fired" value={health.neverFiredEnabled} dot="bg-amber-500" />
                    </div>
                </div>

                <p className="rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground/65">
                    {insight(health)}
                </p>

                <div className="mt-auto flex flex-wrap items-center gap-2">
                    <Button asChild size="sm" className="gap-1.5">
                        <Link to="/app/events/trigger-rules/new">
                            <Plus size={13} />
                            New rule
                        </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="gap-1.5">
                        <Link to="/app/events/trigger-rules/triggered">
                            <History size={13} />
                            Rule history
                        </Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
