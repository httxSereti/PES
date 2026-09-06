import type { EdgingSession } from "@/types";
import { formatDuration } from "@/lib/training";
import { Check, Clock, Flame } from "lucide-react";
import { Progress } from "@pes/ui/components/progress";

interface GoalProgressProps {
  session: EdgingSession;
}

/** One card per goal: type icon, current/target value and a progress bar. */
export function GoalProgress({ session }: GoalProgressProps) {
  const goals = session.goals ?? [];

  if (goals.length === 0) {
    return <p className="text-xs text-muted-foreground">No goals defined.</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {goals.map((goal, index) => {
        const isDuration = goal.type === "duration";
        const current = isDuration
          ? (session.duration_seconds ?? 0)
          : session.edge_count;
        const target = goal.value;
        const pct = Math.min(
          100,
          Math.round((current / Math.max(1, target)) * 100),
        );
        const met = current >= target;

        return (
          <div
            key={`${goal.type}-${index}`}
            className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/40 p-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                {isDuration ? <Clock size={13} /> : <Flame size={13} />}
                {isDuration ? "Duration" : "Edges"}
              </span>
              {met && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <Check size={12} />
                  Reached
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-semibold tabular-nums">
                {isDuration ? formatDuration(current) : current}
              </span>
              <span className="text-xs text-muted-foreground">
                / {isDuration ? formatDuration(target) : target}
              </span>
            </div>
            <Progress
              value={pct}
              className={`h-1.5 bg-foreground/10 ${met ? "[&_[data-slot=progress-indicator]]:bg-emerald-500" : "[&_[data-slot=progress-indicator]]:bg-violet-500"}`}
              aria-label={`${isDuration ? "Duration" : "Edges"} goal progress`}
            />
          </div>
        );
      })}
    </div>
  );
}
