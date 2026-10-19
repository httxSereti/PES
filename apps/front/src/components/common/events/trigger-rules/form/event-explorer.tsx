import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Command, ImageOff, Layers, Plus, Search, X } from "lucide-react";

import { Badge } from "@pes/ui/components/badge";
import { Button } from "@pes/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@pes/ui/components/dialog";
import { Input } from "@pes/ui/components/input";
import { cn } from "@pes/ui/lib/utils";

import { humanizeEventId, useEventCatalog, type EventCatalogEvent } from "@/components/common/events/event-groups";
import { useAppSelector } from "@/store/hooks";
import { triggerRulesSelectors } from "@/store/slices/triggerRulesSlice";
import type { TriggerRule } from "@/types";

import { EventMedia, EventSourceBadge, EventSourceIcon } from "./event-visuals";

function eventTypesOf(rule: TriggerRule): string[] {
    if (rule.event_types?.length) return rule.event_types;
    return rule.event_type ? [rule.event_type] : [];
}

function fallbackEvent(id: string): EventCatalogEvent {
    return {
        id,
        label: humanizeEventId(id),
        description: "",
        integrationId: "unknown",
        integrationName: "Unknown source",
        group: "",
        enabled: true,
        imageUrl: null,
        dataSchema: {},
    };
}

type EventExplorerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    value: string[];
    onChange: (value: string[]) => void;
};

