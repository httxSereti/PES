import { Zap } from "lucide-react";
import type { TriggeredRule } from "@/store/slices/eventsSlice";

// ─── Colours per event type ───────────────────────────────────────────────────

const EVENT_TYPE_COLORS: Record<string, string> = {
    chaster_wof_turned:     "bg-violet-500/15 text-violet-300 border-violet-500/30",
    chaster_vote_add:       "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    chaster_vote_sub:       "bg-rose-500/15 text-rose-300 border-rose-500/30",
    chaster_time_add:       "bg-sky-500/15 text-sky-300 border-sky-500/30",
    chaster_time_sub:       "bg-orange-500/15 text-orange-300 border-orange-500/30",
    chaster_lock_frozen:    "bg-blue-500/15 text-blue-300 border-blue-500/30",
    chaster_lock_unfrozen:  "bg-teal-500/15 text-teal-300 border-teal-500/30",
    chaster_pillory_vote:   "bg-pink-500/15 text-pink-300 border-pink-500/30",
    chaster_pillory_started:"bg-pink-600/15 text-pink-200 border-pink-600/30",
    chaster_pillory_ended:  "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

const FALLBACK_COLOR = "bg-slate-500/15 text-slate-300 border-slate-500/30";

// ─── EventTypeBadge ───────────────────────────────────────────────────────────

export function EventTypeBadge({ type }: { type: string }) {
    const color = EVENT_TYPE_COLORS[type] ?? FALLBACK_COLOR;
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border font-mono ${color}`}>
            {type}
        </span>
    );
}

// ─── TriggeredRulesBadges ─────────────────────────────────────────────────────

export function TriggeredRulesBadges({ rules }: { rules: TriggeredRule[] }) {
    if (!rules?.length) {
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
