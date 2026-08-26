import { ArrowRight, Power } from "lucide-react";
import { Link } from "react-router";
import { useAppSelector } from "@/store/hooks";
import { triggerRulesSelectors } from "@/store/slices/triggerRulesSlice";
import type { TriggerRule } from "@/types";
import { EventTypeBadge } from "@/components/common/events/event-badges";
import { formatDateTime } from "@/components/common/events/date-format";
import { Card, CardContent, CardHeader, CardTitle } from "@pes/ui/components/card";

function LatestRuleRow({ rule }: { rule: TriggerRule }) {
    return (
        <Link
            to={`/app/events/trigger-rules/${rule.id}/edit`}
            className="flex items-center gap-3 py-2 border-b border-border/40 last:border-b-0 hover:bg-muted/30 transition-colors rounded-md px-1 -mx-1"
        >
            <Power
                size={12}
                className={`shrink-0 ${rule.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/30"}`}
            />
            <span className="font-mono text-xs text-foreground truncate">{rule.name}</span>
            <EventTypeBadge type={rule.event_type} />
            <span className="ml-auto text-[10px] text-muted-foreground/50 font-mono whitespace-nowrap tabular-nums hidden sm:inline">
                {formatDateTime(rule.created_at)}
            </span>
        </Link>
    );
}

export default function LatestRulesList() {
    const rules = useAppSelector(state => triggerRulesSelectors.selectAll(state));

    // created_at desc; rules without a timestamp (legacy rows) go last
    const latest = [...rules]
        .sort((a, b) => {
            const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
            const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
            return tb - ta;
        })
        .slice(0, 3);

    return (
        <Card>
            <CardHeader className="flex flex-row justify-between items-center pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                    <span>Latest trigger rules</span>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-normal">last 3</span>
                </CardTitle>
                <Link
                    to="/app/events/trigger-rules"
                    className="flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                >
                    view all
                    <ArrowRight size={11} />
                </Link>
            </CardHeader>
            <CardContent className="pt-0">
                {latest.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground/40 italic">
                        No trigger rules yet
                    </p>
                ) : (
                    <div>
                        {latest.map(rule => <LatestRuleRow key={rule.id} rule={rule} />)}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
