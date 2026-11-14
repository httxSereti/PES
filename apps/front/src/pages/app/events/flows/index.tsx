import { useMemo, useState } from "react";
import { Link } from "react-router";
import { GitBranch, Plus, Search, SlidersHorizontal, Workflow, Zap } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { Input } from "@pes/ui/components/input";
import { cn } from "@pes/ui/lib/utils";

import { EventTypeBadge } from "@/components/common/events/event-badges";
import { eventTypesOf } from "@/lib/trigger-rules/rule-utils";
import { useAppSelector } from "@/store/hooks";
import { triggerRulesSelectors } from "@/store/slices/triggerRulesSlice";
import type { TriggerRule } from "@/types";

function FlowCard({ rule }: { rule: TriggerRule }) {
    const events = eventTypesOf(rule);
    const conditions = rule.conditions ?? [];

    return (
        <Link
            to={`/app/events/flows/${rule.id}`}
            className={cn(
                "group flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-4 transition-colors hover:border-violet-500/35 hover:bg-violet-500/[0.04]",
                !rule.enabled && "opacity-60",
            )}
        >
            <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-400">
                    <Workflow className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-foreground">{rule.name}</p>
                    <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground/60">
                        {rule.description || "No description"}
                    </p>
                </div>
                <span
                    className={cn(
                        "shrink-0 rounded border px-1.5 py-0.5 font-mono text-[8px]",
                        rule.enabled
                            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "border-border bg-muted/40 text-muted-foreground/60",
                    )}
                >
                    {rule.enabled ? "ACTIVE" : "PAUSED"}
                </span>
            </div>

            <div className="flex flex-wrap gap-1">
                {events.slice(0, 3).map((event) => (
                    <EventTypeBadge key={event} type={event} className="max-w-[190px]" />
                ))}
                {events.length > 3 && (
                    <span className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground/60">
                        +{events.length - 3}
                    </span>
                )}
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/50 pt-2 font-mono text-[9px] text-muted-foreground/50">
                <span className="flex items-center gap-1">
                    <GitBranch className="size-3" />
                    {conditions.length} condition{conditions.length === 1 ? "" : "s"}
                </span>
                <span className="flex items-center gap-1">
                    <SlidersHorizontal className="size-3" />
                    {rule.actions.length} action{rule.actions.length === 1 ? "" : "s"}
                </span>
                <span className="ml-auto text-violet-600 transition-transform group-hover:translate-x-0.5 dark:text-violet-300">
                    Open editor →
                </span>
            </div>
        </Link>
    );
}

export default function FlowsPage() {
    const rules = useAppSelector((state) => triggerRulesSelectors.selectAll(state));
    const [search, setSearch] = useState("");

    const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (!needle) return rules;
        return rules.filter((rule) => {
            const haystack = [
                rule.name,
                rule.description ?? "",
                ...eventTypesOf(rule),
                ...rule.labels.map((label) => label.name),
            ]
                .join(" ")
                .toLowerCase();
            return needle.split(/\s+/).every((term) => haystack.includes(term));
        });
    }, [rules, search]);

    return (
        <div className="space-y-4 px-4 md:px-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">
                        Events / Flows
                    </p>
                    <h2 className="text-lg font-semibold tracking-tight">Flows</h2>
                    <p className="text-xs text-muted-foreground/60">
                        Conditions, actions and amplifiers. Open a flow to edit it in the Composer.
                    </p>
                </div>
                <Button asChild size="sm">
                    <Link to="/app/events/flows/new">
                        <Plus className="mr-1.5 size-3.5" />
                        New flow
                    </Link>
                </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/40" />
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search flows, events, labels"
                        className="h-8 pl-8 font-mono text-[10px]"
                    />
                </div>
                <span className="font-mono text-[9px] text-muted-foreground/40">
                    {filtered.length} of {rules.length} flow{rules.length === 1 ? "" : "s"}
                </span>
            </div>

            {rules.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
                    <span className="flex size-11 items-center justify-center rounded-full border border-violet-500/25 bg-violet-500/10">
                        <Zap className="size-5 text-violet-600 dark:text-violet-400" />
                    </span>
                    <p className="text-sm font-semibold">No flows yet</p>
                    <p className="max-w-sm text-xs text-muted-foreground">
                        Create a flow to react to events with conditions, actions and amplifiers.
                    </p>
                    <Button asChild size="sm">
                        <Link to="/app/events/flows/new">Create your first flow</Link>
                    </Button>
                </div>
            ) : filtered.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border py-12 text-center text-xs text-muted-foreground/50">
                    No flow matches this search.
                </p>
            ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {filtered.map((rule) => (
                        <FlowCard key={rule.id} rule={rule} />
                    ))}
                </div>
            )}
        </div>
    );
}
