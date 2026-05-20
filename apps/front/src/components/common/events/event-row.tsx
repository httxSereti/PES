import { useState, useMemo } from "react";
import { ChevronDown, Zap } from "lucide-react";
import type { TriggeredEvent } from "@/store/slices/eventsSlice";
import { EventTypeBadge, TriggeredRulesBadges } from "./event-badges";

function EventRowDetail({ event }: { event: TriggeredEvent }) {
    return (
        <tr className="border-b border-white/5 bg-white/[0.015]">
            <td colSpan={5} className="px-6 pb-4 pt-2">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div>
                        <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-1.5">Event data</div>
                        <pre className="text-xs text-slate-300 bg-black/30 rounded-lg p-3 overflow-auto max-h-40 font-mono border border-white/5">
                            {JSON.stringify(event.event_data, null, 2)}
                        </pre>
                    </div>
                    {event.triggered_rules?.length > 0 && (
                        <div>
                            <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-1.5">Triggered rules &amp; actions</div>
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
    );
}

export function EventRow({ event }: { event: TriggeredEvent }) {
    const [expanded, setExpanded] = useState(false);
    const date = useMemo(() => new Date(event.triggered_at).toLocaleTimeString("fr-FR", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    }), [event.triggered_at]);

    return (
        <>
            <tr
                className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer transition-colors"
                onClick={() => setExpanded(v => !v)}
            >
                <td className="py-3 pl-4 pr-2 text-xs text-muted-foreground/70 font-mono whitespace-nowrap">{date}</td>
                <td className="py-3 px-2"><EventTypeBadge type={event.event_type} /></td>
                <td className="py-3 px-2 text-xs text-muted-foreground/60 font-mono max-w-[200px] truncate hidden md:table-cell">
                    {event.origin}
                </td>
                <td className="py-3 px-2 hidden md:table-cell">
                    <TriggeredRulesBadges rules={event.triggered_rules} />
                </td>
                <td className="py-3 pl-2 pr-4 text-muted-foreground/40">
                    <ChevronDown size={13} className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
                </td>
            </tr>
            {expanded && <EventRowDetail event={event} />}
        </>
    );
}

export function EventCard({ event }: { event: TriggeredEvent }) {
    const [expanded, setExpanded] = useState(false);
    const date = useMemo(() => new Date(event.triggered_at).toLocaleTimeString("fr-FR", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    }), [event.triggered_at]);

    return (
        <div className="rounded-xl border border-white/8 overflow-hidden">
            <div
                className="flex items-start justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                onClick={() => setExpanded(v => !v)}
            >
                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <EventTypeBadge type={event.event_type} />
                        <span className="text-[11px] text-muted-foreground/50 font-mono">{date}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground/50 font-mono truncate">{event.origin}</span>
                    {event.triggered_rules?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-0.5">
                            <TriggeredRulesBadges rules={event.triggered_rules} />
                        </div>
                    )}
                </div>
                <ChevronDown size={13} className={`mt-1 shrink-0 text-muted-foreground/40 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
            </div>

            {expanded && (
                <div className="border-t border-white/5 bg-white/[0.015] px-4 pb-4 pt-3">
                    <div className="flex flex-col gap-3">
                        <div>
                            <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-1.5">Event data</div>
                            <pre className="text-xs text-slate-300 bg-black/30 rounded-lg p-3 overflow-auto max-h-40 font-mono border border-white/5">
                                {JSON.stringify(event.event_data, null, 2)}
                            </pre>
                        </div>
                        {event.triggered_rules?.length > 0 && (
                            <div>
                                <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-1.5">Triggered rules &amp; actions</div>
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
                </div>
            )}
        </div>
    );
}
