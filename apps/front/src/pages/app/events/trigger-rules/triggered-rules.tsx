import type { Route } from ".react-router/types/src/pages/app/events/trigger-rules/+types/triggered-rules";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
    Activity,
    ArrowLeft,
    ChevronDown,
    Clock,
    ExternalLink,
    Pencil,
    Search,
    X,
    Zap,
} from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { Input } from "@pes/ui/components/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@pes/ui/components/select";
import { cn } from "@pes/ui/lib/utils";

import { EventTypeBadge } from "@/components/common/events/event-badges";
import { ActionTypeChip } from "@/components/common/events/trigger-rules/console/rule-action-chain";
import { formatDateTime, formatRelativeTime } from "@/lib/format-date";
import { describeAction } from "@/lib/trigger-rules/describe-action";
import { useAppSelector } from "@/store/hooks";
import { triggerRulesSelectors } from "@/store/slices/triggerRulesSlice";
import type { TriggerRule, TriggeredAction, TriggeredEvent } from "@/types";

// eslint-disable-next-line no-empty-pattern
export function meta({ }: Route.MetaArgs) {
    return [
        { title: "PES | Rule firing history" },
        { name: "description", content: "How often each trigger rule fired and what it did" },
    ];
}

type HistoryWindow = "all" | "1h" | "24h" | "7d";
type HistorySort = "count" | "recent" | "name";

const WINDOWS: Array<{ key: HistoryWindow; label: string; ms: number | null }> = [
    { key: "all", label: "All", ms: null },
    { key: "1h", label: "1h", ms: 60 * 60 * 1000 },
    { key: "24h", label: "24h", ms: 24 * 60 * 60 * 1000 },
    { key: "7d", label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
];

const SORT_LABELS: Record<HistorySort, string> = {
    count: "Most fired",
    recent: "Recently fired",
    name: "Name A–Z",
};

const VISIBLE_FIRINGS = 5;

interface ActionSeen {
    key: string;
    action: TriggeredAction;
    count: number;
}

interface FiringRecord {
    eventId: string;
    eventType: string;
    at: string;
    actionCount: number;
}

interface RuleHistory {
    key: string;
    ruleId: string | null;
    ruleName: string;
    priority: number;
    count: number;
    firstAt: string;
    lastAt: string;
    firings: FiringRecord[];
    actions: Map<string, ActionSeen>;
    eventTypes: string[];
}

interface RuleStatus {
    label: string;
    dot: string;
    badge?: string;
}

function timeOf(iso: string | null | undefined): number {
    if (!iso) return 0;
    const time = new Date(iso).getTime();
    return Number.isNaN(time) ? 0 : time;
}

function formatClock(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return (
        date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) +
        " " +
        date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    );
}

/** Compact age for older firings: "6w ago" instead of a full date. */
function formatAge(iso: string): string {
    const time = timeOf(iso);
    if (!time) return "—";

    const diff = Math.max(0, Date.now() - time);
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;

    return `${Math.floor(days / 365)}y ago`;
}

function actionSignature(action: TriggeredAction): string {
    return [
        action.action_type,
        action.duration,
        action.cumulative ? "cumulative" : "wait",
        JSON.stringify(action.payload ?? {}),
    ].join("|");
}

/** Group triggered events into one summary per rule, keeping recent firings. */
function buildRuleHistory(events: TriggeredEvent[]): RuleHistory[] {
    const byRule = new Map<string, RuleHistory>();

    for (const event of events) {
        for (const rule of event.triggered_rules ?? []) {
            const key = rule.rule_id ?? `transient:${rule.rule_name}`;
            let summary = byRule.get(key);

            if (!summary) {
                summary = {
                    key,
                    ruleId: rule.rule_id,
                    ruleName: rule.rule_name,
                    priority: rule.priority,
                    count: 0,
                    firstAt: event.triggered_at,
                    lastAt: event.triggered_at,
                    firings: [],
                    actions: new Map(),
                    eventTypes: [],
                };
                byRule.set(key, summary);
            }

            summary.count += 1;
            if (timeOf(event.triggered_at) < timeOf(summary.firstAt)) {
                summary.firstAt = event.triggered_at;
            }
            if (timeOf(event.triggered_at) > timeOf(summary.lastAt)) {
                summary.lastAt = event.triggered_at;
            }
            if (!summary.eventTypes.includes(event.event_type)) {
                summary.eventTypes.push(event.event_type);
            }

            summary.firings.push({
                eventId: event.id,
                eventType: event.event_type,
                at: event.triggered_at,
                actionCount: rule.actions.length,
            });

            for (const action of rule.actions) {
                const signature = actionSignature(action);
                const seen = summary.actions.get(signature);
                if (seen) {
                    seen.count += 1;
                    // Keep the most recent payload for the display copy.
                    seen.action = action;
                } else {
                    summary.actions.set(signature, {
                        key: signature,
                        action,
                        count: 1,
                    });
                }
            }
        }
    }

    for (const summary of byRule.values()) {
        summary.firings.sort((a, b) => timeOf(b.at) - timeOf(a.at));
    }

    return Array.from(byRule.values());
}

