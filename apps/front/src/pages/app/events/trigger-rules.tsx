import type { Route } from ".react-router/types/src/pages/app/admin/+types/dashboard";
import { useMemo, useState } from "react";
import { useAppSelector } from "@/store/hooks";
import { ChevronDown, Zap, Clock, Layers } from "lucide-react";
import type { TriggeredRule } from "@/store/slices/eventsSlice";

// eslint-disable-next-line no-empty-pattern
export function meta({ }: Route.MetaArgs) {
    return [
        { title: "PES | Trigger Rules" },
        { name: "description", content: "Trigger rules and actions" },
    ];
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RuleSummary {
    rule_id: string | null;
    rule_name: string;
    priority: number;
    /** How many times this rule was triggered */
    trigger_count: number;
    /** Most recent trigger ISO string */
    last_triggered: string | null;
    /** All unique actions seen for this rule */
    actions: Map<string, { action_type: string; display_name: string | null; duration: number; cumulative: boolean }>;
}

// ─── Action badge ─────────────────────────────────────────────────────────────

function ActionTypeBadge({ type }: { type: string }) {
    const colors: Record<string, string> = {
        PROFILE: "bg-violet-500/15 text-violet-300 border-violet-500/30",
        LEVEL: "bg-sky-500/15 text-sky-300 border-sky-500/30",
        MULT: "bg-amber-500/15 text-amber-300 border-amber-500/30",
        CHASTER_TIME_ADD: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    };
    const c = colors[type] ?? "bg-slate-500/15 text-slate-300 border-slate-500/30";
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border font-mono ${c}`}>
            {type}
        </span>
    );
}

// ─── Rule card ────────────────────────────────────────────────────────────────

function RuleCard({ summary }: { summary: RuleSummary }) {
    const [expanded, setExpanded] = useState(false);
    const actions = Array.from(summary.actions.values());

    const lastAt = useMemo(() => {
        if (!summary.last_triggered) return null;
        return new Date(summary.last_triggered).toLocaleString("fr-FR", {
            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
        });
    }, [summary.last_triggered]);

    return (
        <div className="rounded-xl border border-white/8 overflow-hidden">
            {/* Rule header */}
            <button
                className="w-full flex items-center gap-3 px-4 py-3 bg-white/[0.025] hover:bg-white/[0.04] transition-colors text-left"
                onClick={() => setExpanded(v => !v)}
            >
                <Zap size={14} className="text-violet-400 shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-200 truncate">
                        {summary.rule_name}
                    </div>
                    {summary.rule_id && (
                        <div className="text-[10px] text-muted-foreground/40 font-mono truncate">{summary.rule_id}</div>
                    )}
                </div>
                <div className="flex items-center gap-4 shrink-0">
                    {/* Priority */}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground/60">
                        <Layers size={11} />
                        <span>p{summary.priority}</span>
                    </div>
                    {/* Trigger count */}
                    <div className="flex items-center gap-1 text-xs">
                        <span className="px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-200 text-[11px] font-semibold">
                            ×{summary.trigger_count}
                        </span>
                    </div>
                    {/* Last triggered */}
                    {lastAt && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground/50">
                            <Clock size={11} />
                            {lastAt}
                        </div>
                    )}
                    <ChevronDown
                        size={13}
                        className={`text-muted-foreground/40 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                    />
                </div>
            </button>

            {/* Actions */}
            {expanded && (
                <div className="border-t border-white/5 bg-black/10 px-4 py-3">
                    <div className="text-[10px] text-muted-foreground/40 uppercase tracking-widest mb-3">Actions</div>
                    <div className="space-y-2">
                        {actions.length === 0 ? (
                            <p className="text-xs text-muted-foreground/40 italic">No actions recorded</p>
                        ) : actions.map((a, i) => (
                            <div
                                key={i}
                                className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5"
                            >
                                <ActionTypeBadge type={a.action_type} />
                                {a.display_name && (
                                    <span className="text-xs text-slate-300">{a.display_name}</span>
                                )}
                                <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground/60">
                                    <span>
                                        {a.duration === -1 ? "∞ permanent" : `${a.duration}s`}
                                    </span>
                                    {a.cumulative && (
                                        <span className="text-teal-400/70 text-[10px] border border-teal-500/30 px-1.5 rounded">cumulative</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TriggerRulesPage() {
    const events = useAppSelector(state => state.events.events);

    // Aggregate rule summaries from event history
    const rules = useMemo<RuleSummary[]>(() => {
        const map = new Map<string, RuleSummary>();

        for (const event of events) {
            for (const rule of event.triggered_rules ?? []) {
                const key = rule.rule_id ?? `wof:${rule.rule_name}`;
                const existing = map.get(key);

                if (!existing) {
                    const s: RuleSummary = {
                        rule_id: rule.rule_id,
                        rule_name: rule.rule_name,
                        priority: rule.priority,
                        trigger_count: 1,
                        last_triggered: event.triggered_at,
                        actions: new Map(),
                    };
                    for (const a of rule.actions) {
                        s.actions.set(a.action_type, {
                            action_type: a.action_type,
                            display_name: a.display_name,
                            duration: a.duration,
                            cumulative: a.cumulative,
                        });
                    }
                    map.set(key, s);
                } else {
                    existing.trigger_count += 1;
                    if (!existing.last_triggered || event.triggered_at > existing.last_triggered) {
                        existing.last_triggered = event.triggered_at;
                    }
                    for (const a of rule.actions) {
                        if (!existing.actions.has(a.action_type)) {
                            existing.actions.set(a.action_type, {
                                action_type: a.action_type,
                                display_name: a.display_name,
                                duration: a.duration,
                                cumulative: a.cumulative,
                            });
                        }
                    }
                }
            }
        }

        return Array.from(map.values()).sort((a, b) => b.trigger_count - a.trigger_count);
    }, [events]);

    return (
        <div className="space-y-3 px-5">
            {rules.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground/40 italic">
                    No trigger rules have fired yet
                </div>
            ) : (
                <>
                    <div className="text-xs text-muted-foreground/50 pb-1">
                        {rules.length} rule{rules.length > 1 ? "s" : ""} triggered across {events.length} event{events.length > 1 ? "s" : ""}
                    </div>
                    {rules.map((r, i) => (
                        <RuleCard key={r.rule_id ?? i} summary={r} />
                    ))}
                </>
            )}
        </div>
    );
}
