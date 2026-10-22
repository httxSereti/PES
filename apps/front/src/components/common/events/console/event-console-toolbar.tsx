import { useMemo } from "react";
import { Check, ChevronDown, Pause, Play, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@pes/ui/components/popover";
import { Button } from "@pes/ui/components/button";
import { Switch } from "@pes/ui/components/switch";
import { cn } from "@pes/ui/lib/utils";
import type { TriggeredEvent } from "@/store/slices/eventsSlice";
import {
    TIME_WINDOWS,
    countActiveFilters,
    parseOrigin,
    toggleValue,
    type EventsFilterState,
    type TimeWindowKey,
} from "@/components/common/events/events-filters";
import { EventFilterPopover } from "./event-filter-popover";
import { humanizeEventType } from "@/lib/trigger-rules/describe-event";

function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded border border-violet-500/25 bg-violet-500/10 px-2 py-1 font-mono text-[10px] font-medium text-violet-700 dark:text-violet-300">
            {label}
            <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove filter ${label}`}
                className="cursor-pointer opacity-60 hover:opacity-100"
            >
                <X size={9} />
            </button>
        </span>
    );
}

function SourceFilter({
    events,
    filter,
    onChange,
}: {
    events: TriggeredEvent[];
    filter: EventsFilterState;
    onChange: (patch: Partial<EventsFilterState>) => void;
}) {
    const providers = useMemo(() => {
        const set = new Set<string>();
        for (const event of events) {
            const origin = parseOrigin(event.origin);
            if (origin) set.add(origin.provider);
        }
        return Array.from(set).sort();
    }, [events]);

    if (providers.length === 0) return null;

    const label =
        filter.providers.length === 0
            ? "All sources"
            : filter.providers.length === 1
              ? (filter.providers[0] ?? "1 source")
              : `${filter.providers.length} sources`;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                        "gap-1.5 text-[12px]",
                        filter.providers.length > 0 &&
                            "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
                    )}
                >
                    {label}
                    <ChevronDown size={12} className="text-muted-foreground/60" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={6} className="w-60 p-1">
                <button
                    type="button"
                    onClick={() => onChange({ providers: [] })}
                    className="flex w-full cursor-pointer items-center justify-between rounded px-2.5 py-2 text-left text-[13px] text-foreground hover:bg-muted"
                >
                    All sources
                    {filter.providers.length === 0 && <Check size={14} className="text-violet-500" />}
                </button>
                {providers.map((provider) => {
                    const selected = filter.providers.includes(provider);
                    return (
                        <button
                            key={provider}
                            type="button"
                            onClick={() => onChange({ providers: toggleValue(filter.providers, provider) })}
                            className="flex w-full cursor-pointer items-center justify-between rounded px-2.5 py-2 text-left text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            {provider}
                            {selected && <Check size={14} className="text-violet-500" />}
                        </button>
                    );
                })}
            </PopoverContent>
        </Popover>
    );
}

function TimeFilter({
    filter,
    onChange,
}: {
    filter: EventsFilterState;
    onChange: (patch: Partial<EventsFilterState>) => void;
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                        "gap-1.5 text-[12px]",
                        filter.timeWindow !== "all" &&
                            "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
                    )}
                >
                    {TIME_WINDOWS[filter.timeWindow].label}
                    <ChevronDown size={12} className="text-muted-foreground/60" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={6} className="w-44 p-1">
                {(Object.keys(TIME_WINDOWS) as TimeWindowKey[]).map((key) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onChange({ timeWindow: key })}
                        className="flex w-full cursor-pointer items-center justify-between rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        {TIME_WINDOWS[key].label}
                        {filter.timeWindow === key && <Check size={12} className="text-violet-500" />}
                    </button>
                ))}
            </PopoverContent>
        </Popover>
    );
}

export interface EventConsoleToolbarProps {
    events: TriggeredEvent[];
    filter: EventsFilterState;
    onFilterChange: (patch: Partial<EventsFilterState>) => void;
    onReset: () => void;
    paused: boolean;
    newCount: number;
    rate: number;
    onTogglePause: () => void;
    groupBursts: boolean;
    onGroupBurstsChange: (value: boolean) => void;
    searchRef: React.RefObject<HTMLInputElement | null>;
    filteredCount: number;
    totalCount: number;
}

export function EventConsoleToolbar({
    events,
    filter,
    onFilterChange,
    onReset,
    paused,
    newCount,
    rate,
    onTogglePause,
    groupBursts,
    onGroupBurstsChange,
    searchRef,
    filteredCount,
    totalCount,
}: EventConsoleToolbarProps) {
    const activeCount = countActiveFilters(filter);

    return (
        <div className="min-w-0 border-b border-border/60 bg-background/40">
            <div className="flex min-w-0 flex-wrap items-center gap-2.5 px-4 py-3">
                <div className="relative">
                    <Search
                        size={14}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50"
                    />
                    <input
                        ref={searchRef}
                        type="text"
                        value={filter.search}
                        onChange={(event) => onFilterChange({ search: event.target.value })}
                        placeholder="Search events, rules, payload…"
                        aria-label="Search triggered events"
                        className="h-9 w-[280px] max-w-full rounded-md border border-border bg-muted/40 pl-9 pr-3 text-[13px] text-foreground outline-none transition placeholder:text-muted-foreground/40 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
                    />
                    {filter.search && (
                        <button
                            type="button"
                            onClick={() => onFilterChange({ search: "" })}
                            aria-label="Clear search"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground/50 hover:text-foreground"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>

                <span className="hidden h-6 w-px bg-border/70 md:block" />

                <SourceFilter events={events} filter={filter} onChange={onFilterChange} />

                <label htmlFor="events-fired-only" className="flex cursor-pointer items-center gap-2">
                    <Switch
                        id="events-fired-only"
                        checked={filter.triggered === "yes"}
                        onCheckedChange={(checked) => onFilterChange({ triggered: checked ? "yes" : "any" })}
                    />
                    <span className="text-[12.5px] text-muted-foreground/80">Fired only</span>
                </label>

                <TimeFilter filter={filter} onChange={onFilterChange} />

                <EventFilterPopover
                    events={events}
                    filter={filter}
                    onChange={onFilterChange}
                    onReset={onReset}
                    activeCount={activeCount}
                />

                <label htmlFor="events-group-bursts" className="flex cursor-pointer items-center gap-2">
                    <Switch id="events-group-bursts" checked={groupBursts} onCheckedChange={onGroupBurstsChange} />
                    <span className="text-[12.5px] text-muted-foreground/80">Group repeated</span>
                </label>

                <div className="ml-auto flex items-center gap-2.5">
                    <span className="hidden h-6 w-px bg-border/70 md:block" />
                    <span className="flex items-center gap-2" role="status">
                        <span className={cn("size-2 rounded-full", paused ? "bg-amber-500" : "bg-emerald-500")} />
                        <span className="font-mono text-[10px] text-muted-foreground">
                            {paused ? "PAUSED" : "LIVE"} · {rate}/min
                        </span>
                    </span>

                    {paused && newCount > 0 && (
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 font-mono text-[10px] text-amber-700 dark:text-amber-300">
                            {newCount} new
                        </span>
                    )}

                    <Button
                        type="button"
                        variant={paused ? "default" : "outline"}
                        size="sm"
                        onClick={onTogglePause}
                        title={paused ? "Resume the live stream" : "Pause the stream while you read"}
                    >
                        {paused ? <Play size={12} /> : <Pause size={12} />}
                        {paused ? "Resume" : "Pause"}
                    </Button>
                </div>
            </div>

            {(activeCount > 0 || filteredCount !== totalCount) && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border/40 px-4 py-2">
                    <span className="font-mono text-[10px] text-muted-foreground/45">
                        {filteredCount} / {totalCount}
                    </span>

                    {filter.providers.map((provider) => (
                        <RemovableChip
                            key={`provider-${provider}`}
                            label={provider}
                            onRemove={() =>
                                onFilterChange({
                                    providers: toggleValue(filter.providers, provider),
                                })
                            }
                        />
                    ))}
                    {filter.timeWindow !== "all" && (
                        <RemovableChip
                            label={TIME_WINDOWS[filter.timeWindow].label}
                            onRemove={() => onFilterChange({ timeWindow: "all" })}
                        />
                    )}
                    {filter.triggered === "yes" && (
                        <RemovableChip label="Fired only" onRemove={() => onFilterChange({ triggered: "any" })} />
                    )}
                    {filter.types.map((type) => (
                        <RemovableChip
                            key={`type-${type}`}
                            label={humanizeEventType(type)}
                            onRemove={() => onFilterChange({ types: toggleValue(filter.types, type) })}
                        />
                    ))}
                    {filter.modules.map((module) => (
                        <RemovableChip
                            key={`module-${module}`}
                            label={module}
                            onRemove={() => onFilterChange({ modules: toggleValue(filter.modules, module) })}
                        />
                    ))}
                    {filter.rules.map((rule) => (
                        <RemovableChip
                            key={`rule-${rule}`}
                            label={rule}
                            onRemove={() => onFilterChange({ rules: toggleValue(filter.rules, rule) })}
                        />
                    ))}
                    {filter.actionTypes.map((action) => (
                        <RemovableChip
                            key={`action-${action}`}
                            label={action}
                            onRemove={() =>
                                onFilterChange({
                                    actionTypes: toggleValue(filter.actionTypes, action),
                                })
                            }
                        />
                    ))}

                    {activeCount > 0 && (
                        <button
                            type="button"
                            onClick={onReset}
                            className="ml-1 cursor-pointer text-[10px] text-muted-foreground/60 underline underline-offset-2 hover:text-foreground"
                        >
                            Clear all
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
