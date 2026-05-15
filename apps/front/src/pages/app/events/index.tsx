import type { Route } from ".react-router/types/src/pages/app/admin/+types/dashboard";
import { useState, useMemo, useCallback } from "react";
import { useAppSelector } from "@/store/hooks";
import { ChevronDown, Search, X, Zap } from "lucide-react";
import type { TriggeredEvent, TriggeredRule } from "@/store/slices/eventsSlice";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@pes/ui/components/select";

// eslint-disable-next-line no-empty-pattern
export function meta({ }: Route.MetaArgs) {
    return [
        { title: "PES | Events" },
        { name: "description", content: "Realtime events feed" },
    ];
}

// ─── Event type badge ────────────────────────────────────────────────────────

const EVENT_TYPE_COLORS: Record<string, string> = {
    chaster_wof_turned: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    chaster_vote_add: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    chaster_vote_sub: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    chaster_time_add: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    chaster_time_sub: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    chaster_lock_frozen: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    chaster_lock_unfrozen: "bg-teal-500/15 text-teal-300 border-teal-500/30",
    chaster_pillory_vote: "bg-pink-500/15 text-pink-300 border-pink-500/30",
    chaster_pillory_started: "bg-pink-600/15 text-pink-200 border-pink-600/30",
    chaster_pillory_ended: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

function EventTypeBadge({ type }: { type: string }) {
    const color = EVENT_TYPE_COLORS[type] ?? "bg-slate-500/15 text-slate-300 border-slate-500/30";
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${color} font-mono`}>
            {type}
        </span>
    );
}

// ─── Triggered rules inline display ──────────────────────────────────────────

function TriggeredRulesBadges({ rules }: { rules: TriggeredRule[] }) {
    if (!rules || rules.length === 0) {
        return <span className="text-xs text-muted-foreground/50 italic">—</span>;
    }
    return (
        <div className="flex flex-wrap gap-1">
            {rules.map((r, i) => (
                <span
                    key={r.rule_id ?? i}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-purple-900/30 border border-purple-700/40 text-purple-200"
                >
                    <Zap size={9} className="shrink-0" />
                    {r.rule_name}
                    <span className="text-purple-400/70">({r.actions.length})</span>
                </span>
            ))}
        </div>
    );
}

// ─── Expandable row ───────────────────────────────────────────────────────────

function EventRow({ event }: { event: TriggeredEvent }) {
    const [expanded, setExpanded] = useState(false);

    const date = useMemo(() => {
        const d = new Date(event.triggered_at);
        return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }, [event.triggered_at]);

    return (
        <>
            <tr
                className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer transition-colors"
                onClick={() => setExpanded(v => !v)}
            >
                <td className="py-3 pl-4 pr-2 text-xs text-muted-foreground/70 font-mono whitespace-nowrap">{date}</td>
                <td className="py-3 px-2"><EventTypeBadge type={event.event_type} /></td>
                <td className="py-3 px-2 text-xs text-muted-foreground/60 font-mono max-w-[200px] truncate">{event.origin}</td>
                <td className="py-3 px-2"><TriggeredRulesBadges rules={event.triggered_rules} /></td>
                <td className="py-3 pl-2 pr-4 text-muted-foreground/40">
                    <ChevronDown size={13} className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
                </td>
            </tr>
            {expanded && (
                <tr className="border-b border-white/5 bg-white/[0.015]">
                    <td colSpan={5} className="px-6 pb-4 pt-2">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {/* Event data */}
                            <div>
                                <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-1.5">Event data</div>
                                <pre className="text-xs text-slate-300 bg-black/30 rounded-lg p-3 overflow-auto max-h-40 font-mono border border-white/5">
                                    {JSON.stringify(event.event_data, null, 2)}
                                </pre>
                            </div>
                            {/* Triggered rules */}
                            {event.triggered_rules?.length > 0 && (
                                <div>
                                    <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-1.5">Triggered rules & actions</div>
                                    <div className="space-y-2">
                                        {event.triggered_rules.map((rule, i) => (
                                            <div key={rule.rule_id ?? i} className="bg-black/20 border border-white/5 rounded-lg p-3">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Zap size={11} className="text-violet-400" />
                                                    <span className="text-xs font-semibold text-slate-200">{rule.rule_name}</span>
                                                    <span className="text-[10px] text-muted-foreground/50 ml-auto">priority {rule.priority}</span>
                                                </div>
                                                <div className="space-y-1.5 pl-4">
                                                    {rule.actions.map((a, j) => (
                                                        <div key={a.queue_item_id ?? j} className="flex flex-wrap items-center gap-2 text-[11px]">
                                                            <span className="text-violet-300/80 font-mono">{a.action_type}</span>
                                                            <span className="text-muted-foreground/60">{a.display_name}</span>
                                                            <span className="text-slate-400 ml-auto">
                                                                {a.duration === -1 ? "∞" : `${a.duration}s`}
                                                                {a.cumulative && <span className="ml-1 text-teal-400/70">cumul</span>}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EventsPage() {
    const events = useAppSelector(state => state.events.events);
    const [search, setSearch] = useState("");
    const [selectedType, setSelectedType] = useState<string>("all");

    // Deduplicate event types for the filter dropdown
    const eventTypes = useMemo(() => {
        const types = new Set(events.map(e => e.event_type));
        return ["all", ...Array.from(types).sort()];
    }, [events]);

    const filtered = useMemo(() => {
        return [...events]
            .reverse() // most recent first
            .filter(e => {
                const matchesType = selectedType === "all" || e.event_type === selectedType;
                const matchesSearch = search === "" ||
                    e.event_type.includes(search.toLowerCase()) ||
                    e.origin.toLowerCase().includes(search.toLowerCase());
                return matchesType && matchesSearch;
            });
    }, [events, selectedType, search]);

    const clearFilters = useCallback(() => {
        setSearch("");
        setSelectedType("all");
    }, []);

    const hasFilters = search !== "" || selectedType !== "all";

    return (
        <div className="space-y-4 px-5">
            {/* Toolbar */}
            <div className="flex items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 max-w-sm">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                    <input
                        id="events-search"
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search events..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-white/[0.04] border border-white/10 rounded-md text-slate-200 placeholder:text-muted-foreground/40 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition"
                    />
                </div>
                {/* Type filter */}
                <Select value={selectedType} onValueChange={setSelectedType}>
                    <SelectTrigger className="h-[30px] px-3 py-1.5 text-xs bg-white/[0.04] border border-white/10 rounded-md text-slate-200 focus:ring-purple-500/20 focus:border-purple-500/50 transition cursor-pointer font-normal">
                        <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                        {eventTypes.map(t => (
                            <SelectItem key={t} value={t} className="text-xs">
                                {t === "all" ? "All types" : t}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {/* Clear */}
                {hasFilters && (
                    <button
                        onClick={clearFilters}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground/70 hover:text-slate-200 bg-white/[0.03] border border-white/10 rounded-md transition"
                    >
                        <X size={11} />
                        Clear
                    </button>
                )}
                <span className="ml-auto text-xs text-muted-foreground/50">
                    {filtered.length} / {events.length}
                </span>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-white/8 overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-white/8 bg-white/[0.025]">
                            <th className="py-2.5 pl-4 pr-2 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Time</th>
                            <th className="py-2.5 px-2 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Type</th>
                            <th className="py-2.5 px-2 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Origin</th>
                            <th className="py-2.5 px-2 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Triggered rules</th>
                            <th className="py-2.5 pl-2 pr-4" />
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
                            filtered.map(event => (
                                <EventRow key={event.id} event={event} />
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}