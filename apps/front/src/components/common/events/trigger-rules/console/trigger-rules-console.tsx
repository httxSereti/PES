import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { SearchX, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@pes/ui/components/button";
import { cn } from "@pes/ui/lib/utils";

import { useEventCatalog } from "@/components/common/events/event-groups";
import { ConfirmDeleteDialog } from "@/components/common/dialogs/confirm-delete-dialog";
import { useWebSocket } from "@/hooks/useWebSocket";
import { describeAction } from "@/lib/trigger-rules/describe-action";
import { buildRuleStats } from "@/lib/trigger-rules/rule-stats";
import { eventTypesOf } from "@/lib/trigger-rules/rule-utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
    triggerRuleAdded,
    triggerRuleRemoved,
    triggerRulesSelectors,
    triggerRuleUpdated,
} from "@/store/slices/triggerRulesSlice";
import type { TriggerRule } from "@/types";

import { RuleCard, RuleRow } from "./trigger-rule-row";
import {
    TriggerRulesToolbar,
    type RuleSort,
    type RuleSourceOption,
    type RuleStatusFilter,
} from "./trigger-rules-toolbar";

const SOURCE_LABELS: Record<string, string> = {
    chaster: "Chaster",
    puryfi: "PuryFi",
    sensors: "Sensors",
    sensor: "Sensors",
    units: "Core",
    unit: "Core",
    custom: "Custom",
    other: "Other",
};

/** Best-effort source id for events not present in the live catalog. */
function fallbackSourceId(eventType: string): string {
    if (eventType.startsWith("custom:")) return "custom";
    if (eventType.startsWith("sensor")) return "sensors";
    if (eventType.startsWith("unit")) return "units";
    return eventType.split("_")[0] || "other";
}

function duplicateName(name: string): string {
    const suffix = " (copy)";
    const maxLength = 64;
    if (name.length + suffix.length <= maxLength) return `${name}${suffix}`;
    return `${name.slice(0, maxLength - suffix.length)}${suffix}`;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "An error has occurred";
}

