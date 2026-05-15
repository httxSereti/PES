import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface TriggeredAction {
    queue_item_id: string;
    action_id: string | null;
    action_type: string;
    display_name: string | null;
    duration: number;
    cumulative: boolean;
    payload: Record<string, unknown>;
}

export interface TriggeredRule {
    rule_id: string | null;
    rule_name: string;
    priority: number;
    actions: TriggeredAction[];
}

export interface TriggeredEvent {
    id: string;
    event_type: string;
    origin: string;
    event_data: Record<string, unknown>;
    triggered_at: string;
    triggered_rules: TriggeredRule[];
}

interface EventsState {
    events: TriggeredEvent[];
    /** Max events kept in memory */
    maxEvents: number;
}

const initialState: EventsState = {
    events: [],
    maxEvents: 250,
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
