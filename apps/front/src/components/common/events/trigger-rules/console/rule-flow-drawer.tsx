import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight, ChevronRight, GitBranch, ShieldCheck, X, Zap, type LucideIcon } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { cn } from "@pes/ui/lib/utils";

import { EventTypeBadge } from "@/components/common/events/event-badges";
import { describeAction } from "@/lib/trigger-rules/describe-action";
import { eventTypesOf } from "@/lib/trigger-rules/rule-utils";
import type { TriggerAction, TriggerRule } from "@/types";

import { ActionTypeChip } from "./rule-action-chain";

function conditionText(condition: Record<string, unknown>): string {
    const field = String(condition.field ?? "field");
    const op = String(condition.op ?? "eq");
    const value = condition.value;
    const rendered = Array.isArray(value) ? value.join(", ") : String(value ?? "");
    return `${field} ${op}${rendered ? ` ${rendered}` : ""}`;
}

function modifierText(action: TriggerAction): string | null {
    const modifiers = Array.isArray(action.modifiers) ? action.modifiers : [];
    const scale = modifiers.find((modifier) => modifier?.type === "scale");
    if (!scale) return null;
    const fields = Array.isArray(scale.fields) ? scale.fields.map(String).join(", ") : "value";
    return `×${String(scale.factor ?? 2)} · ${fields}`;
}

function FlowNode({
    icon: Icon,
    kicker,
    children,
    tone = "violet",
}: {
    icon: LucideIcon;
    kicker: string;
    children: ReactNode;
    tone?: "violet" | "emerald" | "amber";
}) {
    const toneClass = {
        violet: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300",
        emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
        amber: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300",
    }[tone];

    return (
        <div className="relative pl-7">
            <span
                className={cn(
                    "absolute left-0 top-2 flex size-4 items-center justify-center rounded-full border",
                    toneClass,
                )}
            >
                <Icon className="size-2.5" />
            </span>
            <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40">
                {kicker}
            </p>
            <div className="mt-1.5 space-y-1.5">{children}</div>
        </div>
    );
}

export default function RuleFlowDrawer({
    rule,
    onClose,
}: {
    rule: TriggerRule | null;
    onClose: () => void;
}) {
    if (!rule) return null;

    const actions = [...rule.actions].sort((a, b) => a.sort_order - b.sort_order);
    const conditions = (rule.conditions ?? []) as Array<Record<string, unknown>>;

    return (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Flow preview for ${rule.name}`}>
            <button
                type="button"
                aria-label="Close flow preview"
                className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
                onClick={onClose}
            />
            <aside className="absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col border-l border-border bg-background shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
                    <div className="min-w-0">
                        <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/45">
                            Flow preview
                        </p>
                        <h2 className="mt-1 truncate text-lg font-semibold tracking-tight">{rule.name}</h2>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[9px] text-muted-foreground/50">
                            <span
                                className={cn(
                                    "rounded border px-1.5 py-0.5",
                                    rule.enabled
                                        ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                        : "border-border bg-muted/40",
                                )}
                            >
                                {rule.enabled ? "Active" : "Paused"}
                            </span>
                            <span>p{rule.priority}</span>
                            <span>{eventTypesOf(rule).length} event{eventTypesOf(rule).length === 1 ? "" : "s"}</span>
                        </div>
                    </div>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
                        <X className="size-4" />
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4">
                    <div className="relative space-y-6">
                        <div className="absolute bottom-5 left-[7px] top-5 w-px bg-border" />

                        <FlowNode icon={Zap} kicker="When" tone="violet">
                            <div className="flex flex-wrap gap-1">
                                {eventTypesOf(rule).map((type) => (
                                    <EventTypeBadge key={type} type={type} className="max-w-full" />
                                ))}
                            </div>
                        </FlowNode>

                        <FlowNode icon={ShieldCheck} kicker="If" tone="emerald">
                            {conditions.length === 0 ? (
                                <p className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground/60">
                                    No conditions. Every matching event runs the actions.
                                </p>
                            ) : (
                                conditions.map((condition, index) => (
                                    <div
                                        key={`${String(condition.field)}-${index}`}
                                        className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-2.5 py-2"
                                    >
                                        <GitBranch className="size-3 shrink-0 text-emerald-500" />
                                        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground/80">
                                            {conditionText(condition)}
                                        </span>
                                    </div>
                                ))
                            )}
                            {conditions.length > 0 && (
                                <p className="font-mono text-[8px] uppercase tracking-wide text-muted-foreground/40">
                                    Match {rule.condition_mode === "any" ? "any" : "all"}
                                </p>
                            )}
                        </FlowNode>

                        <FlowNode icon={ArrowRight} kicker="Then" tone="amber">
                            {actions.length === 0 ? (
                                <p className="rounded-lg border border-dashed border-border/70 px-2.5 py-2 text-[11px] text-muted-foreground/60">
                                    No actions configured.
                                </p>
                            ) : (
                                actions.map((action, index) => {
                                    const described = describeAction(action);
                                    const modifier = modifierText(action);
                                    return (
                                        <div
                                            key={action.id}
                                            className="rounded-lg border border-border/60 bg-background/40 px-2.5 py-2"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-violet-500/10 font-mono text-[8px] text-violet-700 dark:text-violet-300">
                                                    {index + 1}
                                                </span>
                                                <ActionTypeChip type={described.type} />
                                                <span className="ml-auto font-mono text-[8px] text-muted-foreground/45">
                                                    {described.duration}
                                                </span>
                                            </div>
                                            <p className="mt-1 truncate text-[11px] text-foreground/85">{described.title}</p>
                                            <p className="truncate font-mono text-[9px] text-muted-foreground/55">
                                                {described.detail}
                                            </p>
                                            {modifier && (
                                                <p className="mt-1 inline-flex rounded border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[8px] text-violet-700 dark:text-violet-300">
                                                    {modifier}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </FlowNode>
                    </div>

                    {rule.labels.length > 0 && (
                        <div className="mt-5 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-3">
                            <span className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40">
                                Labels
                            </span>
                            {rule.labels.map((label) => (
                                <span
                                    key={label.id}
                                    className="rounded border border-violet-500/25 bg-violet-500/10 px-1.5 py-px font-mono text-[9px] text-violet-700 dark:text-violet-300"
                                >
                                    {label.name}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="border-t border-border/70 p-4">
                    <Button asChild className="w-full">
                        <Link to={`/app/events/flows/${rule.id}`}>
                            Open full flow editor
                            <ChevronRight className="ml-1 size-4" />
                        </Link>
                    </Button>
                </div>
            </aside>
        </div>
    );
}
