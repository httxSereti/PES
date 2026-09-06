import { useMemo } from "react";
import {
    ArrowDownWideNarrow,
    ArrowUpNarrowWide,
    Search,
    SlidersHorizontal,
    X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@pes/ui/components/popover";
import type { TriggeredEvent } from "@/store/slices/eventsSlice";
import {
    TIME_WINDOWS,
    TRIGGERED_FILTER_LABELS,
    countActiveFilters,
    parseOrigin,
    toggleGroupTypes,
    toggleValue,
    type EventsFilterState,
    type TriggeredFilterMode,
    type TimeWindowKey,
} from "./events-filters";
import { ALL_KNOWN_TYPES, EVENT_GROUPS, STATIC_GROUPED } from "./event-groups";

interface EventsToolbarProps {
    events: TriggeredEvent[];
    filter: EventsFilterState;
    onFilterChange: (patch: Partial<EventsFilterState>) => void;
    onReset: () => void;
    filteredCount: number;
    totalCount: number;
    sortDesc: boolean;
    onSortToggle: () => void;
}

function FilterChip({ selected, onClick, children }: {
    selected: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] border transition cursor-pointer ${
                selected
                    ? "bg-purple-500/15 border-purple-500/40 text-purple-700 dark:text-purple-200 font-medium"
                    : "bg-muted/40 border-border text-muted-foreground/70 hover:text-foreground hover:border-muted-foreground/30"
            }`}
        >
            {children}
        </button>
    );
}

function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-purple-500/10 border border-purple-500/25 text-purple-700 dark:text-purple-300">
            {label}
            <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove filter ${label}`}
                className="opacity-60 hover:opacity-100 cursor-pointer"
            >
                <X size={9} />
            </button>
        </span>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold">
                {title}
            </div>
            {children}
        </div>
    );
}

function shortType(type: string) {
    return type.replace(/^[^_]+_/, "");
}