export function EventExplorer({ open, onOpenChange, value, onChange }: EventExplorerProps) {
    const { events, groups } = useEventCatalog();
    const rules = useAppSelector(triggerRulesSelectors.selectAll);
    const [draft, setDraft] = useState<string[]>(value);
    const [query, setQuery] = useState("");
    const [source, setSource] = useState("all");
    const [group, setGroup] = useState<string | null>(null);
    const [focused, setFocused] = useState<string | null>(null);
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set(["All"]));
    const searchRef = useRef<HTMLInputElement>(null);

    const allEvents = useMemo(
        () =>
            Object.values(events).sort(
                (a, b) =>
                    a.integrationName.localeCompare(b.integrationName) ||
                    a.group.localeCompare(b.group) ||
                    a.label.localeCompare(b.label),
            ),
        [events],
    );

    const sources = useMemo(
        () =>
            Object.values(groups)
                .map((entry) => ({
                    id: entry.key,
                    label: entry.label,
                    count: entry.types.length,
                }))
                .sort((a, b) => a.label.localeCompare(b.label)),
        [groups],
    );

    const sourceGroups = useMemo(() => {
        if (source === "all") return [];
        const counts = new Map<string, number>();
        for (const event of allEvents) {
            if (event.integrationId !== source) continue;
            const key = event.group || "Events";
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return Array.from(counts.entries()).map(([label, count]) => ({
            label,
            count,
        }));
    }, [allEvents, source]);

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return allEvents.filter((event) => {
            if (source !== "all" && event.integrationId !== source) return false;
            if (group && (event.group || "Events") !== group) return false;
            if (!needle) return true;
            const payloadFields = Object.keys(event.dataSchema).join(" ");
            return `${event.label} ${event.description} ${event.id} ${event.group} ${payloadFields}`
                .toLowerCase()
                .includes(needle);
        });
    }, [allEvents, group, query, source]);

    const isSearching = query.trim().length > 0;

    const sections = useMemo(() => {
        const map = new Map<string, EventCatalogEvent[]>();
        for (const event of filtered) {
            const key = source === "all" ? event.integrationName : event.group || "Events";
            const list = map.get(key);
            if (list) list.push(event);
            else map.set(key, [event]);
        }
        return Array.from(map.entries()).map(([label, events]) => ({
            label,
            events,
        }));
    }, [filtered, source]);

    const focusedEvent =
        (focused ? events[focused] : undefined) ??
        (filtered[0] ? events[filtered[0].id] : undefined) ??
        (draft[0] ? events[draft[0]] : undefined);

    const usedBy = focusedEvent ? rules.filter((rule) => eventTypesOf(rule).includes(focusedEvent.id)).length : 0;

    useEffect(() => {
        if (!open) return;
        setDraft(value);
        setQuery("");
        setSource("all");
        setGroup(null);
        setFocused(value[0] ?? allEvents[0]?.id ?? null);
        setCollapsedSections(new Set(["All"]));
        const timer = window.setTimeout(() => searchRef.current?.focus(), 60);
        return () => window.clearTimeout(timer);
        // Reset only when the dialog opens; catalog/value updates while open
        // must not discard the user's draft selection.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        const first = filtered[0];
        if (!first) return;
        if (focused && filtered.some((event) => event.id === focused)) return;
        setFocused(first.id);
    }, [filtered, focused]);

    function handleOpenChange(next: boolean) {
        onOpenChange(next);
    }

    function toggle(id: string) {
        setFocused(id);
        setDraft((current) => (current.includes(id) ? current.filter((eventId) => eventId !== id) : [...current, id]));
    }

    function confirm() {
        onChange(draft);
        onOpenChange(false);
    }

    function toggleSection(label: string) {
        setCollapsedSections((current) => {
            const next = new Set(current);
            if (next.has(label)) next.delete(label);
            else next.add(label);
            return next;
        });
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                showCloseButton={false}
                style={{
                    maxWidth: "1120px",
                    width: "min(1120px, calc(100vw - 2rem))",
                    height: "min(780px, calc(100vh - 2rem))",
                    padding: 0,
                    gap: 0,
                    display: "flex",
                    flexDirection: "column",
                }}
                className="max-w-none overflow-hidden"
            >
                <div className="flex items-center gap-3 border-b px-5 py-4 text-left">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-violet-500/25 bg-violet-500/10">
                        <Command className="size-4 text-violet-600 dark:text-violet-400" />
                    </span>
                    <div className="min-w-0">
                        <DialogTitle className="text-base">Choose events</DialogTitle>
                        <DialogDescription className="text-xs">
                            Select one or more events that can trigger this rule.
                        </DialogDescription>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                        <Badge
                            variant="outline"
                            className={cn(
                                "font-mono text-[10px]",
                                draft.length
                                    ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                                    : "text-muted-foreground",
                            )}
                        >
                            {draft.length} selected
                        </Badge>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onOpenChange(false)}
                            aria-label="Close event picker"
                        >
                            <X className="size-4" />
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-3 border-b px-5 py-2.5">
                    <div className="relative flex-1">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            ref={searchRef}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search events, descriptions and payload fields…"
                            className="h-8 pl-8 text-xs"
                        />
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {filtered.length} event
                        {filtered.length === 1 ? "" : "s"}
                    </span>
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[190px_320px_minmax(0,1fr)]">
                    <aside className="hidden min-h-0 flex-col overflow-y-auto border-r bg-muted/20 p-2 lg:flex">
                        <p className="px-2 pb-1 pt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                            Sources
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                setSource("all");
                                setGroup(null);
                            }}
                            className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/60",
                                source === "all" && "bg-violet-500/10 text-violet-700 dark:text-violet-300",
                            )}
                        >
                            <span className="flex size-6 items-center justify-center rounded-md border bg-background">
                                <Layers className="size-3.5" />
                            </span>
                            <span className="min-w-0 flex-1 truncate">All events</span>
                            <span className="font-mono text-[9px] text-muted-foreground">{allEvents.length}</span>
                        </button>
                        {sources.map((entry) => (
                            <button
                                key={entry.id}
                                type="button"
                                onClick={() => {
                                    setSource(entry.id);
                                    setGroup(null);
                                }}
                                className={cn(
                                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/60",
                                    source === entry.id && "bg-violet-500/10 text-violet-700 dark:text-violet-300",
                                )}
                            >
                                <EventSourceIcon
                                    integrationId={entry.id}
                                    className="size-6 rounded-md"
                                    iconClassName="size-3.5"
                                />
                                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                                <span className="font-mono text-[9px] text-muted-foreground">{entry.count}</span>
                            </button>
                        ))}

                        {sourceGroups.length > 0 && (
                            <>
                                <div className="my-2 border-t" />
                                <p className="px-2 pb-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                                    Groups
                                </p>
                                {sourceGroups.map((entry) => (
                                    <button
                                        key={entry.label}
                                        type="button"
                                        onClick={() => {
                                            setCollapsedSections((current) => {
                                                if (!current.has(entry.label)) return current;
                                                const next = new Set(current);
                                                next.delete(entry.label);
                                                return next;
                                            });
                                            setGroup((current) => (current === entry.label ? null : entry.label));
                                        }}
                                        className={cn(
                                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-muted/60",
                                            group === entry.label &&
                                                "bg-violet-500/10 text-violet-700 dark:text-violet-300",
                                        )}
                                    >
                                        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                                        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                                        <span className="font-mono text-[9px] text-muted-foreground">
                                            {entry.count}
                                        </span>
                                    </button>
                                ))}
                            </>
                        )}
                    </aside>

                    <div className="min-h-0 overflow-y-auto border-r">
                        {sections.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
                                <Search className="size-5 text-muted-foreground/40" />
                                <p className="text-xs text-muted-foreground">No events match this search.</p>
                            </div>
                        ) : (
                            sections.map((section) => {
                                const isCollapsed = !isSearching && collapsedSections.has(section.label);
                                const selectedCount = section.events.filter((event) => draft.includes(event.id)).length;

                                return (
                                    <div key={section.label}>
                                        <button
                                            type="button"
                                            onClick={() => toggleSection(section.label)}
                                            aria-expanded={!isCollapsed}
                                            className="sticky top-0 z-10 flex w-full items-center justify-between border-b bg-background/95 px-3 py-2 text-left backdrop-blur transition-colors hover:bg-muted/30"
                                        >
                                            <span className="flex min-w-0 items-center gap-1.5">
                                                <ChevronDown
                                                    className={cn(
                                                        "size-3 shrink-0 text-muted-foreground/40 transition-transform",
                                                        isCollapsed && "-rotate-90",
                                                    )}
                                                />
                                                <span className="truncate font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
                                                    {section.label}
                                                </span>
                                            </span>
                                            <span className="flex shrink-0 items-center gap-2">
                                                {selectedCount > 0 && (
                                                    <span className="font-mono text-[9px] text-violet-600 dark:text-violet-300">
                                                        {selectedCount} selected
                                                    </span>
                                                )}
                                                <span className="font-mono text-[9px] text-muted-foreground/40">
                                                    {section.events.length}
                                                </span>
                                            </span>
                                        </button>
                                        {!isCollapsed &&
                                            section.events.map((event) => {
                                                const selected = draft.includes(event.id);
                                                const isFocused = focusedEvent?.id === event.id;
                                                return (
                                                    <button
                                                        key={event.id}
                                                        type="button"
                                                        onClick={() => toggle(event.id)}
                                                        onMouseEnter={() => setFocused(event.id)}
                                                        onFocus={() => setFocused(event.id)}
                                                        className={cn(
                                                            "flex w-full items-center gap-2.5 border-b border-border/50 px-3 py-2.5 text-left transition-colors hover:bg-muted/40",
                                                            selected && "bg-violet-500/[0.07]",
                                                            !selected && isFocused && "bg-muted/30",
                                                        )}
                                                    >
                                                        <span
                                                            role="checkbox"
                                                            aria-checked={selected}
                                                            className={cn(
                                                                "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                                                                selected
                                                                    ? "border-violet-500 bg-violet-500 text-white"
                                                                    : "border-border bg-background",
                                                            )}
                                                        >
                                                            {selected && <Check className="size-3" />}
                                                        </span>
                                                        <EventMedia event={event} className="size-10 shrink-0" />
                                                        <span className="min-w-0 flex-1">
                                                            <span className="flex items-center gap-1.5">
                                                                <span className="truncate text-xs font-medium">
                                                                    {event.label}
                                                                </span>
                                                                {!event.enabled && (
                                                                    <Badge
                                                                        variant="outline"
                                                                        className="shrink-0 px-1 py-0 font-mono text-[8px] uppercase text-muted-foreground"
                                                                    >
                                                                        disabled
                                                                    </Badge>
                                                                )}
                                                            </span>
                                                            {event.description && (
                                                                <span className="block truncate text-[10px] text-muted-foreground/65">
                                                                    {event.description}
                                                                </span>
                                                            )}
                                                            <span className="mt-0.5 flex items-center gap-1 font-mono text-[8px] uppercase tracking-wide text-muted-foreground/40">
                                                                {event.integrationName}
                                                                {event.group ? ` · ${event.group}` : ""}
                                                            </span>
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <aside className="hidden min-h-0 overflow-y-auto p-4 lg:block">
                        {focusedEvent ? (
                            <EventPreview
                                event={focusedEvent}
                                selected={draft.includes(focusedEvent.id)}
                                usedBy={usedBy}
                                onToggle={() => toggle(focusedEvent.id)}
                            />
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                                <ImageOff className="size-5 text-muted-foreground/40" />
                                <p className="text-xs text-muted-foreground">Select an event to preview it.</p>
                            </div>
                        )}
                    </aside>
                </div>

                <div className="flex flex-col gap-3 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                        {draft.length === 0 ? (
                            <span className="font-mono text-[10px] text-muted-foreground/50">No events selected</span>
                        ) : (
                            draft.map((id) => {
                                const event = events[id] ?? fallbackEvent(id);
                                return (
                                    <span
                                        key={id}
                                        className="inline-flex max-w-full items-center gap-1 rounded-md border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[9px] text-violet-700 dark:text-violet-300"
                                    >
                                        <span className="max-w-40 truncate">{event.label}</span>
                                        <button
                                            type="button"
                                            onClick={() => toggle(id)}
                                            aria-label={`Remove ${event.label}`}
                                            className="rounded-sm hover:bg-violet-500/20"
                                        >
                                            <X className="size-2.5" />
                                        </button>
                                    </span>
                                );
                            })
                        )}
                    </div>
                    <div className="flex shrink-0 items-center justify-end gap-2">
                        {draft.length > 0 && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft([])}>
                                Clear
                            </Button>
                        )}
                        <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="button" size="sm" disabled={draft.length === 0} onClick={confirm}>
                            <Check className="size-3.5" />
                            Use {draft.length} event{draft.length === 1 ? "" : "s"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function EventPreview({
    event,
    selected,
    usedBy,
    onToggle,
}: {
    event: EventCatalogEvent;
    selected: boolean;
    usedBy: number;
    onToggle: () => void;
}) {
    const schemaFields = Object.keys(event.dataSchema ?? {});
    const isPuryfi = event.integrationId === "puryfi";

    return (
        <div className="flex h-full flex-col">
            {!isPuryfi && (
                <div className="relative overflow-hidden rounded-xl border bg-muted/20">
                    <EventMedia event={event} className="aspect-[16/9] w-full" fit="contain" showEmptyLabel />
                    <span className="absolute top-2 left-2">
                        <EventSourceBadge integrationId={event.integrationId} />
                    </span>
                    <span className="absolute top-2 right-2">
                        <Badge
                            variant="outline"
                            className={cn(
                                "bg-background/80 font-mono text-[9px] backdrop-blur",
                                event.enabled
                                    ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                                    : "text-muted-foreground",
                            )}
                        >
                            {event.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                    </span>
                </div>
            )}

            <div className={cn("flex flex-wrap items-center gap-1.5", !isPuryfi && "mt-3")}>
                {isPuryfi && <EventMedia event={event} className="size-10 shrink-0" />}
                <EventSourceBadge integrationId={event.integrationId} />
                {event.group && (
                    <Badge variant="outline" className="px-1.5 py-0 font-mono text-[9px]">
                        {event.group}
                    </Badge>
                )}
                {isPuryfi && (
                    <Badge
                        variant="outline"
                        className={cn(
                            "px-1.5 py-0 font-mono text-[9px]",
                            event.enabled
                                ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                                : "text-muted-foreground",
                        )}
                    >
                        {event.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                )}
                {selected && (
                    <Badge
                        variant="outline"
                        className="border-violet-500/30 bg-violet-500/10 px-1.5 py-0 font-mono text-[9px] text-violet-700 dark:text-violet-300"
                    >
                        Selected
                    </Badge>
                )}
            </div>

            <h3 className="mt-2 text-lg leading-tight font-semibold">{event.label}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {event.description || "No description available."}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
                <PreviewStat label="Source" value={event.integrationName} />
                <PreviewStat label="Group" value={event.group || "General"} />
                <PreviewStat label="Used by" value={`${usedBy} rule${usedBy === 1 ? "" : "s"}`} />
                <PreviewStat
                    label="Status"
                    value={event.enabled ? "Active" : "Disabled"}
                    valueClassName={event.enabled ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}
                />
            </div>

            <div className="mt-3 rounded-lg border bg-muted/25 px-2.5 py-2">
                <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/50">Event id</p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{event.id}</p>
            </div>

            {schemaFields.length > 0 && (
                <div className="mt-3">
                    <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/50">
                        Payload fields
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                        {schemaFields.map((field) => (
                            <Badge key={field} variant="outline" className="px-1.5 py-0 font-mono text-[9px]">
                                {field}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-auto w-full pt-3">
                <Button
                    type="button"
                    variant={selected ? "outline" : "secondary"}
                    size="sm"
                    className="w-full"
                    onClick={onToggle}
                >
                    {selected ? (
                        <>
                            <Check className="size-3.5" />
                            Selected — remove
                        </>
                    ) : (
                        <>
                            <Plus className="size-3.5" />
                            Add this event
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}

function PreviewStat({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
    return (
        <div className="rounded-lg border bg-muted/25 px-2 py-1.5">
            <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/50">{label}</p>
            <p className={cn("mt-0.5 truncate text-[10px] font-medium", valueClassName)}>{value}</p>
        </div>
    );
}

type EventSelectionProps = {
    value: string[];
    onChange: (value: string[]) => void;
};

export function EventSelection({ value, onChange }: EventSelectionProps) {
    const { events } = useEventCatalog();
    const [open, setOpen] = useState(false);

    const selected = value.map((id) => events[id] ?? fallbackEvent(id));

    return (
        <>
            {selected.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                    {selected.map((event) => (
                        <div
                            key={event.id}
                            className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/20 p-2"
                        >
                            <EventMedia event={event} className="size-9 shrink-0 rounded-md" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium">{event.label}</p>
                                <p className="truncate font-mono text-[9px] uppercase tracking-wide text-muted-foreground/50">
                                    {event.integrationName}
                                    {event.group ? ` · ${event.group}` : ""}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => onChange(value.filter((id) => id !== event.id))}
                                className="shrink-0 rounded-md p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
                                aria-label={`Remove ${event.label}`}
                            >
                                <X className="size-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setOpen(true);
                    }}
                >
                    <Plus className="size-3.5" />
                    {selected.length === 0 ? "Choose events" : "Add or remove events"}
                </Button>
                <span className="font-mono text-[10px] text-muted-foreground/50">
                    {selected.length === 0
                        ? "At least one event is required"
                        : `${selected.length} event${selected.length === 1 ? "" : "s"} selected`}
                </span>
            </div>

            <EventExplorer open={open} onOpenChange={setOpen} value={value} onChange={onChange} />
        </>
    );
}
