import TriggerRulesAction from "@/components/common/events/trigger-rules/actions/trigger-rules-action";
import type { TriggerRule } from "@/types/events.types";
import { Separator } from "@pes/ui/components/separator";

export default function TriggerRulesActions({ triggerRule }: { triggerRule: TriggerRule }) {
    return (
        <div className={`rounded-lg border px-3 pt-2.5 pb-3 border-border/50 bg-muted/30`}>
            <div className="flex justify-between items-start mb-1">
                <span className="font-mono text-[10px] text-muted-foreground/40 tracking-widest uppercase">Actions</span>
                <span className={`font-mono text-xs text-muted-foreground/30`}>{triggerRule.actions.length} actions</span>
            </div>
            <Separator className="my-3" />

            <div className="space-y-3">
                {triggerRule.actions.length > 0
                    ? [...triggerRule.actions].sort((a, b) => b.sort_order - a.sort_order).map((action) => (
                        <TriggerRulesAction key={action.id} triggerRule={triggerRule} triggerAction={action} />
                    ))
                    : ('no actions')
                }

            </div>
        </div>
    )
}