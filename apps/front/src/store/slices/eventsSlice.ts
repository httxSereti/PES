import type { TriggerRule, TriggeredEvent } from '@/types';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// Wire shapes come from the generated WS contract; re-exported here for
// existing importers.
export type { TriggeredAction, TriggeredRule, TriggeredEvent } from '@/types';

interface EventsState {
    events: TriggeredEvent[];
    triggerRules: TriggerRule[];
    /** Max events kept in memory */
    maxEvents: number;
}

const initialState: EventsState = {
    events: [],
    maxEvents: 250,
    triggerRules: []
};

const eventsSlice = createSlice({
    name: 'events',
    initialState,
    reducers: {
        /** Bulk load — replaces current list (from events:history on WS connect) */
        eventsHistoryLoaded: (state, action: PayloadAction<TriggeredEvent[]>) => {
            state.events = action.payload.slice(-state.maxEvents);
        },
        /** Single new event received in real-time */
        eventTriggered: (state, action: PayloadAction<TriggeredEvent>) => {
            state.events.push(action.payload);
            if (state.events.length > state.maxEvents) {
                state.events.shift();
            }
        },
        clearEvents: (state) => {
            state.events = [];
        },
    },
});

export const { eventsHistoryLoaded, eventTriggered, clearEvents } = eventsSlice.actions;
export default eventsSlice.reducer;
