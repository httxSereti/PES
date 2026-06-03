import type { Route } from ".react-router/types/src/pages/app/admin/+types/dashboard";
import { useAppSelector } from "@/store/hooks";
import { triggerRulesSelectors } from "@/store/slices/triggerRulesSlice";
import { Link } from "react-router";
import TriggerRulesCard from "@/components/common/events/trigger-rules/trigger-rules-card";

// eslint-disable-next-line no-empty-pattern
export function meta({ }: Route.MetaArgs) {
    return [
        { title: "PES - Trigger Rules" },
        { name: "description", content: "Trigger rules and actions" },
    ];
}

export default function TriggerRulesPage() {
    // const triggerRules = useAppSelector(state => state.triggerRules.entities);
    const triggerRules = useAppSelector(state => triggerRulesSelectors.selectAll(state));

    return (
        <div className="space-y-3 px-5 w-full">
            {triggerRules.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground/40 italic">
                    No trigger rules have fired yet
                </div>
            ) : (
                <>
                    <div className="ml-auto justify-between flex items-center">
                        <div className="flex items-center gap-2 text-xs text-slate-50">
                            <div className="text-xs text-muted-foreground/50 pb-1">
                                {triggerRules.length} rule{triggerRules.length > 1 ? "s" : ""} available
                            </div>
                        </div>
                        <Link to="/app/events/trigger-rules/triggered" className="flex items-center gap-2 text-xs text-muted-foreground/70">
                            <span>view history</span>
                        </Link>
                    </div>
                    {triggerRules.map((triggerRule) => (
                        <TriggerRulesCard key={triggerRule.id} triggerRule={triggerRule} />
                    ))}
                </>
            )}
        </div>
    );
}
