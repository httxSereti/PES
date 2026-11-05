import { useEffect, useState } from "react";
import type { EdgingSessionSummary } from "@/types";
import { sessionElapsedSeconds } from "@/lib/training";
import { Compass } from "lucide-react";
import { Progress } from "@pes/ui/components/progress";

interface GuidedPhaseProps {
  session: EdgingSessionSummary;
}

const PHASES = [
  {
    until: 0.15,
    label: "Warm-up",
    detail: "Settle in, keep it easy and find your rhythm.",
  },
  {
    until: 0.65,
    label: "Build",
    detail: "Increase the pressure gradually and stay controlled.",
  },
  {
    until: 0.9,
    label: "Edge control",
    detail: "Stay close to the edge. Breathe and hold the pace.",
  },
  {
    until: 1,
    label: "Final push",
    detail: "You are nearly there — keep your focus.",
  },
  {
    until: 1.01,
    label: "Cooldown",
    detail: "Goals reached. Ease off and cool down.",
  },
];

/** Phase prompts for guided sessions (derived from the configured goals). */
export function GuidedPhase({ session }: GuidedPhaseProps) {
  const running = session.status === "running";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running || session.paused_at) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, session.paused_at, session.started_at]);

  if (session.mode !== "guided" || session.status === "configured") return null;

  const durationTarget = Math.max(
    0,
    ...session.goals
      .filter((goal) => goal.type === "duration")
      .map((goal) => goal.value),
  );
  const edgesTarget = Math.max(
    0,
    ...session.goals
      .filter((goal) => goal.type === "edges")
      .map((goal) => goal.value),
  );

  const elapsed = sessionElapsedSeconds(session, now) ?? 0;
  const progress =
    durationTarget > 0
      ? elapsed / durationTarget
      : edgesTarget > 0
        ? session.edge_count / edgesTarget
        : 0;
  const clamped = Math.max(0, Math.min(1, progress));
  const phaseIndex = Math.max(
    0,
    PHASES.findIndex((entry) => clamped < entry.until),
  );
  const phase = PHASES[phaseIndex] ?? PHASES[0]!;
  const automation = session.guided_config?.enabled
    ? session.guided_config
    : null;
  const automationLevel =
    automation === null
      ? null
      : phaseIndex >= 4
        ? automation.start_level_pct
        : Math.min(
            automation.max_level_pct,
            automation.start_level_pct + automation.phase_step_pct * phaseIndex,
          );

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-violet-500/25 bg-violet-500/5 p-3.5">
      <div className="flex items-center gap-2">
        <Compass size={14} className="text-violet-500" />
        <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
          Guided · {phase.label}
        </span>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/60">
          {Math.round(clamped * 100)}%
        </span>
      </div>
      {automation && (
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-amber-600 dark:text-amber-300">
          <span className="rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5">
            Automation · {automation.profile ?? "—"}
          </span>
          <span className="tabular-nums">
            target {automationLevel}% · ceiling {automation.max_level_pct}%
          </span>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">{phase.detail}</p>
      <Progress
        value={Math.round(clamped * 100)}
        className="h-1.5 bg-foreground/10 [&_[data-slot=progress-indicator]]:bg-violet-500"
        aria-label="Guided session phase progress"
      />
    </div>
  );
}
