import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/store/slices/authSlice';
import websocketReducer from '@/store/slices/websocketSlice';
import sensorsReducer from '@/store/slices/sensorsSlice';
import unitsReducer from '@/store/slices/unitsSlice';
import rampsReducer from '@/store/slices/rampsSlice';
import hardwareReducer from '@/store/slices/hardwareSlice';
import unitsHistorySlice from '@/store/slices/unitsHistorySlice';
import eventsReducer from '@/store/slices/eventsSlice';
import triggerRulesReducer from '@/store/slices/triggerRulesSlice';
import triggerRuleLabelsReducer from '@/store/slices/triggerRuleLabelsSlice';
import trainingReducer from '@/store/slices/trainingSlice';

import { createWebSocketMiddleware } from '@/store/middleware/websocketMiddleware';

const WS_URL = `${import.meta.env.VITE_WS_URL}/ws`

const wsMiddleware = createWebSocketMiddleware({
    url: WS_URL,
    reconnect: true,
    reconnectAttempts: 10,
    reconnectInterval: 3000,
    heartbeatInterval: 25000,
    heartbeatTimeout: 60000,
    getToken: () => {
        const token = localStorage.getItem('token');
        return token;
    },
});

export const store = configureStore({
    reducer: {
        auth: authReducer,
        websocket: websocketReducer,
        sensors: sensorsReducer,
        units: unitsReducer,
        ramps: rampsReducer,
        hardware: hardwareReducer,
        unitsHistory: unitsHistorySlice,
        events: eventsReducer,
        triggerRules: triggerRulesReducer,
        triggerRuleLabels: triggerRuleLabelsReducer,
        training: trainingReducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: {
                ignoredActions: ['websocket/send'],
            },
        }).concat(wsMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