export default function TriggerRulesConsole() {
    const dispatch = useAppDispatch();
    const { sendCommand } = useWebSocket();

    const rules = useAppSelector((state) => triggerRulesSelectors.selectAll(state));
    const events = useAppSelector((state) => state.events.events);
    const { events: eventCatalog } = useEventCatalog();

    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<RuleStatusFilter>("all");
    const [source, setSource] = useState("all");
    const [sort, setSort] = useState<RuleSort>("priority");
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<TriggerRule | null>(null);
    const [deleting, setDeleting] = useState(false);

    const searchRef = useRef<HTMLInputElement>(null);

    // Relative timestamps ("2m ago") need a nudge even when no event arrives.
    const [, setClock] = useState(0);
    useEffect(() => {
        const timer = window.setInterval(() => setClock((value) => value + 1), 30_000);
        return () => window.clearInterval(timer);
    }, []);

    // ⌘K / Ctrl+K focuses the search input.
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                searchRef.current?.focus();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    const stats = useMemo(() => buildRuleStats(events), [events]);

    const counts = useMemo(
        () => ({
            all: rules.length,
            enabled: rules.filter((rule) => rule.enabled).length,
            disabled: rules.filter((rule) => !rule.enabled).length,
        }),
        [rules],
    );

    const sourceOf = useCallback(
        (eventType: string) => eventCatalog[eventType]?.integrationId ?? fallbackSourceId(eventType),
        [eventCatalog],
    );

    const sourceOptions = useMemo<RuleSourceOption[]>(() => {
        const sources = new Map<string, RuleSourceOption>();

        for (const rule of rules) {
            const seen = new Set<string>();
            for (const type of eventTypesOf(rule)) {
                const id = sourceOf(type);
                if (seen.has(id)) continue;
                seen.add(id);

                const existing = sources.get(id);
                if (existing) {
                    existing.count += 1;
                } else {
                    sources.set(id, {
                        id,
                        label: eventCatalog[type]?.integrationName ?? SOURCE_LABELS[id] ?? id,
                        count: 1,
                    });
                }
            }
        }

        return Array.from(sources.values()).sort((a, b) => a.label.localeCompare(b.label));
    }, [rules, eventCatalog, sourceOf]);

    const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase();

        const matching = rules.filter((rule) => {
            if (status === "enabled" && !rule.enabled) return false;
            if (status === "disabled" && rule.enabled) return false;

            const types = eventTypesOf(rule);

            if (source !== "all" && !types.some((type) => sourceOf(type) === source)) {
                return false;
            }

            if (!needle) return true;

            const actionText = rule.actions
                .map((action) => {
                    const described = describeAction(action);
                    return `${action.action_type} ${described.title} ${described.detail}`;
                })
                .join(" ");

            const haystack = [
                rule.name,
                rule.description ?? "",
                rule.labels.map((label) => label.name).join(" "),
                types.join(" "),
                actionText,
            ]
                .join("\n")
                .toLowerCase();

            return needle.split(/\s+/).every((term) => haystack.includes(term));
        });

        const lastFiredAt = (rule: TriggerRule) => {
            const value = stats.get(rule.id)?.lastFired;
            if (!value) return 0;
            const time = new Date(value).getTime();
            return Number.isNaN(time) ? 0 : time;
        };

        const updatedAt = (rule: TriggerRule) => {
            if (!rule.updated_at) return 0;
            const time = new Date(rule.updated_at).getTime();
            return Number.isNaN(time) ? 0 : time;
        };

        return [...matching].sort((a, b) => {
            switch (sort) {
                case "recent":
                    return (
                        lastFiredAt(b) - lastFiredAt(a) ||
                        b.priority - a.priority ||
                        a.name.localeCompare(b.name)
                    );
                case "updated":
                    return updatedAt(b) - updatedAt(a) || a.name.localeCompare(b.name);
                case "name":
                    return a.name.localeCompare(b.name);
                default:
                    return (
                        b.priority - a.priority ||
                        lastFiredAt(b) - lastFiredAt(a) ||
                        a.name.localeCompare(b.name)
                    );
            }
        });
    }, [rules, status, source, search, sort, stats, sourceOf]);

    const resetFilters = () => {
        setSearch("");
        setStatus("all");
        setSource("all");
    };

    const toggleEnabled = useCallback(
        async (rule: TriggerRule) => {
            const next = !rule.enabled;

            dispatch(triggerRuleUpdated({ id: rule.id, changes: { enabled: next } }));

            try {
                const result = await sendCommand("trigger_rules:update", {
                    rule_id: rule.id,
                    enabled: next,
                });
                if (result.status !== "ok") {
                    throw new Error(result.message ?? "Server rejected the update");
                }
            } catch (error) {
                // Revert the optimistic toggle.
                dispatch(triggerRuleUpdated({ id: rule.id, changes: { enabled: rule.enabled } }));
                toast.error("Can't update trigger rule status", {
                    description: errorMessage(error),
                    position: "top-right",
                });
            }
        },
        [dispatch, sendCommand],
    );

    const duplicateRule = useCallback(
        async (rule: TriggerRule) => {
            try {
                const result = await sendCommand("trigger_rules:create", {
                    name: duplicateName(rule.name),
                    description: rule.description,
                    event_types: eventTypesOf(rule),
                    // Duplicates start paused so they cannot double-trigger hardware.
                    enabled: false,
                    priority: rule.priority,
                    labels: rule.labels.map((label) => label.name),
                    actions: [...rule.actions]
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((action, index) => ({
                            action_type: action.action_type,
                            payload: action.payload,
                            duration: action.duration,
                            cumulative: action.cumulative,
                            sort_order: index,
                        })),
                });

                if (result.status !== "ok" || !result.rule) {
                    throw new Error(result.message ?? "Server rejected the duplicate");
                }

                dispatch(triggerRuleAdded(result.rule));
                toast.success(`Duplicated '${rule.name}'`, {
                    description: "The copy was created paused so it cannot double-trigger hardware.",
                    position: "bottom-right",
                });
            } catch (error) {
                toast.error("Can't duplicate trigger rule", {
                    description: errorMessage(error),
                    position: "top-right",
                });
            }
        },
        [dispatch, sendCommand],
    );

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        const target = deleteTarget;

        setDeleting(true);
        try {
            const result = await sendCommand("trigger_rules:delete", { rule_id: target.id });
            if (result.status !== "ok") {
                throw new Error(result.message ?? "Server rejected the delete");
            }

            dispatch(triggerRuleRemoved(target.id));
            if (expandedId === target.id) setExpandedId(null);
            setDeleteTarget(null);

            toast.success(`Trigger rule '${target.name}' deleted`, {
                position: "bottom-right",
            });
        } catch (error) {
            toast.error("Can't delete trigger rule", {
                description: errorMessage(error),
                position: "top-right",
            });
        } finally {
            setDeleting(false);
        }
    };

    const rowProps = (rule: TriggerRule) => ({
        rule,
        stats: stats.get(rule.id),
        expanded: expandedId === rule.id,
        onToggleExpanded: () =>
            setExpandedId((current) => (current === rule.id ? null : rule.id)),
        onToggleEnabled: () => void toggleEnabled(rule),
        onDuplicate: () => void duplicateRule(rule),
        onDelete: () => setDeleteTarget(rule),
    });

    return (
        <div className="space-y-3 px-4 md:px-5">
            <TriggerRulesToolbar
                search={search}
                onSearchChange={setSearch}
                status={status}
                onStatusChange={setStatus}
                source={source}
                onSourceChange={setSource}
                sort={sort}
                onSortChange={setSort}
                sources={sourceOptions}
                counts={counts}
                searchRef={searchRef}
            />

            {rules.length === 0 ? (
                <EmptyState />
            ) : filtered.length === 0 ? (
                <NoMatchState onReset={resetFilters} />
            ) : (
                <>
                    <div className="hidden overflow-x-auto rounded-xl border border-border lg:block">
                        <table className="w-full min-w-[1040px] table-fixed text-sm">
                            <colgroup>
                                <col style={{ width: 60 }} />
                                <col />
                                <col style={{ width: 220 }} />
                                <col style={{ width: 310 }} />
                                <col style={{ width: 44 }} />
                                <col style={{ width: 128 }} />
                                <col style={{ width: 48 }} />
                            </colgroup>
                            <thead>
                                <tr className="border-b border-border bg-muted/40">
                                    <th scope="col" aria-label="Enabled" className="py-2.5 pr-2 pl-4" />
                                    {["Rule", "When", "Then", "P", "Last fired"].map((label) => (
                                        <th
                                            key={label}
                                            scope="col"
                                            className={cn(
                                                "py-2.5 pr-3 text-left text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50",
                                                (label === "P" || label === "Last fired") && "pl-2",
                                            )}
                                        >
                                            {label}
                                        </th>
                                    ))}
                                    <th scope="col" aria-label="Actions" className="py-2.5 pr-4" />
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((rule) => (
                                    <RuleRow key={rule.id} {...rowProps(rule)} />
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex flex-col gap-2 lg:hidden">
                        {filtered.map((rule) => (
                            <RuleCard key={rule.id} {...rowProps(rule)} />
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1 font-mono text-[9px] text-muted-foreground/45">
                        <span>
                            {filtered.length} of {rules.length} rules · {counts.enabled} enabled ·{" "}
                            {counts.disabled} paused
                        </span>
                        <span className="hidden sm:inline">
                            Firing counts cover the last 250 events · Row click expands
                        </span>
                    </div>
                </>
            )}

            <ConfirmDeleteDialog
                open={deleteTarget !== null}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null);
                }}
                title="Delete trigger rule"
                description={
                    deleteTarget
                        ? `Delete "${deleteTarget.name}" and its ${deleteTarget.actions.length} action${
                              deleteTarget.actions.length === 1 ? "" : "s"
                          }? This cannot be undone.`
                        : undefined
                }
                warning={
                    deleteTarget?.enabled
                        ? "This rule is currently enabled and will stop firing immediately."
                        : null
                }
                busy={deleting}
                onConfirm={() => void confirmDelete()}
            />
        </div>
    );
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
            <span className="flex size-11 items-center justify-center rounded-full border border-violet-500/25 bg-violet-500/10">
                <Zap className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </span>
            <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">No trigger rules yet</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                    Create a rule to react to Chaster, PuryFi or sensor events with stimulation actions.
                </p>
            </div>
            <Button asChild size="sm">
                <Link to="/app/events/trigger-rules/new">Create your first rule</Link>
            </Button>
        </div>
    );
}

function NoMatchState({ onReset }: { onReset: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-14 text-center">
            <SearchX className="h-5 w-5 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No rules match these filters.</p>
            <Button type="button" variant="ghost" size="sm" onClick={onReset}>
                Clear filters
            </Button>
        </div>
    );
}
