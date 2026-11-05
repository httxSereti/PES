import { Button } from "@pes/ui/components/button";
import { Flame, Minimize2, Pause, Play, X } from "lucide-react";

import { formatDuration } from "@/lib/training";
import type { EdgeDifficulty, EdgingSessionSummary } from "@/types";
import { TrainingStatusBadge } from "./training-status-badge";
import { TrainingTimer } from "./training-timer";
import { TrainingCooldown } from "./training-cooldown";
import { TrainingEdgeButtons } from "./training-edge-buttons";
import { GoalProgress } from "./goal-progress";
import { GoalsReachedBanner } from "./goals-reached-banner";
import { GuidedPhase } from "./guided-phase";

interface TrainingKioskProps {
    session: EdgingSessionSummary;
    isHost: boolean;
    canRecord: boolean;
    busy: boolean;
    cooldownRemaining: number;
    onRecord: (difficulty: EdgeDifficulty) => void;
    onPause: () => void;
    onResume: () => void;
    onFail: () => void;
    onEndSuccess: () => void;
    onExit: () => void;
}

/** Full-screen control surface with large edge buttons. */
export function TrainingKiosk({
    session,
    isHost,
    canRecord,
    busy,
    cooldownRemaining,
    onRecord,
    onPause,
    onResume,
    onFail,
    onEndSuccess,
    onExit,
}: TrainingKioskProps) {
    const paused = Boolean(session.paused_at);
    const cooldownActive = cooldownRemaining > 0;
    const edgeDisabled = busy || paused || cooldownActive;

    return (
        <div className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-background p-5 md:p-8">
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                    <TrainingStatusBadge
                        status={session.status}
                        paused={paused}
                    />
                    <h1 className="truncate text-xl font-semibold md:text-2xl">
                        {session.name}
                    </h1>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <TrainingCooldown
                        remaining={cooldownRemaining}
                        intervalSeconds={session.min_edge_interval_seconds}
                    />
                    {isHost && (
                        <Button
                            variant="destructive"
                            size="lg"
                            disabled={busy}
                            onClick={onFail}
                        >
                            <X size={18} />
                            Fail
                        </Button>
                    )}
                    <Button variant="outline" size="lg" onClick={onExit}>
                        <Minimize2 size={18} />
                        Exit kiosk
                    </Button>
                </div>
            </header>

            <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
                <TrainingTimer
                    startedAt={session.started_at}
                    endedAt={session.ended_at}
                    pausedAt={session.paused_at}
                    totalPausedSeconds={session.total_paused_seconds}
                    className="text-7xl font-bold tracking-tight text-violet-600 md:text-8xl dark:text-violet-400"
                />
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                        <Flame size={15} className="text-violet-500" />
                        {session.edge_count} successful edge
                        {session.edge_count === 1 ? "" : "s"}
                    </span>
                    {isHost && (
                        <Button
                            size="lg"
                            variant={paused ? "secondary" : "outline"}
                            disabled={busy}
                            onClick={paused ? onResume : onPause}
                        >
                            {paused ? <Play size={18} /> : <Pause size={18} />}
                            {paused ? "Resume" : "Pause"}
                        </Button>
                    )}
                </div>
            </div>

            <div className="mt-4 space-y-3">
                <GoalProgress session={session} />
                <GuidedPhase session={session} />
            </div>

            <div className="flex flex-1 flex-col items-center justify-center py-6">
                {canRecord ? (
                    <div className="w-full max-w-4xl space-y-5">
                        <p className="text-center text-sm font-medium text-muted-foreground">
                            {paused
                                ? "Session paused — resume before recording an edge."
                                : cooldownActive
                                  ? `Cooldown — next edge in ${formatDuration(cooldownRemaining)}.`
                                  : isHost
                                    ? "Record an edge — how hard was it?"
                                    : "Partner control — record an edge for the Host."}
                        </p>
                        <TrainingEdgeButtons
                            variant="kiosk"
                            disabled={edgeDisabled}
                            onRecord={onRecord}
                        />
                        <p className="text-center text-xs text-muted-foreground/60">
                            {isHost
                                ? "Keyboard: 1–4 record an edge · Space pause/resume"
                                : "Keyboard: 1–4 record an edge"}
                        </p>
                    </div>
                ) : (
                    <p className="text-center text-sm text-muted-foreground">
                        The Host is running this session — sit tight.
                    </p>
                )}
            </div>

            <GoalsReachedBanner
                session={session}
                isHost={isHost}
                busy={busy}
                onEnd={onEndSuccess}
            />
        </div>
    );
}
