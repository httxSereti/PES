import { useCallback, useState, useMemo } from "react";
import { useAppSelector } from "@/store/hooks";
import {
    DEFAULT_EVENTS_FILTER,
    matchesEventFilters,
    type EventsFilterState,
} from "@/components/common/events/events-filters";
import { EventsToolbar } from "@/components/common/events/events-toolbar";
import { EventCard, EventRow } from "@/components/common/events/event-row";

export default function EventsTable() {
    const events = useAppSelector(state => state.events.events);
    const [filter, setFilter] = useState<EventsFilterState>(DEFAULT_EVENTS_FILTER);
    const [sortDesc, setSortDesc] = useState(true);

    const patchFilter = useCallback((patch: Partial<EventsFilterState>) => {
        setFilter(prev => ({ ...prev, ...patch }));
    }, []);

    const filtered = useMemo(() => {
        const list = events.filter(e => matchesEventFilters(e, filter));
        return sortDesc ? [...list].reverse() : list;
    }, [events, filter, sortDesc]);

    return (
        <div className="space-y-4 px-4 md:px-5">
            <EventsToolbar
                events={events}
                filter={filter}
                onFilterChange={patchFilter}
                onReset={() => setFilter(DEFAULT_EVENTS_FILTER)}
                filteredCount={filtered.length}
                totalCount={events.length}
                sortDesc={sortDesc}
                onSortToggle={() => setSortDesc(v => !v)}
            />

            <div className="hidden md:block rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border bg-muted/40">
                            {["Time", "Type", "Origin", "Triggered rules", ""].map((h, i) => (
                                <th key={i} className="py-2.5 px-2 first:pl-4 last:pr-4 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="py-16 text-center text-sm text-muted-foreground/40 italic">
                                    {events.length === 0 ? "Waiting for events..." : "No events match your filters"}
                                </td>
                            </tr>
                        ) : (
                            filtered.map(event => <EventRow key={event.id} event={event} />)
                        )}
                    </tbody>
                </table>
            </div>

            <div className="flex flex-col gap-2 md:hidden">
                {filtered.length === 0 ? (
                    <p className="py-16 text-center text-sm text-muted-foreground/40 italic">
                        {events.length === 0 ? "Waiting for events..." : "No events match your filters"}
                    </p>
                ) : (
                    filtered.map(event => <EventCard key={event.id} event={event} />)
                )}
            </div>
        </div>
    );
}