function ruleStatus(ruleId: string | null, liveRule?: TriggerRule): RuleStatus {
    if (!ruleId) {
        return {
            label: "transient",
            dot: "bg-violet-500",
            badge: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
        };
    }
    if (!liveRule) {
        return {
            label: "deleted",
            dot: "bg-amber-500",
            badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        };
    }
    if (!liveRule.enabled) {
        return {
            label: "paused",
            dot: "bg-zinc-500",
            badge: "border-border bg-muted/40 text-muted-foreground",
        };
    }
    return { label: "enabled", dot: "bg-emerald-500" };
}

function searchHaystack(summary: RuleHistory): string {
    const actions = Array.from(summary.actions.values())
        .map(({ action }) => {
            const described = describeAction(action);
            return `${action.action_type} ${action.display_name ?? ""} ${described.title} ${described.detail}`;
        })
        .join(" ");

    return [
        summary.ruleName,
        summary.ruleId ?? "",
        summary.eventTypes.join(" "),
        actions,
    ]
        .join("\n")
        .toLowerCase();
}

function HistoryStat({
    icon,
    label,
    value,
    sub,
}: {
    icon: React.ReactNode;
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
}) {
    return (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card/40 p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg accent-tile">
                {icon}
            </span>
            <div className="min-w-0">
                <div className="font-syne text-lg leading-tight font-extrabold text-foreground tabular-nums">
                    {value}
                </div>
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground/50">
                    {label}
                </div>
                {sub && (
                    <div className="mt-0.5 truncate text-[10px] text-muted-foreground/60">{sub}</div>
                )}
            </div>
        </div>
    );
}

function SectionTitle({ label, meta }: { label: string; meta?: string }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                {label}
            </span>
            {meta && (
                <span className="font-mono text-[9px] text-muted-foreground/35">{meta}</span>
            )}
        </div>
    );
}

