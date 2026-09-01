import type { EdgingEdge, EdgingSession, TrainingInitPayload } from '@/types';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface TrainingState {
    /** The session currently running (status === 'running'), null otherwise. */
    liveSession: EdgingSession | null;
    /** Edges of the live session, appended as `training:edge` arrives. */
    liveEdges: EdgingEdge[];
    /** Last WS event timestamp per session id — pages poll this to refetch. */
    events: Record<string, number>;
}

const initialState: TrainingState = {
    liveSession: null,
    liveEdges: [],
    events: {},
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
        trainingSessionUpdated: (state, action: PayloadAction<EdgingSession>) => {
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
        trainingSessionDeleted: (state, action: PayloadAction<string>) => {
            state.events[action.payload] = Date.now();
            if (state.liveSession?.id === action.payload) {
                state.liveSession = null;
                state.liveEdges = [];
            }
        },
    },
});

export const {
    trainingInit,
    trainingSessionUpdated,
    trainingEdgeAdded,
    trainingSessionDeleted,
} = trainingSlice.actions;
export default trainingSlice.reducer;
