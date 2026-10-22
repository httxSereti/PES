import { useMemo } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@pes/ui/components/popover";
import { Button } from "@pes/ui/components/button";
import type { TriggeredEvent } from "@/store/slices/eventsSlice";
import {
    parseOrigin,
    toggleGroupTypes,
    toggleValue,
    type EventsFilterState,
} from "@/components/common/events/events-filters";
import { useEventCatalog } from "@/components/common/events/event-groups";

function FilterChip({
    selected,
    onClick,
    children,
}: {
    selected: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex cursor-pointer items-center rounded-md border px-2.5 py-1.5 text-[12px] transition ${
                selected
                    ? "border-violet-500/40 bg-violet-500/15 font-medium text-violet-700 dark:text-violet-200"
                    : "border-border bg-muted/40 text-muted-foreground/70 hover:border-muted-foreground/30 hover:text-foreground"
            }`}
        >
            {children}
        </button>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/50">
                {title}
            </div>
            {children}
        </div>
    );
}

function shortType(type: string) {
    return type.replace(/^[^_]+_/, "");
}

/** Advanced facets: event types, modules, rules and action types. */
export function EventFilterPopover({
    events,
    filter,
    onChange,
    onReset,
    activeCount,
}: {
    events: TriggeredEvent[];
    filter: EventsFilterState;
    onChange: (patch: Partial<EventsFilterState>) => void;
    onReset: () => void;
    activeCount: number;
}) {
    const { grouped, groups: groupDefs, knownTypes } = useEventCatalog();

    const facets = useMemo(() => {
        const modules = new Set<string>();
        const rules = new Set<string>();
        const actionTypes = new Set<string>();
        const unknown = new Set<string>();

        for (const event of events) {
            const origin = parseOrigin(event.origin);
            if (origin) modules.add(origin.module);
            if (!knownTypes.has(event.event_type)) unknown.add(event.event_type);

            for (const rule of event.triggered_rules ?? []) {
                rules.add(rule.rule_name);
                for (const action of rule.actions) actionTypes.add(action.action_type);
            }
        }

        return {
            modules: Array.from(modules).sort(),
            rules: Array.from(rules).sort(),
            actionTypes: Array.from(actionTypes).sort(),
            unknown: Array.from(unknown).sort(),
        };
    }, [events, knownTypes]);

    const typeGroups: Array<[string, string[]]> = Object.entries(grouped);
    if (facets.unknown.length > 0) typeGroups.push(["other", facets.unknown]);

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="gap-1.5 text-[12px]">
                    <SlidersHorizontal size={13} />
                    Filters
                    {activeCount > 0 && (
                        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-violet-500 px-1 text-[10px] font-semibold text-white">
                            {activeCount}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>

            <PopoverContent
                align="start"
                sideOffset={6}
                className="max-h-[min(70vh,560px)] w-[min(400px,calc(100vw-2rem))] space-y-5 overflow-y-auto p-5"
            >
                <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">Advanced filters</span>
                    {activeCount > 0 && (
                        <button
                            type="button"
                            onClick={onReset}
                            className="cursor-pointer text-[11px] text-violet-600 hover:underline dark:text-violet-400"
                        >
                            Reset all
                        </button>
                    )}
                </div>

                <Section title="Event types">
                    <div className="space-y-2.5">
                        {typeGroups.map(([groupKey, types]) => {
                            const isUnknown = groupKey === "other";
                            const allSelected = types.every((type) => filter.types.includes(type));

                            return (
                                <div key={groupKey} className="space-y-1.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[12px] font-medium text-muted-foreground/80">
                                            {isUnknown ? "Other / unknown" : (groupDefs[groupKey]?.label ?? groupKey)}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onChange({
                                                    types: toggleGroupTypes(types, filter.types),
                                                })
                                            }
                                            className="cursor-pointer text-[10px] uppercase tracking-wide text-violet-600/70 hover:text-violet-600 dark:text-violet-400/70 dark:hover:text-violet-300"
                                        >
                                            {allSelected ? "clear" : "all"}
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {types.map((type) => (
                                            <FilterChip
                                                key={type}
                                                selected={filter.types.includes(type)}
                                                onClick={() => onChange({ types: toggleValue(filter.types, type) })}
                                            >
                                                {isUnknown ? type : shortType(type)}
                                            </FilterChip>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Section>

                {facets.modules.length > 0 && (
                    <Section title="Module / action">
                        <div className="flex flex-wrap gap-1.5">
                            {facets.modules.map((module) => (
                                <FilterChip
                                    key={module}
                                    selected={filter.modules.includes(module)}
                                    onClick={() => onChange({ modules: toggleValue(filter.modules, module) })}
                                >
                                    {module}
                                </FilterChip>
                            ))}
                        </div>
                    </Section>
                )}

                {facets.rules.length > 0 && (
                    <Section title="Rule">
                        <div className="flex flex-wrap gap-1.5">
                            {facets.rules.map((rule) => (
                                <FilterChip
                                    key={rule}
                                    selected={filter.rules.includes(rule)}
                                    onClick={() => onChange({ rules: toggleValue(filter.rules, rule) })}
                                >
                                    {rule}
                                </FilterChip>
                            ))}
                        </div>
                    </Section>
                )}

                {facets.actionTypes.length > 0 && (
                    <Section title="Action type">
                        <div className="flex flex-wrap gap-1.5">
                            {facets.actionTypes.map((action) => (
                                <FilterChip
                                    key={action}
                                    selected={filter.actionTypes.includes(action)}
                                    onClick={() =>
                                        onChange({
                                            actionTypes: toggleValue(filter.actionTypes, action),
                                        })
                                    }
                                >
                                    {action}
                                </FilterChip>
                            ))}
                        </div>
                    </Section>
                )}
            </PopoverContent>
        </Popover>
    );
}
