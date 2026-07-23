import type { TriggerAction, TriggerRule } from "@/types/events.types";

export function TriggerActionProfile({ triggerAction }: { triggerAction: TriggerAction }) {
    return (
        <div className="flex font-mono text-sm gap-2">
            Execute Profile: {triggerAction.payload['profile'] as string} for {triggerAction.duration} seconds
            <span className="text-muted-foreground/50">({triggerAction.cumulative ? "cumulative" : "wait"})</span>
        </div>
    )
}

export function TriggerActionLevel({ triggerAction }: { triggerAction: TriggerAction }) {
    return (
        <div className="flex font-mono text-sm gap-2">
            Apply: {triggerAction.payload['value'] as string} on {triggerAction.payload['units'] as string} ({triggerAction.payload['channels'] as string}) for {triggerAction.duration} seconds
            <span className="text-muted-foreground/50">({triggerAction.cumulative ? "cumulative" : "wait"})</span>
        </div>
    )
}

export default function TriggerRulesAction({ triggerRule, triggerAction }: { triggerRule: TriggerRule, triggerAction: TriggerAction }) {

    // console.log(triggerAction)

    return (
        <div className={`flex gap-2 rounded-lg border px-3 pt-2.5 pb-3 border-border/50 bg-muted/30`}>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border font-mono bg-violet-500/15 text-violet-700 border-violet-500/30 dark:text-violet-300`}>
                {triggerAction.action_type}
            </span>
            {triggerAction.action_type === "PROFILE"
                ? <TriggerActionProfile triggerAction={triggerAction} />
                : <TriggerActionLevel triggerAction={triggerAction} />
            }

        </div>
    )
}