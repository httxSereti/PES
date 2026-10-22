import { Activity, ArrowUpRight, ListChecks, Target, Zap, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { Card, CardContent } from "@pes/ui/components/card";
import { cn } from "@pes/ui/lib/utils";
import type { EventStats } from "@/lib/trigger-rules/event-stats";
import type { RuleHealthSummary } from "@/lib/trigger-rules/dashboard-data";

type Accent = "violet" | "emerald" | "sky" | "amber";

const ACCENT_TILE: Record<Accent, string> = {
    violet: "border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-400",
    emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    sky: "border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-400",
    amber: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

const ACCENT_BAR: Record<Accent, string> = {
    violet: "bg-violet-500",
    emerald: "bg-emerald-500",
    sky: "bg-sky-500",
    amber: "bg-amber-500",
};

function KpiCard({
    icon: Icon,
    accent,
    label,
    value,
    sub,
    to,
    progress,
}: {
    icon: LucideIcon;
    accent: Accent;
    label: string;
    value: React.ReactNode;
    sub: React.ReactNode;
    to: string;
    progress?: number;
}) {
    return (
        <Link to={to} className="group block">
            <Card className="h-full gap-0 overflow-hidden py-0 transition-colors group-hover:border-violet-500/40">
                <CardContent className="flex h-full flex-col gap-3 p-4 pb-3.5">
                    <div className="flex items-center gap-2">
                        <span
                            className={cn(
                                "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                                ACCENT_TILE[accent],
                            )}
                        >
                            <Icon size={15} />
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                            {label}
                        </span>
                        <ArrowUpRight
                            size={13}
                            className="ml-auto text-muted-foreground/25 transition-colors group-hover:text-violet-500"
                        />
                    </div>

                    <div className="min-w-0">
                        <div className="font-syne text-2xl font-extrabold leading-none tabular-nums text-foreground">
                            {value}
                        </div>
                        <div className="mt-1.5 truncate text-[11px] text-muted-foreground/60">{sub}</div>
                    </div>
                </CardContent>

                {progress !== undefined && (
                    <div className="h-0.5 w-full bg-muted">
                        <div
                            className={cn("h-full transition-[width] duration-500", ACCENT_BAR[accent])}
                            style={{
                                width: `${Math.min(100, Math.max(0, progress))}%`,
                            }}
                        />
                    </div>
                )}
            </Card>
        </Link>
    );
}

export default function DashboardStats({ stats, health }: { stats: EventStats; health: RuleHealthSummary }) {
    const activePct = health.total > 0 ? Math.round((health.enabled / health.total) * 100) : 0;

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
                icon={Activity}
                accent="violet"
                label="Events buffered"
                value={stats.buffer}
                sub={`${stats.rate}/min now · ${stats.bufferPct}% of ${stats.capacity} cap`}
                to="/app/events/triggered"
                progress={stats.bufferPct}
            />
            <KpiCard
                icon={Target}
                accent="emerald"
                label="Match rate"
                value={`${stats.firedPct}%`}
                sub={`${stats.fired} matched · ${stats.unmatched} unmatched`}
                to="/app/events/triggered"
                progress={stats.firedPct}
            />
            <KpiCard
                icon={ListChecks}
                accent="sky"
                label="Actions queued"
                value={stats.actions}
                sub={`${stats.rules} rule${stats.rules === 1 ? "" : "s"} fired recently`}
                to="/app/events/trigger-rules/triggered"
            />
            <KpiCard
                icon={Zap}
                accent="amber"
                label="Active rules"
                value={
                    <span>
                        {health.enabled}
                        <span className="ml-1 text-sm font-bold text-muted-foreground/40">/ {health.total}</span>
                    </span>
                }
                sub={`${activePct}% enabled · ${health.neverFiredEnabled} never fired`}
                to="/app/events/trigger-rules"
                progress={activePct}
            />
        </div>
    );
}
