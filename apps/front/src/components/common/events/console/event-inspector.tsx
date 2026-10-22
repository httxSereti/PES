import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowUpRight, Check, ChevronDown, Copy, Layers, TrendingUp, Zap, ZapOff } from "lucide-react";
import { Button } from "@pes/ui/components/button";
import { cn } from "@pes/ui/lib/utils";
import type { TriggeredEvent, TriggeredRule } from "@/store/slices/eventsSlice";
import { describeAction } from "@/lib/trigger-rules/describe-action";
import { describeEvent, eventTone } from "@/lib/trigger-rules/describe-event";
import { eventIcon, TONE_GRADIENT, TONE_TILE } from "@/lib/trigger-rules/event-visual";
import type { BurstRule, EventBurst } from "@/lib/trigger-rules/event-bursts";
import { formatClockTime, formatRelativeTime } from "@/lib/format-date";
import { EventTypeBadge } from "@/components/common/events/event-badges";
import { ActionTypeChip } from "@/components/common/events/trigger-rules/console/rule-action-chain";

const CONTEXT_WINDOW_MS = 10 * 60_000;

function SectionLabel({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/50">{children}</h3>
            {aside}
        </div>
    );
}

function shortId(id: string): string {
    if (id.length <= 18) return id;
    return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function renderValue(value: unknown): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function EventFields({ event }: { event: TriggeredEvent }) {
    const [showAll, setShowAll] = useState(false);
    const entries = Object.entries(event.event_data ?? {});
    const visible = showAll ? entries : entries.slice(0, 8);

    return (
        <section className="space-y-1.5">
            <SectionLabel
                aside={
                    entries.length > 8 ? (
                        <button
                            type="button"
                            onClick={() => setShowAll((value) => !value)}
                            className="cursor-pointer font-mono text-[10px] text-violet-600/80 hover:text-violet-500 dark:text-violet-400/80"
                        >
                            {showAll ? "show less" : `show all ${entries.length}`}
                        </button>
                    ) : undefined
                }
            >
                Event fields
            </SectionLabel>

            {entries.length === 0 ? (
                <p className="rounded-md border border-dashed border-border/60 px-3 py-2.5 text-[11.5px] italic text-muted-foreground/50">
                    This event carries no payload — thresholds and state live on the source.
                </p>
            ) : (
                <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                    {visible.map(([key, value]) => (
                        <div
                            key={key}
                            className="flex items-baseline gap-3 border-b border-border/40 py-1.5 last:border-b-0 sm:last:border-b"
                        >
                            <span
                                className="w-[120px] shrink-0 truncate font-mono text-[10.5px] text-muted-foreground/50"
                                title={key}
                            >
                                {key}
                            </span>
                            <span
                                className="min-w-0 break-all font-mono text-[10.5px] text-foreground/80 line-clamp-2"
                                title={renderValue(value)}
                            >
                                {renderValue(value)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

function ActionStep({ action, index }: { action: TriggeredRule["actions"][number]; index: number }) {
    const described = describeAction(action);

    return (
        <div className="flex items-center gap-2.5 rounded border border-border/50 bg-background/40 px-2.5 py-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-violet-500/10 font-mono text-[9px] text-violet-700 dark:text-violet-300">
                {index + 1}
            </span>
            <ActionTypeChip type={described.type} className="px-2 py-0.5 text-[10px]" />
            <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/85">{described.title}</span>
            <span className="shrink-0 font-mono text-[9.5px] text-muted-foreground/70">{described.duration}</span>
            {action.cumulative && (
                <span className="shrink-0 rounded bg-teal-500/10 px-1.5 py-0.5 font-mono text-[8.5px] text-teal-700 dark:text-teal-300">
                    cumul
                </span>
            )}
        </div>
    );
}

function RuleCard({ entry }: { entry: BurstRule }) {
    const { rule, fires, actionCount } = entry;

    return (
        <div className="space-y-2 rounded-lg border border-violet-500/20 bg-violet-500/[0.04] p-3">
            <div className="flex items-center gap-2">
                <Zap size={13} className="shrink-0 text-violet-500 dark:text-violet-400" />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-foreground">
                    {rule.rule_name}
                </span>
                {fires > 1 && (
                    <span className="shrink-0 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] text-amber-700 dark:text-amber-300">
                        ×{fires}
                    </span>
                )}
                <span className="shrink-0 font-mono text-[9px] text-muted-foreground/45">priority {rule.priority}</span>
                {rule.rule_id && (
                    <Link
                        to={`/app/events/trigger-rules/${rule.rule_id}/edit`}
                        aria-label={`Open rule ${rule.rule_name}`}
                        className="shrink-0 rounded p-1 text-muted-foreground/40 transition hover:text-violet-500"
                    >
                        <ArrowUpRight size={12} />
                    </Link>
                )}
            </div>

            {rule.actions.length === 0 ? (
                <p className="px-1 text-[11px] italic text-muted-foreground/50">No actions on this rule.</p>
            ) : (
                <div className="space-y-1.5">
                    {rule.actions.map((action, index) => (
                        <ActionStep key={action.queue_item_id} action={action} index={index} />
                    ))}
                </div>
            )}

            <div className="flex items-center justify-between px-1 font-mono text-[9px] text-muted-foreground/40">
                <span>
                    {actionCount} action{actionCount === 1 ? "" : "s"} queued
                </span>
                {fires > 1 && <span>chain from latest firing</span>}
            </div>
        </div>
    );
}

export interface EventInspectorProps {
    burst: EventBurst;
    events: TriggeredEvent[];
    onFilterType: (type: string) => void;
    onSelectEvent: (event: TriggeredEvent) => void;
    inSheet?: boolean;
}

export function EventInspector({ burst, events, onFilterType, onSelectEvent, inSheet = false }: EventInspectorProps) {
    const [copied, setCopied] = useState(false);
    const [rawOpen, setRawOpen] = useState(false);

    const event = burst.latest;
    const described = describeEvent(event);
    const tone = eventTone(event.event_type, event.origin);
    const EventIcon = eventIcon(event.event_type);
    const fired = burst.rules.length > 0;
    const ruleNames = useMemo(() => new Set(burst.rules.map((entry) => entry.rule.rule_name)), [burst.rules]);

    const context = useMemo(() => {
        const now = Date.now();
        const burstIds = new Set(burst.events.map((item) => item.id));
        const withinWindow = (item: TriggeredEvent) => {
            const time = new Date(item.triggered_at).getTime();
            return !Number.isNaN(time) && now - time <= CONTEXT_WINDOW_MS;
        };

        const ruleFires = events.filter(
            (item) => withinWindow(item) && (item.triggered_rules ?? []).some((rule) => ruleNames.has(rule.rule_name)),
        ).length;

        const typeFires = events.filter((item) => withinWindow(item) && item.event_type === event.event_type).length;

        const related = events
            .filter((item) => !burstIds.has(item.id) && withinWindow(item))
            .filter(
                (item) =>
                    item.event_type === event.event_type ||
                    (item.triggered_rules ?? []).some((rule) => ruleNames.has(rule.rule_name)),
            )
            .sort((a, b) => new Date(b.triggered_at).getTime() - new Date(a.triggered_at).getTime())
            .slice(0, 3);

        return { ruleFires, typeFires, related };
    }, [events, burst.events, event.event_type, ruleNames]);

    const firstRuleId = burst.rules[0]?.rule.rule_id ?? null;
    const ruleHref = firstRuleId ? `/app/events/trigger-rules/${firstRuleId}/edit` : "/app/events/trigger-rules/new";

    const payload = useMemo(() => JSON.stringify(event.event_data ?? {}, null, 2), [event.event_data]);

    async function copyPayload() {
        try {
            await navigator.clipboard.writeText(payload);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    }

    return (
        <div className="flex h-full min-h-0 w-full flex-col bg-background">
            <header
                className={cn(
                    "shrink-0 border-b border-border/60 bg-gradient-to-b to-transparent px-5 py-4",
                    TONE_GRADIENT[tone],
                    inSheet && "pr-12",
                )}
            >
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <EventTypeBadge type={event.event_type} />
                        <span className="truncate font-mono text-[10.5px] text-muted-foreground/50">
                            {event.origin}
                        </span>
                        <span className="text-muted-foreground/25">·</span>
                        <span className="font-mono text-[10.5px] text-muted-foreground/50">
                            {formatClockTime(event.triggered_at)}
                        </span>
                        <span className="text-muted-foreground/25">·</span>
                        <span className="font-mono text-[10.5px] text-muted-foreground/35">
                            {formatRelativeTime(event.triggered_at)}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <Button type="button" variant="ghost" size="sm" onClick={copyPayload}>
                            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                            {copied ? "Copied" : "Copy JSON"}
                        </Button>
                        <Button type="button" variant="outline" size="sm" asChild>
                            <Link to={ruleHref}>
                                {firstRuleId ? "Open rule" : "Create rule"}
                                <ArrowUpRight size={12} />
                            </Link>
                        </Button>
                    </div>
                </div>

                <div className="mt-3 flex items-start gap-3">
                    <span
                        className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-lg border",
                            TONE_TILE[tone],
                        )}
                    >
                        <EventIcon size={18} />
                    </span>

                    <div className="min-w-0 flex-1">
                        <h2 className="text-[20px] font-semibold leading-tight text-foreground">{described.title}</h2>

                        <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground/40">
                            <span>event {shortId(event.id)}</span>
                            {described.detail && <span>· {described.detail}</span>}
                            <span
                                className={cn(
                                    "rounded-full border px-2 py-0.5 text-[9px]",
                                    fired
                                        ? "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300"
                                        : "border-border bg-muted/40 text-muted-foreground/55",
                                )}
                            >
                                {burst.actionCount > 0
                                    ? `${burst.actionCount} action${burst.actionCount === 1 ? "" : "s"}`
                                    : "no rule matched"}
                            </span>
                        </div>
                    </div>
                </div>

                {burst.count > 1 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-md border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-[11.5px] text-amber-800 dark:text-amber-200">
                        <Layers size={12} className="shrink-0" />
                        <span>
                            <span className="font-semibold">{burst.count} events collapsed</span> ·{" "}
                            {formatClockTime(burst.oldest.triggered_at)} → {formatClockTime(burst.latest.triggered_at)}
                        </span>
                        <span className="ml-auto font-mono text-[10px] text-amber-700/70 dark:text-amber-300/70">
                            {burst.actionCount} actions queued
                        </span>
                    </div>
                )}
            </header>

            <div className="relative min-h-0 flex-1">
                <div className="h-full space-y-5 overflow-y-auto px-5 py-4">
                    <EventFields event={event} />

                    <section className="space-y-2">
                        <SectionLabel
                            aside={
                                burst.count > 1 && burst.rules.length > 0 ? (
                                    <span className="font-mono text-[9.5px] text-muted-foreground/35">
                                        aggregated over the burst
                                    </span>
                                ) : undefined
                            }
                        >
                            Matched rules · {burst.rules.length}
                        </SectionLabel>

                        {burst.rules.length === 0 ? (
                            <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-border/70 px-3 py-3">
                                <ZapOff size={14} className="shrink-0 text-muted-foreground/35" />
                                <p className="min-w-0 flex-1 text-[11.5px] text-muted-foreground/55">
                                    No rule matched this event.
                                </p>
                                <Button type="button" variant="ghost" size="sm" asChild>
                                    <Link to="/app/events/trigger-rules/new">Create one</Link>
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {burst.rules.map((entry) => (
                                    <RuleCard key={entry.rule.rule_id ?? entry.rule.rule_name} entry={entry} />
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="space-y-2">
                        <SectionLabel>Live context</SectionLabel>

                        <div className="flex items-center gap-2.5 rounded-md border border-border/60 bg-muted/[0.18] px-3 py-2">
                            <TrendingUp size={13} className="shrink-0 text-violet-500/70" />
                            <p className="min-w-0 text-[11.5px] text-muted-foreground/70">
                                {context.ruleFires > 1 ? (
                                    <>
                                        This rule fired{" "}
                                        <span className="font-semibold text-foreground/80">{context.ruleFires}×</span>{" "}
                                        in the last 10 min.
                                    </>
                                ) : context.typeFires > 1 ? (
                                    <>
                                        This event type appeared{" "}
                                        <span className="font-semibold text-foreground/80">{context.typeFires}×</span>{" "}
                                        in the last 10 min.
                                    </>
                                ) : (
                                    "First occurrence of this event in the last 10 min."
                                )}
                            </p>
                        </div>

                        {context.related.length > 0 && (
                            <div className="divide-y divide-border/40 rounded-md border border-border/60">
                                {context.related.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => onSelectEvent(item)}
                                        className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition hover:bg-muted/50"
                                    >
                                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground/45">
                                            {formatClockTime(item.triggered_at)}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground/80">
                                            {describeEvent(item).title}
                                        </span>
                                        <span className="shrink-0 font-mono text-[9px] text-muted-foreground/35">
                                            {item.triggered_rules?.length
                                                ? `${item.triggered_rules.reduce((n, rule) => n + rule.actions.length, 0)} acts`
                                                : "no rule"}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="space-y-2">
                        <SectionLabel
                            aside={
                                <button
                                    type="button"
                                    onClick={() => setRawOpen((open) => !open)}
                                    className="flex cursor-pointer items-center gap-1.5 font-mono text-[10px] text-muted-foreground/50 hover:text-foreground"
                                >
                                    {rawOpen ? "collapse" : "expand"}
                                    <ChevronDown
                                        size={11}
                                        className={cn("transition-transform", rawOpen && "rotate-180")}
                                    />
                                </button>
                            }
                        >
                            Raw payload
                        </SectionLabel>

                        {rawOpen && (
                            <pre className="max-h-56 overflow-auto rounded-md border border-border/60 bg-muted/30 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground/75">
                                {payload}
                            </pre>
                        )}
                    </section>
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent" />
            </div>

            <footer className="mt-auto flex shrink-0 items-center justify-between gap-2.5 border-t border-border/60 px-5 py-3">
                <span className="hidden items-center gap-1.5 font-mono text-[9px] text-muted-foreground/35 md:flex">
                    <kbd className="rounded border border-border/70 px-1.5 py-0.5">j</kbd>
                    <kbd className="rounded border border-border/70 px-1.5 py-0.5">k</kbd>
                    navigate
                    <span className="mx-0.5">·</span>
                    <kbd className="rounded border border-border/70 px-1.5 py-0.5">space</kbd>
                    pause
                    <span className="mx-0.5">·</span>
                    <kbd className="rounded border border-border/70 px-1.5 py-0.5">/</kbd>
                    search
                </span>

                <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => onFilterType(event.event_type)}>
                        Filter by this type
                    </Button>
                    <Button type="button" size="sm" className="bg-violet-600 text-white hover:bg-violet-500" asChild>
                        <Link to={ruleHref}>
                            {firstRuleId ? "Open trigger rule" : "Create trigger rule"}
                            <ArrowUpRight size={12} />
                        </Link>
                    </Button>
                </div>
            </footer>
        </div>
    );
}
