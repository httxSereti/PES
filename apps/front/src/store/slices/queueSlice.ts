import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { QueueStatus } from '@/types';
import type { RootState } from '@/store';

/** State surfaced by `queue:update` (delivered to ADMIN/HOST only). */
export interface QueueState {
    status: QueueStatus | null;
}

const initialState: QueueState = {
    status: null,
};

const queueSlice = createSlice({
    name: 'queue',
    initialState,
    reducers: {
        queueUpdated: (state, action: PayloadAction<QueueStatus>) => {
            state.status = action.payload;
        },
    },
});

export const selectQueueStatus = (state: RootState) => state.queue.status;

export const { queueUpdated } = queueSlice.actions;
export default queueSlice.reducer;
