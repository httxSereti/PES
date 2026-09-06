import type { EdgingEdge, EdgingSession } from './websocket.generated';

/** REST-only stats (not part of the WS contract). */

/** GET /api/training */
export interface TrainingIndexResponse {
    edging: TrainingOverviewStats;
    recent_sessions: EdgingSession[];
}

/** GET /api/training/edging/sessions/{id} */
export interface TrainingSessionDetail {
    session: EdgingSession;
    edges: EdgingEdge[];
    stats: EdgingSessionStats;
}

/** GET /api/training/edging/live */
export interface TrainingLiveSnapshot {
    session: EdgingSession | null;
    edges: EdgingEdge[];
}

/** POST /api/training/edging/sessions + PATCH body */
export interface TrainingSessionFields {
    name: string;
    goals: { type: 'duration' | 'edges'; value: number }[];
    auto_stop_on_goal: boolean;
}

export type EdgeDifficulty = 'easy' | 'normal' | 'hard' | 'extreme';
export type EdgeOutcome = 'success' | 'fail';

/** Global stats for the training module index page. */
export interface TrainingOverviewStats {
    total_sessions: number;
    ended_sessions: number;
    succeeded_sessions: number;
    failed_sessions: number;
    cancelled_sessions: number;
    total_edges: number;
    total_success_edges: number;
    total_failed_edges: number;
    total_duration_seconds: number;
    average_duration_seconds: number | null;
    average_edges_per_session: number | null;
    success_rate: number | null;
    average_rating: number | null;
    difficulty_counts: Record<string, number>;
}

/** Per-session stats, compared to the previous session and averages. */
export interface EdgingSessionStats {
    duration_seconds: number | null;
    success_edges: number;
    failed_edges: number;
    edges_per_minute: number | null;
    edges_per_minute_previous: number | null;
    edges_per_minute_average: number | null;
    duration_previous_seconds: number | null;
    duration_average_seconds: number | null;
    edges_previous: number | null;
    edges_average: number | null;
    difficulty_counts: Record<string, number>;
}
