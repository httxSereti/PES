import { Zap } from "lucide-react";
import type { TriggeredRule } from "@/store/slices/eventsSlice";

const EVENT_TYPE_COLORS: Record<string, string> = {
    chaster_wof_turned: "bg-violet-500/15 text-violet-700 border-violet-500/30 dark:text-violet-200",
    chaster_vote_add: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
    chaster_vote_sub: "bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300",
    chaster_time_add: "bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-300",
    chaster_time_sub: "bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-300",
    chaster_lock_frozen: "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-300",
    chaster_lock_unfrozen: "bg-teal-500/15 text-teal-700 border-teal-500/30 dark:text-teal-300",
    chaster_pillory_vote: "bg-pink-500/15 text-pink-700 border-pink-500/30 dark:text-pink-300",
    chaster_pillory_started: "bg-pink-600/15 text-pink-700 border-pink-600/30 dark:text-pink-200",
    chaster_pillory_ended: "bg-slate-500/15 text-slate-700 border-slate-500/30 dark:text-slate-300",
};

const FALLBACK_COLOR = "bg-slate-500/15 text-slate-700 border-slate-500/30 dark:text-slate-300";

export function EventTypeBadge({ type }: { type: string }) {
    let color = EVENT_TYPE_COLORS[type] ?? FALLBACK_COLOR;

    // custom color for WOF
    if (type.startsWith("custom:wof_"))
        color = "bg-violet-500/15 text-violet-700 border-violet-500/30 dark:text-violet-300"

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border font-mono ${color}`}>
            {type}
        </span>
    );
}

export function TriggeredRulesBadges({ rules }: { rules: TriggeredRule[] }) {
    if (!rules?.length) {
        return <span className="text-xs text-muted-foreground/50 italic">—</span>;
    }
    return (
        <div className="flex flex-wrap gap-1">
            {rules.map((r, i) => (
                <span
                    key={r.rule_id ?? i}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-purple-500/15 border border-purple-500/30 text-purple-700 dark:text-purple-200"
                >
                    <Zap size={9} className="shrink-0" />
                    {r.rule_name}
                    <span className="text-purple-500/70 dark:text-purple-400/70">({r.actions.length})</span>
                </span>
            ))}
        </div>
    );
}