function RuleHistoryItem({
    summary,
    liveRule,
}: {
    summary: RuleHistory;
    liveRule?: TriggerRule;
}) {
    const [expanded, setExpanded] = useState(false);
    const [showAll, setShowAll] = useState(false);

    const status = ruleStatus(summary.ruleId, liveRule);
    const name = liveRule?.name ?? summary.ruleName;
    const seenActions = Array.from(summary.actions.values()).sort(
        (a, b) => b.count - a.count,
    );
    const visibleFirings = showAll
        ? summary.firings
        : summary.firings.slice(0, VISIBLE_FIRINGS);
    const hiddenFirings = summary.firings.length - visibleFirings.length;
    const hiddenActions = Math.max(0, seenActions.length - 4);

    return (
        <div className="overflow-hidden rounded-xl border border-border bg-card/30">
            <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
                aria-controls={`history-detail-${summary.key}`}
                className="flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-inset"
            >
                <span
                    className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", status.dot)}
                    title={status.label}
                />

                <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[13px] font-semibold text-foreground">
                            {name}
                        </span>
                        <span className="font-mono text-[9px] text-muted-foreground/50">
                            p{summary.priority}
                        </span>
                        {status.badge && (
                            <span
                                className={cn(
                                    "rounded border px-1.5 py-px font-mono text-[8px]",
                                    status.badge,
                                )}
                            >
                                {status.label}
                            </span>
                        )}
                    </span>

                    <span className="mt-1 flex flex-wrap items-center gap-1">
                        {summary.eventTypes.slice(0, 2).map((type) => (
                            <EventTypeBadge
                                key={type}
                                type={type}
                                className="max-w-[190px]"
                            />
                        ))}
                        {summary.eventTypes.length > 2 && (
                            <span className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground/60">
                                +{summary.eventTypes.length - 2}
                            </span>
                        )}
                    </span>
                </span>

                <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="rounded border border-purple-500/25 bg-purple-500/10 px-1.5 py-px font-mono text-[10px] text-purple-700 dark:text-purple-300">
                        ×{summary.count}
                    </span>
                    <span
                        className="font-mono text-[9px] text-muted-foreground/50"
                        title={formatDateTime(summary.lastAt)}
                    >
                        {formatAge(summary.lastAt)}
                    </span>
                </span>

                <ChevronDown
                    className={cn(
                        "mt-1 size-3.5 shrink-0 text-muted-foreground/40 transition-transform",
                        expanded && "rotate-180",
                    )}
                />
            </button>

            {expanded && (
                <div
                    id={`history-detail-${summary.key}`}
                    className="space-y-4 border-t border-border/60 bg-muted/10 p-3.5"
                >
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                        <section className="min-w-0 space-y-2">
                            <SectionTitle
                                label="Recent firings"
                                meta={`${summary.count} total`}
                            />

                            <div className="overflow-hidden rounded-lg border border-border/60 bg-background/30">
                                {visibleFirings.map((firing) => (
                                    <div
                                        key={`${firing.eventId}-${firing.at}`}
                                        className="flex items-center gap-2 border-b border-border/40 px-2.5 py-1.5 last:border-b-0"
                                    >
                                        <span
                                            className="w-[112px] shrink-0 whitespace-nowrap font-mono text-[9px] text-muted-foreground/60"
                                            title={formatDateTime(firing.at)}
                                        >
                                            {formatClock(firing.at)}
                                        </span>
                                        <EventTypeBadge
                                            type={firing.eventType}
                                            className="max-w-[190px]"
                                        />
                                        <span className="ml-auto shrink-0 font-mono text-[9px] text-muted-foreground/45">
                                            {firing.actionCount} action
                                            {firing.actionCount === 1 ? "" : "s"}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {hiddenFirings > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setShowAll((value) => !value)}
                                    className="font-mono text-[9px] text-violet-600/80 hover:text-violet-600 dark:text-violet-300/80 dark:hover:text-violet-300"
                                >
                                    {showAll
                                        ? "Show fewer firings"
                                        : `Show ${hiddenFirings} earlier firing${hiddenFirings === 1 ? "" : "s"}`}
                                </button>
                            )}
                        </section>

                        <aside className="min-w-0 space-y-2">
                            <SectionTitle
                                label="Actions seen"
                                meta={`${seenActions.length} variant${seenActions.length === 1 ? "" : "s"}`}
                            />

                            {seenActions.length === 0 ? (
                                <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-[11px] text-muted-foreground/50 italic">
                                    No actions were recorded.
                                </p>
                            ) : (
                                <div className="space-y-1.5">
                                    {seenActions.slice(0, 4).map(({ key, action, count }) => {
                                        const described = describeAction(action);
                                        return (
                                            <div
                                                key={key}
                                                className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/30 px-2.5 py-2"
                                            >
                                                <ActionTypeChip type={action.action_type} />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-[11px] font-medium text-foreground">
                                                        {described.title}
                                                    </p>
                                                    <p className="truncate font-mono text-[9px] text-muted-foreground/50">
                                                        {described.duration} · {described.mode}
                                                    </p>
                                                </div>
                                                <span className="shrink-0 font-mono text-[9px] text-muted-foreground/50">
                                                    ×{count}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {hiddenActions > 0 && (
                                <p className="font-mono text-[9px] text-muted-foreground/40">
                                    +{hiddenActions} more action variant
                                    {hiddenActions === 1 ? "" : "s"}
                                </p>
                            )}
                        </aside>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3">
                        <span className="font-mono text-[9px] text-muted-foreground/45">
                            First fired {formatRelativeTime(summary.firstAt)} · last{" "}
                            {formatDateTime(summary.lastAt)}
                        </span>

                        {liveRule ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                                <Button
                                    asChild
                                    variant="outline"
                                    size="sm"
                                    className="gap-1.5 text-xs"
                                >
                                    <Link to={`/app/events/trigger-rules/${liveRule.id}/edit`}>
                                        <Pencil />
                                        Edit rule
                                    </Link>
                                </Button>
                                <Button
                                    asChild
                                    variant="ghost"
                                    size="sm"
                                    className="gap-1.5 text-xs"
                                >
                                    <Link to="/app/events/trigger-rules">
                                        <ExternalLink />
                                        All rules
                                    </Link>
                                </Button>
                            </div>
                        ) : (
                            <span className="font-mono text-[9px] text-amber-600/80 dark:text-amber-400/80">
                                {summary.ruleId
                                    ? "This rule no longer exists."
                                    : "Created on the fly — no saved rule to edit."}
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function EmptyState({
    title,
    description,
    actions,
}: {
    title: string;
    description: React.ReactNode;
    actions?: React.ReactNode;
}) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
            <span className="flex size-11 items-center justify-center rounded-full border border-violet-500/25 bg-violet-500/10">
                <Zap className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </span>
            <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
            </div>
            {actions && <div className="flex flex-wrap items-center justify-center gap-2">{actions}</div>}
        </div>
    );
}

export default function TriggeredRulesPage() {
    const events = useAppSelector((state) => state.events.events);
    const rules = useAppSelector((state) => triggerRulesSelectors.selectAll(state));
    const [searchParams, setSearchParams] = useSearchParams();

    const focusedRuleId = searchParams.get("rule");
    const [query, setQuery] = useState("");
    const [windowKey, setWindowKey] = useState<HistoryWindow>("all");
    const [sort, setSort] = useState<HistorySort>("count");
    const [now, setNow] = useState(() => Date.now());

    // Keep relative timestamps and the window boundary fresh while idle.
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 30_000);
        return () => window.clearInterval(timer);
    }, []);

    const liveRulesById = useMemo(
        () => new Map(rules.map((rule) => [rule.id, rule])),
        [rules],
    );

    const ruleNamesById = useMemo(() => {
        const names = new Map<string, string>();
        for (const event of events) {
            for (const rule of event.triggered_rules ?? []) {
                if (rule.rule_id) names.set(rule.rule_id, rule.rule_name);
            }
        }
        return names;
    }, [events]);

    const windowSummaries = useMemo(() => {
        const selected = WINDOWS.find((entry) => entry.key === windowKey);
        const cutoff = !selected || selected.ms === null ? null : now - selected.ms;

        const scopedEvents = cutoff === null
            ? events
            : events.filter((event) => timeOf(event.triggered_at) >= cutoff);

        const summaries = buildRuleHistory(scopedEvents);
        return focusedRuleId
            ? summaries.filter((summary) => summary.ruleId === focusedRuleId)
            : summaries;
    }, [events, focusedRuleId, now, windowKey]);

    const summaries = useMemo(() => {
        const needle = query.trim().toLowerCase();

        const matching = needle
            ? windowSummaries.filter((summary) =>
                  needle.split(/\s+/).every((term) => searchHaystack(summary).includes(term)),
              )
            : windowSummaries;

        return [...matching].sort((a, b) => {
            switch (sort) {
                case "recent":
                    return timeOf(b.lastAt) - timeOf(a.lastAt) || b.count - a.count;
                case "name":
                    return a.ruleName.localeCompare(b.ruleName);
                default:
                    return b.count - a.count || timeOf(b.lastAt) - timeOf(a.lastAt);
            }
        });
    }, [query, sort, windowSummaries]);

    const totals = useMemo(() => {
        let firings = 0;
        let last: string | null = null;

        for (const summary of windowSummaries) {
            firings += summary.count;
            if (!last || timeOf(summary.lastAt) > timeOf(last)) {
                last = summary.lastAt;
            }
        }

        return { firings, rules: windowSummaries.length, last };
    }, [windowSummaries]);

    const focusedName = useMemo(() => {
        if (!focusedRuleId) return null;
        const live = liveRulesById.get(focusedRuleId);
        if (live) return live.name;
        return (
            windowSummaries.find((summary) => summary.ruleId === focusedRuleId)?.ruleName ??
            ruleNamesById.get(focusedRuleId) ??
            focusedRuleId
        );
    }, [focusedRuleId, liveRulesById, ruleNamesById, windowSummaries]);

    const clearFocus = () => {
        const next = new URLSearchParams(searchParams);
        next.delete("rule");
        setSearchParams(next, { replace: true });
    };

    const clearSearch = () => setQuery("");

    const showAllTime = () => setWindowKey("all");

    const hasRules = summaries.length > 0;

    return (
        <div className="space-y-3 px-4 md:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="max-w-2xl text-[11px] leading-relaxed text-muted-foreground/60">
                    Firing history is derived from the last 1000 triggered events kept in
                    memory. Open a rule to inspect its recent firings and the actions it
                    actually ran.
                </p>
                <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs">
                    <Link to="/app/events/trigger-rules">
                        <ArrowLeft />
                        All trigger rules
                    </Link>
                </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
                <HistoryStat
                    icon={<Activity size={15} className="accent-tile-icon" />}
                    label="Rule firings"
                    value={totals.firings}
                />
                <HistoryStat
                    icon={<Zap size={15} className="accent-tile-icon" />}
                    label="Rules fired"
                    value={totals.rules}
                />
                <HistoryStat
                    icon={<Clock size={15} className="accent-tile-icon" />}
                    label="Last firing"
                    value={totals.last ? formatAge(totals.last) : "—"}
                    sub={totals.last ? formatDateTime(totals.last) : "No firings in this window"}
                />
            </div>

            {focusedRuleId && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">
                        Focused rule
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 font-mono text-[10px] text-violet-700 dark:text-violet-300">
                        {focusedName}
                        <button
                            type="button"
                            onClick={clearFocus}
                            aria-label="Clear rule filter"
                            className="rounded-sm opacity-60 hover:opacity-100"
                        >
                            <X size={10} />
                        </button>
                    </span>
                </div>
            )}

            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="relative w-full lg:w-72">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search rule, event or action…"
                        aria-label="Search rule history"
                        className="h-9 pl-8"
                    />
                </div>

                <div
                    role="group"
                    aria-label="Filter history by time window"
                    className="flex h-9 w-full items-center rounded-lg border border-border bg-muted/40 p-0.5 lg:w-auto"
                >
                    {WINDOWS.map((entry) => {
                        const active = windowKey === entry.key;
                        return (
                            <button
                                key={entry.key}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setWindowKey(entry.key)}
                                className={cn(
                                    "h-full flex-1 rounded-md px-3 text-[11px] font-medium transition-colors lg:flex-none",
                                    active
                                        ? "bg-background text-foreground shadow-xs"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {entry.label}
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-2 lg:ml-auto">
                    <span className="hidden font-mono text-[9px] text-muted-foreground/45 sm:inline">
                        {summaries.length} of {windowSummaries.length} rule
                        {windowSummaries.length === 1 ? "" : "s"}
                    </span>
                    <Select
                        value={sort}
                        onValueChange={(value) => setSort(value as HistorySort)}
                    >
                        <SelectTrigger
                            size="sm"
                            aria-label="Sort rule history"
                            className="h-9 min-w-[140px] gap-2 px-3 text-xs [&_svg]:size-3.5"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {(Object.keys(SORT_LABELS) as HistorySort[]).map((key) => (
                                <SelectItem key={key} value={key}>
                                    {SORT_LABELS[key]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {events.length === 0 ? (
                <EmptyState
                    title="No trigger rules have fired yet"
                    description="When a rule fires, its recent firings and executed actions will show up here."
                    actions={
                        <Button asChild variant="outline" size="sm">
                            <Link to="/app/events/trigger-rules">Configure trigger rules</Link>
                        </Button>
                    }
                />
            ) : !hasRules && query.trim() ? (
                <EmptyState
                    title="No rules match this search"
                    description={`Nothing matched “${query.trim()}” in the selected window.`}
                    actions={
                        <Button type="button" variant="outline" size="sm" onClick={clearSearch}>
                            Clear search
                        </Button>
                    }
                />
            ) : !hasRules && focusedRuleId ? (
                <EmptyState
                    title="No firings for this rule"
                    description="This rule has not fired recently. Try a wider time window or clear the focus."
                    actions={
                        <>
                            {windowKey !== "all" && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={showAllTime}
                                >
                                    Show all time
                                </Button>
                            )}
                            <Button type="button" variant="ghost" size="sm" onClick={clearFocus}>
                                Clear rule filter
                            </Button>
                        </>
                    }
                />
            ) : !hasRules ? (
                <EmptyState
                    title="No rule fired in this window"
                    description="The trigger rules ran, but none of the events in this period triggered one."
                    actions={
                        windowKey !== "all" ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={showAllTime}
                            >
                                Show all time
                            </Button>
                        ) : undefined
                    }
                />
            ) : (
                <div className="flex flex-col gap-2">
                    {summaries.map((summary) => (
                        <RuleHistoryItem
                            key={summary.key}
                            summary={summary}
                            liveRule={
                                summary.ruleId
                                    ? liveRulesById.get(summary.ruleId)
                                    : undefined
                            }
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