export function EventsToolbar({
    events,
    filter,
    onFilterChange,
    onReset,
    filteredCount,
    totalCount,
    sortDesc,
    onSortToggle,
}: EventsToolbarProps) {
    const activeCount = countActiveFilters(filter);

    // Facets derived from the events currently in memory
    const facets = useMemo(() => {
        const providers = new Set<string>();
        const modules = new Set<string>();
        const rules = new Set<string>();
        const actionTypes = new Set<string>();
        const unknown = new Set<string>();

        for (const e of events) {
            const o = parseOrigin(e.origin);
            if (o) {
                providers.add(o.provider);
                modules.add(o.module);
            }
            if (!ALL_KNOWN_TYPES.has(e.event_type)) unknown.add(e.event_type);
            for (const r of e.triggered_rules ?? []) {
                rules.add(r.rule_name);
                for (const a of r.actions) actionTypes.add(a.action_type);
            }
        }

        return {
            providers: Array.from(providers).sort(),
            modules: Array.from(modules).sort(),
            rules: Array.from(rules).sort(),
            actionTypes: Array.from(actionTypes).sort(),
            unknown: Array.from(unknown).sort(),
        };
    }, [events]);

    const groups: Array<[string, string[]]> = Object.entries(STATIC_GROUPED);
    if (facets.unknown.length > 0) groups.push(["other", facets.unknown]);

    return (
        <div className="space-y-2.5">
            <div className="flex items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 max-w-sm">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                    <input
                        id="events-search"
                        type="text"
                        value={filter.search}
                        onChange={e => onFilterChange({ search: e.target.value })}
                        placeholder="Search type, origin, rule, data..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/50 border border-border rounded-md text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition"
                    />
                </div>

                {/* Advanced filters */}
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-md transition cursor-pointer ${
                                activeCount > 0
                                    ? "bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-300"
                                    : "bg-muted/50 border-border text-muted-foreground/70 hover:text-foreground"
                            }`}
                        >
                            <SlidersHorizontal size={12} />
                            Filters
                            {activeCount > 0 && (
                                <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-purple-500 text-white text-[9px] font-semibold">
                                    {activeCount}
                                </span>
                            )}
                        </button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="end"
                        sideOffset={6}
                        className="w-[min(360px,calc(100vw-2rem))] p-4 space-y-4 max-h-[min(75vh,540px)] overflow-y-auto"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">Advanced filters</span>
                            {activeCount > 0 && (
                                <button
                                    type="button"
                                    onClick={onReset}
                                    className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
                                >
                                    Reset all
                                </button>
                            )}
                        </div>

                        <Section title="Period">
                            <div className="flex flex-wrap gap-1">
                                {(Object.keys(TIME_WINDOWS) as TimeWindowKey[]).map(key => (
                                    <FilterChip
                                        key={key}
                                        selected={filter.timeWindow === key}
                                        onClick={() => onFilterChange({ timeWindow: key })}
                                    >
                                        {TIME_WINDOWS[key].label}
                                    </FilterChip>
                                ))}
                            </div>
                        </Section>

                        <Section title="Triggered rules">
                            <div className="flex flex-wrap gap-1">
                                {(Object.keys(TRIGGERED_FILTER_LABELS) as TriggeredFilterMode[]).map(mode => (
                                    <FilterChip
                                        key={mode}
                                        selected={filter.triggered === mode}
                                        onClick={() => onFilterChange({ triggered: mode })}
                                    >
                                        {TRIGGERED_FILTER_LABELS[mode]}
                                    </FilterChip>
                                ))}
                            </div>
                        </Section>

                        <Section title="Event types">
                            <div className="space-y-2.5">
                                {groups.map(([groupKey, types]) => {
                                    const isUnknownGroup = groupKey === "other";
                                    const allSelected = types.every(t => filter.types.includes(t));
                                    return (
                                        <div key={groupKey} className="space-y-1.5">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[11px] font-medium text-muted-foreground/80">
                                                    {isUnknownGroup ? "Other / unknown" : EVENT_GROUPS[groupKey]?.label ?? groupKey}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => onFilterChange({ types: toggleGroupTypes(types, filter.types) })}
                                                    className="text-[9px] uppercase tracking-wide text-purple-600/70 dark:text-purple-400/70 hover:text-purple-600 dark:hover:text-purple-300 cursor-pointer"
                                                >
                                                    {allSelected ? "clear" : "all"}
                                                </button>
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                                {types.map(t => (
                                                    <FilterChip
                                                        key={t}
                                                        selected={filter.types.includes(t)}
                                                        onClick={() => onFilterChange({ types: toggleValue(filter.types, t) })}
                                                    >
                                                        {isUnknownGroup ? t : shortType(t)}
                                                    </FilterChip>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Section>

                        {facets.providers.length > 0 && (
                            <Section title="Provider">
                                <div className="flex flex-wrap gap-1">
                                    {facets.providers.map(p => (
                                        <FilterChip
                                            key={p}
                                            selected={filter.providers.includes(p)}
                                            onClick={() => onFilterChange({ providers: toggleValue(filter.providers, p) })}
                                        >
                                            {p}
                                        </FilterChip>
                                    ))}
                                </div>
                            </Section>
                        )}

                        {facets.modules.length > 0 && (
                            <Section title="Module / action">
                                <div className="flex flex-wrap gap-1">
                                    {facets.modules.map(m => (
                                        <FilterChip
                                            key={m}
                                            selected={filter.modules.includes(m)}
                                            onClick={() => onFilterChange({ modules: toggleValue(filter.modules, m) })}
                                        >
                                            {m}
                                        </FilterChip>
                                    ))}
                                </div>
                            </Section>
                        )}

                        {facets.rules.length > 0 && (
                            <Section title="Rule">
                                <div className="flex flex-wrap gap-1">
                                    {facets.rules.map(r => (
                                        <FilterChip
                                            key={r}
                                            selected={filter.rules.includes(r)}
                                            onClick={() => onFilterChange({ rules: toggleValue(filter.rules, r) })}
                                        >
                                            {r}
                                        </FilterChip>
                                    ))}
                                </div>
                            </Section>
                        )}

                        {facets.actionTypes.length > 0 && (
                            <Section title="Action type">
                                <div className="flex flex-wrap gap-1">
                                    {facets.actionTypes.map(a => (
                                        <FilterChip
                                            key={a}
                                            selected={filter.actionTypes.includes(a)}
                                            onClick={() => onFilterChange({ actionTypes: toggleValue(filter.actionTypes, a) })}
                                        >
                                            {a}
                                        </FilterChip>
                                    ))}
                                </div>
                            </Section>
                        )}
                    </PopoverContent>
                </Popover>

                {/* Sort order */}
                <button
                    type="button"
                    onClick={onSortToggle}
                    title={sortDesc ? "Newest first" : "Oldest first"}
                    className="p-1.5 text-xs bg-muted/50 border border-border rounded-md text-muted-foreground/70 hover:text-foreground transition cursor-pointer"
                >
                    {sortDesc ? <ArrowDownWideNarrow size={13} /> : <ArrowUpNarrowWide size={13} />}
                </button>

                <span className="ml-auto text-xs text-muted-foreground/50 whitespace-nowrap">
                    {filteredCount} / {totalCount}
                </span>
            </div>

            {/* Active filter chips */}
            {activeCount > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    {filter.search.trim() !== "" && (
                        <RemovableChip label={`"${filter.search.trim()}"`} onRemove={() => onFilterChange({ search: "" })} />
                    )}
                    {filter.timeWindow !== "all" && (
                        <RemovableChip label={TIME_WINDOWS[filter.timeWindow].label} onRemove={() => onFilterChange({ timeWindow: "all" })} />
                    )}
                    {filter.triggered !== "any" && (
                        <RemovableChip label={TRIGGERED_FILTER_LABELS[filter.triggered]} onRemove={() => onFilterChange({ triggered: "any" })} />
                    )}
                    {filter.types.map(t => (
                        <RemovableChip
                            key={`type-${t}`}
                            label={shortType(t)}
                            onRemove={() => onFilterChange({ types: toggleValue(filter.types, t) })}
                        />
                    ))}
                    {filter.providers.map(p => (
                        <RemovableChip
                            key={`provider-${p}`}
                            label={p}
                            onRemove={() => onFilterChange({ providers: toggleValue(filter.providers, p) })}
                        />
                    ))}
                    {filter.modules.map(m => (
                        <RemovableChip
                            key={`module-${m}`}
                            label={m}
                            onRemove={() => onFilterChange({ modules: toggleValue(filter.modules, m) })}
                        />
                    ))}
                    {filter.rules.map(r => (
                        <RemovableChip
                            key={`rule-${r}`}
                            label={r}
                            onRemove={() => onFilterChange({ rules: toggleValue(filter.rules, r) })}
                        />
                    ))}
                    {filter.actionTypes.map(a => (
                        <RemovableChip
                            key={`action-${a}`}
                            label={a}
                            onRemove={() => onFilterChange({ actionTypes: toggleValue(filter.actionTypes, a) })}
                        />
                    ))}
                    <button
                        type="button"
                        onClick={onReset}
                        className="text-[10px] text-muted-foreground/50 hover:text-foreground underline underline-offset-2 ml-1 cursor-pointer"
                    >
                        Clear all
                    </button>
                </div>
            )}
        </div>
    );
}
