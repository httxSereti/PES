import { ArrowDownWideNarrow, ArrowUpNarrowWide, Layers, Radio } from "lucide-react";
import { cn } from "@pes/ui/lib/utils";
import type { EventBurst } from "@/lib/trigger-rules/event-bursts";
import { describeEvent, eventTone } from "@/lib/trigger-rules/describe-event";
import { eventIcon, TONE_TILE } from "@/lib/trigger-rules/event-visual";
import { formatClockTime } from "@/lib/format-date";
import { EventTypeBadge } from "@/components/common/events/event-badges";

function BurstBadge({ count }: { count: number }) {
    return (
        <span className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] font-medium text-amber-700 dark:text-amber-300">
            <Layers size={9} />×{count}
        </span>
    );
}

export interface EventStreamProps {
    groups: EventBurst[];
    selectedId: string | null;
    onSelect: (burst: EventBurst) => void;
    sortDesc: boolean;
    onToggleSort: () => void;
    totalEvents: number;
    capacity: number;
    paused: boolean;
    onClearFilters: () => void;
}

export function EventStream({
    groups,
    selectedId,
    onSelect,
    sortDesc,
    onToggleSort,
    totalEvents,
    capacity,
    paused,
    onClearFilters,
}: EventStreamProps) {
    const collapsedCount = groups.reduce((total, group) => total + group.count - 1, 0);

    return (
        <div className="flex h-full min-h-0 flex-col bg-card/30">
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/60 px-4">
                <div className="flex min-w-0 items-baseline gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/50">
                        Event stream
                    </span>
                    <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground/35">
                        {groups.length} rows · {totalEvents} events
                        {collapsedCount > 0 ? ` · ${collapsedCount} collapsed` : ""}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={onToggleSort}
                    title={sortDesc ? "Newest first" : "Oldest first"}
                    aria-label={sortDesc ? "Sort oldest first" : "Sort newest first"}
                    className="cursor-pointer rounded p-1 text-muted-foreground/60 transition hover:bg-muted hover:text-foreground"
                >
                    {sortDesc ? <ArrowDownWideNarrow size={14} /> : <ArrowUpNarrowWide size={14} />}
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {groups.length === 0 ? (
                    <div className="flex h-full min-h-44 flex-col items-center justify-center gap-2.5 px-6 text-center">
                        <Radio size={20} className="text-muted-foreground/20" />
                        <p className="text-sm text-muted-foreground/60">
                            {totalEvents === 0 ? "Waiting for events…" : "No events match your filters"}
                        </p>
                        {totalEvents > 0 ? (
                            <button
                                type="button"
                                onClick={onClearFilters}
                                className="cursor-pointer text-[11px] text-violet-600 underline underline-offset-2 hover:text-violet-500 dark:text-violet-400"
                            >
                                Clear filters
                            </button>
                        ) : (
                            <p className="font-mono text-[10px] text-muted-foreground/35">
                                new events appear here in real time
                            </p>
                        )}
                    </div>
                ) : (
                    groups.map((burst) => {
                        const described = describeEvent(burst.latest);
                        const tone = eventTone(burst.latest.event_type, burst.latest.origin);
                        const Icon = eventIcon(burst.latest.event_type);
                        const fired = burst.rules.length > 0;
                        const selected = burst.events.some((event) => event.id === selectedId);

                        return (
                            <button
                                key={burst.key}
                                type="button"
                                onClick={() => onSelect(burst)}
                                aria-pressed={selected}
                                title={
                                    burst.count > 1
                                        ? `${burst.count} events between ${formatClockTime(burst.oldest.triggered_at)} and ${formatClockTime(burst.latest.triggered_at)}`
                                        : undefined
                                }
                                className={cn(
                                    "flex w-full min-w-0 cursor-pointer items-center gap-3 border-b border-border/40 border-l-2 px-3.5 py-3 text-left transition",
                                    selected
                                        ? "border-l-violet-500 bg-violet-500/10"
                                        : "border-l-transparent hover:bg-muted/40",
                                )}
                            >
                                <span
                                    className={cn(
                                        "flex size-7 shrink-0 items-center justify-center rounded-md border",
                                        fired
                                            ? TONE_TILE[tone]
                                            : "border-border/60 bg-muted/25 text-muted-foreground/45",
                                    )}
                                >
                                    <Icon size={14} />
                                </span>

                                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                                    <span className="flex min-w-0 items-center gap-2">
                                        <span
                                            className={cn(
                                                "min-w-0 truncate text-[13.5px] font-medium leading-tight",
                                                fired ? "text-foreground/90" : "text-muted-foreground/70",
                                            )}
                                        >
                                            {described.title}
                                        </span>
                                        {burst.count > 1 && <BurstBadge count={burst.count} />}
                                    </span>

                                    <span className="flex min-w-0 items-center gap-2">
                                        <EventTypeBadge
                                            type={burst.latest.event_type}
                                            title={burst.latest.event_type}
                                            className="max-w-[180px] shrink-0"
                                        />
                                        {burst.count > 1 ? (
                                            <span className="hidden min-w-0 flex-1 truncate font-mono text-[9.5px] text-muted-foreground/45 sm:inline">
                                                {formatClockTime(burst.oldest.triggered_at)} →{" "}
                                                {formatClockTime(burst.latest.triggered_at)}
                                            </span>
                                        ) : (
                                            described.detail && (
                                                <span className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-muted-foreground/40">
                                                    {described.detail}
                                                </span>
                                            )
                                        )}
                                    </span>
                                </span>

                                <span className="flex shrink-0 flex-col items-end gap-1.5">
                                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
                                        {formatClockTime(burst.latest.triggered_at)}
                                    </span>
                                    <span
                                        className={cn(
                                            "flex items-center gap-1.5 font-mono text-[9.5px]",
                                            fired
                                                ? "text-violet-600/70 dark:text-violet-300/60"
                                                : "text-muted-foreground/35",
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "size-1.5 rounded-full",
                                                fired ? "bg-violet-500" : "border border-muted-foreground/40",
                                            )}
                                        />
                                        {burst.actionCount > 0
                                            ? `${burst.actionCount} act${burst.actionCount === 1 ? "" : "s"}`
                                            : "no rule"}
                                    </span>
                                </span>
                            </button>
                        );
                    })
                )}
            </div>

            <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-border/60 px-4 font-mono text-[9.5px] text-muted-foreground/40">
                <span className="flex items-center gap-2">
                    <span
                        className={cn(
                            "size-1.5 rounded-full",
                            paused ? "bg-amber-500" : "bg-emerald-500/70 animate-pulse",
                        )}
                    />
                    {paused ? "stream paused" : "live edge"}
                </span>
                <span>
                    buffer {totalEvents}/{capacity}
                </span>
            </div>
        </div>
    );
}
