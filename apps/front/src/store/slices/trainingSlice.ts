import type {
    EdgingEdge,
    EdgingSessionSummary,
    TrainingEdgeDeletedPayload,
    TrainingIndexResponse,
    TrainingInitPayload,
    TrainingSessionDetail,
} from '@/types';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface TrainingState {
    /** The session currently running (status === 'running'), null otherwise. */
    liveSession: EdgingSessionSummary | null;
    /** Edges of the live session, appended as `training:edge` arrives. */
    liveEdges: EdgingEdge[];
    /** Last WS event timestamp per session id — pages poll this to refetch. */
    events: Record<string, number>;
    /** Reply to `training:index`: module stats + recent sessions. */
    overview: TrainingIndexResponse | null;
    /** Reply to `training:sessions`: every edging session (null until loaded). */
    sessions: EdgingSessionSummary[] | null;
    /** Replies to `training:session_detail`, keyed by session id. */
    details: Record<string, TrainingSessionDetail>;
}

const initialState: TrainingState = {
    liveSession: null,
    liveEdges: [],
    events: {},
    overview: null,
    sessions: null,
    details: {},
};

const trainingSlice = createSlice({
    name: 'training',
    initialState,
    reducers: {
        /** WS connect snapshot: live session + its edges. */
        trainingInit: (state, action: PayloadAction<TrainingInitPayload>) => {
            state.liveSession = action.payload.session;
            state.liveEdges = action.payload.edges;
        },
        /** Any session state change (create/start/edge/end/update). */
        trainingSessionUpdated: (
            state,
            action: PayloadAction<EdgingSessionSummary>,
        ) => {
            const session = action.payload;
            state.events[session.id] = Date.now();
            if (session.status === 'running') {
                if (state.liveSession?.id !== session.id) state.liveEdges = [];
                state.liveSession = session;
            } else if (state.liveSession?.id === session.id) {
                state.liveSession = null;
                state.liveEdges = [];
            }
        },
        trainingEdgeAdded: (state, action: PayloadAction<EdgingEdge>) => {
            const edge = action.payload;
            state.events[edge.session_id] = Date.now();
            if (state.liveSession?.id === edge.session_id) {
                state.liveEdges.push(edge);
            }
        },
        /** `training:edge_deleted`: the Host undid an edge. */
        trainingEdgeDeleted: (
            state,
            action: PayloadAction<TrainingEdgeDeletedPayload>,
        ) => {
            const { id, session_id } = action.payload;
            state.events[session_id] = Date.now();
            state.liveEdges = state.liveEdges.filter((edge) => edge.id !== id);
            const detail = state.details[session_id];
            if (detail) {
                detail.edges = detail.edges.filter((edge) => edge.id !== id);
            }
        },
        trainingSessionDeleted: (state, action: PayloadAction<string>) => {
            const sessionId = action.payload;
            state.events[sessionId] = Date.now();
            if (state.liveSession?.id === sessionId) {
                state.liveSession = null;
                state.liveEdges = [];
            }
            if (state.sessions) {
                state.sessions = state.sessions.filter(
                    (session) => session.id !== sessionId,
                );
            }
            delete state.details[sessionId];
        },
        /** Reply to `training:index`. */
        trainingOverviewLoaded: (
            state,
            action: PayloadAction<TrainingIndexResponse>,
        ) => {
            state.overview = action.payload;
        },
        /** Reply to `training:sessions`. */
        trainingSessionsLoaded: (
            state,
            action: PayloadAction<EdgingSessionSummary[]>,
        ) => {
            state.sessions = action.payload;
        },
        /** Reply to `training:session_detail`. */
        trainingSessionDetailLoaded: (
            state,
            action: PayloadAction<TrainingSessionDetail>,
        ) => {
            state.details[action.payload.session.id] = action.payload;
        },
    },
});

export const {
    trainingInit,
    trainingSessionUpdated,
    trainingEdgeAdded,
    trainingEdgeDeleted,
    trainingSessionDeleted,
    trainingOverviewLoaded,
    trainingSessionsLoaded,
    trainingSessionDetailLoaded,
} = trainingSlice.actions;
export default trainingSlice.reducer;