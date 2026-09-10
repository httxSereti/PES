import type { Session, SessionInitPayload } from '@/types';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface SessionState {
    /** The active application session, null when none. */
    activeSession: Session | null;
    /** True once the connect snapshot (`session:init`) has arrived. */
    initialized: boolean;
    /** Whether the session settings modal is currently open. */
    settingsModalOpen: boolean;
    /** True when the auto-open on HOST login has already been consumed this login. */
    autoOpenHandled: boolean;
}

const initialState: SessionState = {
    activeSession: null,
    initialized: false,
    settingsModalOpen: false,
    autoOpenHandled: false,
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
        /** Auto-open the settings modal for the HOST right after login. */
        autoOpenSessionSettings: (state) => {
            state.settingsModalOpen = true;
            state.autoOpenHandled = true;
        },
        /** Manual reopen from the user dropdown. */
        openSessionSettings: (state) => {
            state.settingsModalOpen = true;
        },
        /** Closing the modal also consumes the auto-open for this login. */
        closeSessionSettings: (state) => {
            state.settingsModalOpen = false;
            state.autoOpenHandled = true;
        },
        /** New login: allow the auto-open to fire again. */
        resetSessionSettings: (state) => {
            state.autoOpenHandled = false;
        },
    },
});

export const {
    sessionInit,
    sessionUpdated,
    autoOpenSessionSettings,
    openSessionSettings,
    closeSessionSettings,
    resetSessionSettings,
} = sessionSlice.actions;
export default sessionSlice.reducer;
