import type { TriggerAction } from "@/types/events.types";
import { describeAction, actionTone, type ActionTone } from "@/lib/trigger-rules/describe-action";
import { cn } from "@pes/ui/lib/utils";

const TONE_CHIP: Record<ActionTone, string> = {
    violet: "border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-300",
    emerald: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    amber: "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300",
    sky: "border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300",
    pink: "border-pink-500/30 bg-pink-500/15 text-pink-700 dark:text-pink-300",
    slate: "border-border bg-muted/40 text-muted-foreground",
};

function ordered(actions: TriggerAction[]): TriggerAction[] {
    return [...actions].sort((a, b) => a.sort_order - b.sort_order);
}

/** Colored action-type chip shared by the console and the history page. */
export function ActionTypeChip({ type, className }: { type: string; className?: string }) {
    return (
        <span
            className={cn(
                "shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-medium",
                TONE_CHIP[actionTone(type)],
                className,
            )}
        >
            {type}
        </span>
    );
}

/** Compact chain used in the table cell and mobile card. */
export function RuleActionChainCompact({
    actions,
    limit = 2,
}: {
    actions: TriggerAction[];
    limit?: number;
}) {
    if (actions.length === 0) {
        return <span className="text-[11px] text-muted-foreground/45 italic">No actions</span>;
    }

    const list = ordered(actions);
    const visible = list.slice(0, limit);
    const hidden = list.length - visible.length;

    return (
        <div className="space-y-1">
            {visible.map((action, index) => {
                const described = describeAction(action);
                return (
                    <div key={action.id} className="flex items-center gap-1.5 text-[11px]">
                        <span className="w-2.5 shrink-0 font-mono text-[9px] text-muted-foreground/45">
                            {index + 1}
                        </span>
                        <span className="min-w-0 truncate text-foreground/80">{described.title}</span>
                        <span className="ml-auto shrink-0 font-mono text-[9px] text-muted-foreground/45">
                            {described.duration}
                        </span>
                    </div>
                );
            })}
            {hidden > 0 && (
                <div className="pl-4 font-mono text-[9px] text-violet-600/80 dark:text-violet-300/80">
                    +{hidden} more step{hidden === 1 ? "" : "s"}
                </div>
            )}
        </div>
    );
}

/** Expanded, readable chain used in the detail panel and mobile card. */
export function RuleActionChainDetailed({ actions }: { actions: TriggerAction[] }) {
    if (actions.length === 0) {
        return (
            <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground/50 italic">
                This rule has no actions yet.
            </p>
        );
    }

    return (
        <div className="space-y-1.5">
            {ordered(actions).map((action, index) => {
                const described = describeAction(action);
                return (
                    <div
                        key={action.id}
                        className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-background/40 px-2.5 py-2"
                    >
                        <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-violet-500/10 font-mono text-[9px] text-violet-700 dark:text-violet-300">
                            {index + 1}
                        </span>
                        <ActionTypeChip type={described.type} />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-foreground">{described.title}</p>
                            <p className="truncate font-mono text-[9px] text-muted-foreground/55">
                                {described.detail}
                            </p>
                        </div>
                        <div className="shrink-0 text-right font-mono text-[9px] leading-4">
                            <div className="text-foreground/80">{described.duration}</div>
                            <div className="text-muted-foreground/45">{described.mode}</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
