import { Activity, Plus, Zap } from "lucide-react";
import { Link } from "react-router";
import { useAppSelector } from "@/store/hooks";
import { triggerRulesSelectors } from "@/store/slices/triggerRulesSlice";
import { Card, CardContent } from "@pes/ui/components/card";

function StatCard({ icon, value, label, sub }: {
    icon: React.ReactNode;
    value: React.ReactNode;
    label: string;
    sub?: React.ReactNode;
}) {
    return (
        <Card>
            <CardContent className="flex items-center gap-3.5 p-4">
                <div className="p-2.5 rounded-lg accent-tile shrink-0">
                    {icon}
                </div>
                <div className="min-w-0">
                    <div className="text-xl font-extrabold font-syne leading-tight text-foreground">{value}</div>
                    <div className="text-[11px] uppercase tracking-widest text-muted-foreground/50">{label}</div>
                    {sub && <div className="text-xs text-muted-foreground/70 mt-0.5">{sub}</div>}
                </div>
            </CardContent>
        </Card>
    );
}

export default function DashboardStats() {
    const eventsCount = useAppSelector(state => state.events.events.length);
    const rules = useAppSelector(state => triggerRulesSelectors.selectAll(state));
    const activeRules = rules.filter(r => r.enabled).length;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
                icon={<Activity size={16} className="accent-tile-icon" />}
                value={<span className="tabular-nums">{eventsCount}</span>}
                label="Triggered events"
                sub={
                    <Link to="/app/events/triggered" className="text-violet-600 dark:text-violet-400 hover:underline underline-offset-2">
                        view stream
                    </Link>
                }
            />

            <StatCard
                icon={<Zap size={16} className="accent-tile-icon" />}
                value={<span className="tabular-nums">{rules.length} <span className="text-sm text-muted-foreground/50 font-bold">/</span> <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">{activeRules}</span></span>}
                label="Trigger rules"
                sub={<span>{activeRules} active · {rules.length - activeRules} disabled</span>}
            />

            <Link to="/app/events/trigger-rules/new" className="group">
                <Card className="h-full transition-colors group-hover:border-violet-500/40">
                    <CardContent className="flex items-center gap-3.5 p-4">
                        <div className="p-2.5 rounded-lg accent-tile shrink-0">
                            <Plus size={16} className="accent-tile-icon" />
                        </div>
                        <div>
                            <div className="text-sm font-semibold text-foreground leading-tight">New trigger rule</div>
                            <div className="text-xs text-muted-foreground/70 mt-0.5">React to events automatically</div>
                        </div>
                    </CardContent>
                </Card>
            </Link>
        </div>
    );
}
