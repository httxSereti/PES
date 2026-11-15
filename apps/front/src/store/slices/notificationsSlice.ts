import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { InAppNotificationPayload, InAppNotificationUpdatePayload } from '@/types';

/** A broadcast notification plus the client-side read flag. */
export interface InAppNotification extends InAppNotificationPayload {
    read: boolean;
}

export interface NotificationsState {
    items: InAppNotification[];
    unread: number;
    /** Oldest entries are dropped past this limit. */
    maxItems: number;
    /** Toast pop-ups on new notifications (the bell list keeps everything). */
    toastsEnabled: boolean;
}

const STORAGE_KEY = 'pes.notifications.toasts';

export function loadToastsEnabled(): boolean {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
}

export function saveToastsEnabled(enabled: boolean): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
}

function recount(items: InAppNotification[]): number {
    return items.reduce((count, item) => (item.read ? count : count + 1), 0);
}

const initialState: NotificationsState = {
    items: [],
    unread: 0,
    maxItems: 100,
    toastsEnabled: loadToastsEnabled(),
};

const notificationsSlice = createSlice({
    name: 'notifications',
    initialState,
    reducers: {
        /** New broadcast notification (`notifications:new`). */
        notificationReceived: (state, action: PayloadAction<InAppNotificationPayload>) => {
            const existing = state.items.findIndex((item) => item.id === action.payload.id);
            if (existing !== -1) {
                state.items[existing] = { ...action.payload, read: false };
            } else {
                state.items.unshift({ ...action.payload, read: false });
                if (state.items.length > state.maxItems) {
                    state.items.length = state.maxItems;
                }
            }
            state.unread = recount(state.items);
        },
        /** Coalesced repeat of an existing notification (`notifications:update`). */
        notificationRepeated: (state, action: PayloadAction<InAppNotificationUpdatePayload>) => {
            const index = state.items.findIndex((entry) => entry.id === action.payload.id);
            if (index === -1) return;
            const item = state.items[index];
            if (!item) return;
            state.items.splice(index, 1);
            item.count = action.payload.count;
            if (action.payload.updated_at) item.updated_at = action.payload.updated_at;
            item.read = false;
            // A repeated notification is the most recent one again.
            state.items.unshift(item);
            state.unread = recount(state.items);
        },
        notificationRead: (state, action: PayloadAction<string>) => {
            const item = state.items.find((entry) => entry.id === action.payload);
            if (!item || item.read) return;
            item.read = true;
            state.unread = recount(state.items);
        },
        notificationsMarkAllRead: (state) => {
            for (const item of state.items) item.read = true;
            state.unread = 0;
        },
        notificationsCleared: (state) => {
            state.items = [];
            state.unread = 0;
        },
        setToastsEnabled: (state, action: PayloadAction<boolean>) => {
            state.toastsEnabled = action.payload;
        },
    },
});

export const {
    notificationReceived,
    notificationRepeated,
    notificationRead,
    notificationsMarkAllRead,
    notificationsCleared,
    setToastsEnabled,
} = notificationsSlice.actions;

export default notificationsSlice.reducer;
