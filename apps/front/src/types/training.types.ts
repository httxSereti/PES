import type {
    TrainingGuidedConfig,
    TrainingInitPayload,
    TrainingOverviewPayload,
} from './websocket.generated';

// The module overview + per-session stats are now part of the WS contract
// (personal replies), so they come straight from the generated types.
export type {
    TrainingSessionDetail,
    TrainingOverviewStats,
    EdgingSessionStats,
    EdgingSessionSummary,
    TrainingGuidedConfig,
} from './websocket.generated';

/** Reply to `training:index`: module stats + the 5 most recent sessions. */
export type TrainingIndexResponse = TrainingOverviewPayload;

/** Live session + edges (matches the `training:init` snapshot). */
export type TrainingLiveSnapshot = TrainingInitPayload;

/** How many notifications a session sends to its recipients. */
export type TrainingNotificationLevel =
    | 'all'
    | 'edges'
    | 'failures'
    | 'summary'
    | 'none';

/** Body of `training:create` / `training:update` (name + goals + settings). */
export interface TrainingSessionFields {
    name: string;
    goals: { type: 'duration' | 'edges'; value: number }[];
    auto_stop_on_goal: boolean;
    mode: 'manual' | 'guided';
    guided_config?: TrainingGuidedConfig | null;
    min_edge_interval_seconds: number;
    notification_level: TrainingNotificationLevel;
    allow_partner_edges: boolean;
    participant_ids?: string[];
}

export type EdgeDifficulty = 'easy' | 'normal' | 'hard' | 'extreme';
export type EdgeOutcome = 'success' | 'fail';