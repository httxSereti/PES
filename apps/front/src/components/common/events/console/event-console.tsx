import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@pes/ui/components/sheet";
import { useAppSelector } from "@/store/hooks";
import type { TriggeredEvent } from "@/store/slices/eventsSlice";
import {
    DEFAULT_EVENTS_FILTER,
    matchesEventFilters,
    type EventsFilterState,
} from "@/components/common/events/events-filters";
import { groupEventBursts, singleEventGroup, type EventBurst } from "@/lib/trigger-rules/event-bursts";
import { computeEventStats } from "@/lib/trigger-rules/event-stats";
import { EventStats } from "./event-stats";
import { EventConsoleToolbar } from "./event-console-toolbar";
import { EventStream } from "./event-stream";
import { EventInspector } from "./event-inspector";

const DESKTOP_QUERY = "(min-width: 1280px)";

function timeOf(event: TriggeredEvent): number {
    const time = new Date(event.triggered_at).getTime();
    return Number.isNaN(time) ? 0 : time;
}

export default function EventConsole() {
    const events = useAppSelector((state) => state.events.events);
    const capacity = useAppSelector((state) => state.events.maxEvents);

    const [filter, setFilter] = useState<EventsFilterState>(DEFAULT_EVENTS_FILTER);
    const [sortDesc, setSortDesc] = useState(true);
    const [groupBursts, setGroupBursts] = useState(true);

    const [paused, setPaused] = useState(false);
    const [frozen, setFrozen] = useState<TriggeredEvent[] | null>(null);
    const [frozenAt, setFrozenAt] = useState<number | null>(null);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [isDesktop, setIsDesktop] = useState(
        () => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches,
    );

    const [now, setNow] = useState(() => Date.now());
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 15_000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        const query = window.matchMedia(DESKTOP_QUERY);
        const onChange = () => setIsDesktop(query.matches);
        query.addEventListener("change", onChange);
        return () => query.removeEventListener("change", onChange);
    }, []);

    const sourceEvents = paused && frozen ? frozen : events;

    const filtered = useMemo(() => {
        const list = sourceEvents.filter((event) => matchesEventFilters(event, filter));
        list.sort((a, b) => timeOf(a) - timeOf(b));
        return list;
    }, [sourceEvents, filter]);

    const groups = useMemo(() => {
        const newestFirst = [...filtered].reverse();
        const grouped = groupBursts ? groupEventBursts(newestFirst) : newestFirst.map(singleEventGroup);
        return sortDesc ? grouped : grouped.reverse();
    }, [filtered, groupBursts, sortDesc]);

    const selectedBurst = useMemo(
        () => groups.find((group) => group.events.some((event) => event.id === selectedId)) ?? groups[0] ?? null,
        [groups, selectedId],
    );

    const stats = useMemo(() => computeEventStats(events, capacity, now), [events, capacity, now]);

    const newCount = useMemo(() => {
        if (!paused || frozenAt === null) return 0;
        return events.filter((event) => timeOf(event) > frozenAt).length;
    }, [events, paused, frozenAt]);

    const patchFilter = useCallback((patch: Partial<EventsFilterState>) => {
        setFilter((previous) => ({ ...previous, ...patch }));
    }, []);

    const resetFilters = useCallback(() => setFilter(DEFAULT_EVENTS_FILTER), []);

    const togglePause = useCallback(() => {
        if (paused) {
            setPaused(false);
            setFrozen(null);
            setFrozenAt(null);
            return;
        }

        const newest = events.reduce((latest, event) => Math.max(latest, timeOf(event)), 0);
        setFrozen(events);
        setFrozenAt(newest);
        setPaused(true);
    }, [paused, events]);

    const selectBurst = useCallback(
        (burst: EventBurst) => {
            setSelectedId(burst.latest.id);
            if (!isDesktop) setSheetOpen(true);
        },
        [isDesktop],
    );

    const moveSelection = useCallback(
        (delta: number) => {
            if (groups.length === 0) return;
            const index = groups.findIndex((group) => group.events.some((event) => event.id === selectedId));
            const next = index === -1 ? 0 : Math.min(groups.length - 1, Math.max(0, index + delta));
            const group = groups[next];
            if (group) setSelectedId(group.latest.id);
        },
        [groups, selectedId],
    );

    const filterType = useCallback((type: string) => {
        setFilter((previous) => ({ ...previous, types: [type], triggered: "any" }));
    }, []);

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            const target = event.target as HTMLElement | null;
            if (
                target &&
                (target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.tagName === "SELECT" ||
                    target.isContentEditable)
            ) {
                return;
            }
            if (event.metaKey || event.ctrlKey || event.altKey) return;

            const interactive = target?.closest("button, a, [role='button']");

            if (event.key === "j" || event.key === "ArrowDown") {
                event.preventDefault();
                moveSelection(1);
            } else if (event.key === "k" || event.key === "ArrowUp") {
                event.preventDefault();
                moveSelection(-1);
            } else if (event.key === " ") {
                if (interactive) return;
                event.preventDefault();
                togglePause();
            } else if (event.key === "/") {
                event.preventDefault();
                searchRef.current?.focus();
            }
        }

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [moveSelection, togglePause]);

    return (
        <div className="min-w-0 px-4 md:px-5">
            <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card/40 xl:h-[calc(100dvh-14rem)] xl:min-h-[600px]">
                <EventStats stats={stats} />

                <EventConsoleToolbar
                    events={sourceEvents}
                    filter={filter}
                    onFilterChange={patchFilter}
                    onReset={resetFilters}
                    paused={paused}
                    newCount={newCount}
                    rate={stats.rate}
                    onTogglePause={togglePause}
                    groupBursts={groupBursts}
                    onGroupBurstsChange={setGroupBursts}
                    searchRef={searchRef}
                    filteredCount={filtered.length}
                    totalCount={sourceEvents.length}
                />

                <div className="flex min-h-0 flex-1">
                    <div className="h-[min(70vh,760px)] w-full xl:h-full xl:w-[420px] xl:shrink-0 xl:border-r xl:border-border/60">
                        <EventStream
                            groups={groups}
                            selectedId={selectedId}
                            onSelect={selectBurst}
                            sortDesc={sortDesc}
                            onToggleSort={() => setSortDesc((value) => !value)}
                            totalEvents={sourceEvents.length}
                            capacity={capacity}
                            paused={paused}
                            onClearFilters={resetFilters}
                        />
                    </div>

                    <div className="hidden min-w-0 flex-1 xl:flex">
                        {selectedBurst ? (
                            <EventInspector
                                key={selectedBurst.key}
                                burst={selectedBurst}
                                events={sourceEvents}
                                onFilterType={filterType}
                                onSelectEvent={(event) => setSelectedId(event.id)}
                            />
                        ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-8 text-center">
                                <p className="text-sm text-muted-foreground/55">Select an event to inspect it</p>
                                <p className="font-mono text-[10px] text-muted-foreground/35">
                                    the inspector follows j / k
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
                    <SheetTitle className="sr-only">Triggered event details</SheetTitle>
                    <SheetDescription className="sr-only">
                        Payload, matched rules and actions for the selected event.
                    </SheetDescription>
                    {selectedBurst && (
                        <EventInspector
                            key={selectedBurst.key}
                            inSheet
                            burst={selectedBurst}
                            events={sourceEvents}
                            onFilterType={(type) => {
                                filterType(type);
                                setSheetOpen(false);
                            }}
                            onSelectEvent={(event) => setSelectedId(event.id)}
                        />
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}
