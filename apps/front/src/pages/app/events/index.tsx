import { useState, useMemo, useCallback } from "react";
import { useAppSelector } from "@/store/hooks";
import { ALL_KNOWN_TYPES, EVENT_GROUPS, getEventGroup } from "@/components/common/events/event-groups";
import { EventsToolbar } from "@/components/common/events/events-toolbar";
import { EventRow } from "@/components/common/events/event-row";
import type { Route } from ".react-router/types/src/pages/app/events/+types";

// eslint-disable-next-line no-empty-pattern
export function meta({ }: Route.MetaArgs) {
    return [
        { title: "PES | Events" },
        { name: "description", content: "Realtime events feed" },
    ];
}

export default function EventsPage() {
    const events = useAppSelector(state => state.events.events);
    const [search, setSearch] = useState("");
    const [selectedFilter, setSelectedFilter] = useState("all");

    const unknownTypes = useMemo(() =>
        Array.from(new Set(
            events.map(e => e.event_type).filter(t => !ALL_KNOWN_TYPES.has(t))
        )).sort()
        , [events]);

    const filtered = useMemo(() => {
        return [...events].reverse().filter(e => {
            const matchesFilter =
                selectedFilter === "all" ? true :
                    selectedFilter in EVENT_GROUPS ? getEventGroup(e.event_type) === selectedFilter :
                        e.event_type === selectedFilter;

            const matchesSearch =
                search === "" ||
                e.event_type.includes(search.toLowerCase()) ||
                e.origin.toLowerCase().includes(search.toLowerCase());

            return matchesFilter && matchesSearch;
        });
    }, [events, selectedFilter, search]);

    const clearFilters = useCallback(() => {
        setSearch("");
        setSelectedFilter("all");
    }, []);

    return (
        <div className="space-y-4 px-5">
            <EventsToolbar
                search={search}
                onSearchChange={setSearch}
                selectedFilter={selectedFilter}
                onFilterChange={setSelectedFilter}
                unknownTypes={unknownTypes}
                filteredCount={filtered.length}
                totalCount={events.length}
            />

            <div className="rounded-xl border border-white/8 overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-white/8 bg-white/[0.025]">
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
        </div>
    );
}