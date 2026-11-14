import { ChevronRight, GitBranch, SlidersHorizontal, Workflow, Zap } from "lucide-react";

import { EventTypeBadge } from "@/components/common/events/event-badges";
import { cn } from "@pes/ui/lib/utils";

import { actionSummary, conditionSummary, type ActionValues, type ConditionValues } from "./schema";

function Column({
    icon: Icon,
    label,
    count,
    tone,
    children,
}: {
    icon: typeof Zap;
    label: string;
    count: number;
    tone: "violet" | "emerald" | "amber";
    children: React.ReactNode;
}) {
    const toneClass = {
        violet: "border-violet-500/25 bg-violet-500/[0.06] text-violet-600 dark:text-violet-300",
        emerald: "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-600 dark:text-emerald-300",
        amber: "border-amber-500/25 bg-amber-500/[0.06] text-amber-600 dark:text-amber-300",
    }[tone];

    return (
        <div className={cn("min-w-0 flex-1 rounded-lg border p-2.5", toneClass)}>
            <div className="flex items-center gap-1.5">
                <Icon className="size-3" />
                <span className="font-mono text-[8px] uppercase tracking-widest">{label}</span>
                <span className="ml-auto font-mono text-[8px] opacity-50">{count}</span>
            </div>
            <div className="mt-1.5 space-y-1">{children}</div>
        </div>
    );
}

function Arrow() {
    return (
        <div className="flex items-center justify-center text-muted-foreground/25">
            <ChevronRight className="size-4 rotate-90 md:rotate-0" />
        </div>
    );
}

export default function FlowMap({
    eventTypes,
    conditions,
    actions,
}: {
    eventTypes: string[];
    conditions: ConditionValues[];
    actions: ActionValues[];
}) {
    return (
        <div className="rounded-xl border border-border/70 bg-muted/10 p-3">
            <div className="mb-2 flex items-center gap-2">
                <Workflow className="size-3.5 text-violet-500 dark:text-violet-400" />
                <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                    Flow map
                </p>
                <span className="rounded border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[8px] text-violet-600 dark:text-violet-300">
                    live
                </span>
            </div>
            <div className="flex flex-col gap-1.5 md:flex-row md:items-stretch">
                <Column icon={Zap} label="When" count={eventTypes.length} tone="violet">
                    {eventTypes.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground/50">Choose an event</p>
                    ) : (
                        <div className="flex flex-wrap gap-1">
                            {eventTypes.slice(0, 2).map((type) => (
                                <EventTypeBadge key={type} type={type} className="max-w-[190px]" />
                            ))}
                            {eventTypes.length > 2 && (
                                <span className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[8px] text-muted-foreground/60">
                                    +{eventTypes.length - 2}
                                </span>
                            )}
                        </div>
                    )}
                </Column>
                <Arrow />
                <Column icon={GitBranch} label="If" count={conditions.length} tone="emerald">
                    {conditions.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground/50">Always run</p>
                    ) : (
                        conditions.slice(0, 2).map((condition, index) => (
                            <p
                                key={`${condition.field}-${index}`}
                                className="truncate font-mono text-[9px] text-foreground/75"
                            >
                                {conditionSummary(condition)}
                            </p>
                        ))
                    )}
                </Column>
                <Arrow />
                <Column icon={SlidersHorizontal} label="Then" count={actions.length} tone="amber">
                    {actions.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground/50">Add an action</p>
                    ) : (
                        actions.slice(0, 2).map((action, index) => (
                            <p
                                key={`${action.action_type}-${index}`}
                                className="truncate font-mono text-[9px] text-foreground/75"
                            >
                                {actionSummary(action)}
                            </p>
                        ))
                    )}
                </Column>
            </div>
        </div>
    );
}
