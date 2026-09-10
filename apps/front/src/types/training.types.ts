import type {
    TrainingInitPayload,
    TrainingOverviewPayload,
} from './websocket.generated';

// The module overview + per-session stats are now part of the WS contract
// (personal replies), so they come straight from the generated types.
export type {
    TrainingSessionDetail,
    TrainingOverviewStats,
    EdgingSessionStats,
} from './websocket.generated';

/** Reply to `training:index`: module stats + the 5 most recent sessions. */
export type TrainingIndexResponse = TrainingOverviewPayload;

/** Live session + edges (matches the `training:init` snapshot). */
export type TrainingLiveSnapshot = TrainingInitPayload;

/** Body of `training:create` / `training:update` (name + goals). */
export interface TrainingSessionFields {
    name: string;
    goals: { type: 'duration' | 'edges'; value: number }[];
    auto_stop_on_goal: boolean;
}

export type EdgeDifficulty = 'easy' | 'normal' | 'hard' | 'extreme';
export type EdgeOutcome = 'success' | 'fail';