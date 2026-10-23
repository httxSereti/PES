import type { Session, SessionInitPayload } from '@/types';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface SessionState {
    /** The active application session, null when none. */
    activeSession: Session | null;
    /** True once the connect snapshot (`session:init`) has arrived. */
    initialized: boolean;
    /** Whether the session settings modal is currently open. */
    settingsModalOpen: boolean;
}

const initialState: SessionState = {
    activeSession: null,
    initialized: false,
    settingsModalOpen: false,
};

const sessionSlice = createSlice({
    name: 'session',
    initialState,
    reducers: {
        /** WS connect snapshot: active session or null. */
        sessionInit: (state, action: PayloadAction<SessionInitPayload>) => {
            state.activeSession = action.payload.session;
            state.initialized = true;
        },
        /** Any session lifecycle change (start/end). */
        sessionUpdated: (state, action: PayloadAction<Session>) => {
            const session = action.payload;
            state.activeSession = session.status === 'running' ? session : null;
        },
        /** Manual open from the user dropdown or session activity card. */
        openSessionSettings: (state) => {
            state.settingsModalOpen = true;
        },
        /** Close the settings modal. */
        closeSessionSettings: (state) => {
            state.settingsModalOpen = false;
        },
    },
});

export const {
    sessionInit,
    sessionUpdated,
    openSessionSettings,
    closeSessionSettings,
} = sessionSlice.actions;
export default sessionSlice.reducer;
