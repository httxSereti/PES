import type {
    EdgeDifficulty,
    EdgeOutcome,
    EdgingSessionSummary,
} from '@/types';

/** "83" -> "1:23", "3725" -> "1:02:05" */
export function formatDuration(totalSeconds: number | null | undefined): string {
    if (totalSeconds == null || Number.isNaN(totalSeconds)) return "—";
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(sec).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function formatMinutes(totalSeconds: number | null | undefined): string {
    if (totalSeconds == null || Number.isNaN(totalSeconds)) return "—";
    return `${Math.floor(totalSeconds / 60)} min`;
}

/**
 * Elapsed seconds, ticking client-side while the session is running.
 * Falls back to the server value when the timestamps are unusable.
 */
export function sessionElapsedSeconds(
    session: Pick<
        EdgingSessionSummary,
        | "started_at"
        | "ended_at"
        | "duration_seconds"
        | "paused_at"
        | "total_paused_seconds"
    >,
    nowMs: number = Date.now(),
): number | null {
    if (!session.started_at) return session.duration_seconds ?? null;

    const start = new Date(session.started_at).getTime();
    const end = session.ended_at
        ? new Date(session.ended_at).getTime()
        : session.paused_at
          ? new Date(session.paused_at).getTime()
          : nowMs;
    if (Number.isNaN(start) || Number.isNaN(end)) {
        return session.duration_seconds ?? null;
    }
    const raw = Math.max(0, Math.floor((end - start) / 1000));
    return Math.max(0, raw - (session.total_paused_seconds ?? 0));
}

/** True when every configured goal is reached at `nowMs`. */
export function sessionGoalsMet(
    session: Pick<
        EdgingSessionSummary,
        | "goals"
        | "edge_count"
        | "started_at"
        | "ended_at"
        | "duration_seconds"
        | "paused_at"
        | "total_paused_seconds"
    >,
    nowMs: number = Date.now(),
): boolean {
    if (!session.goals?.length) return false;

    const elapsed = sessionElapsedSeconds(session, nowMs) ?? 0;
    return session.goals.every((goal) => {
        if (goal.type === "duration") return elapsed >= goal.value;
        if (goal.type === "edges") return session.edge_count >= goal.value;
        return false;
    });
}

export const DIFFICULTY_META: Record<
    EdgeDifficulty,
    { label: string; score: number; dot: string; text: string }
> = {
    easy: { label: 'Easy', score: 1, dot: '#10b981', text: 'text-emerald-600 dark:text-emerald-400' },
    normal: { label: 'Normal', score: 2, dot: '#0ea5e9', text: 'text-sky-600 dark:text-sky-400' },
    hard: { label: 'Hard', score: 3, dot: '#f97316', text: 'text-orange-600 dark:text-orange-400' },
    extreme: { label: 'Extreme', score: 4, dot: '#f43f5e', text: 'text-rose-600 dark:text-rose-400' },
};

export function difficultyMeta(difficulty: string) {
    return (
        DIFFICULTY_META[difficulty as EdgeDifficulty] ?? {
            label: difficulty,
            score: 2,
            dot: '#a1a1aa',
            text: 'text-muted-foreground',
        }
    );
}

export const OUTCOME_META: Record<EdgeOutcome, { label: string; className: string }> = {
    success: { label: 'Success', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    fail: { label: 'Failed', className: 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400' },
};

export const STATUS_META: Record<
    string,
    { label: string; className: string; live?: boolean }
> = {
    configured: { label: 'Configured', className: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300' },
    running: {
        label: 'Running',
        className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        live: true,
    },
    succeeded: { label: 'Succeeded', className: 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400' },
    failed: { label: 'Failed', className: 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400' },
    cancelled: { label: 'Cancelled', className: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
    interrupted: { label: 'Interrupted', className: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
    paused: { label: 'Paused', className: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
};
