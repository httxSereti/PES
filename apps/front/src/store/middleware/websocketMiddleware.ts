
import type { AppDispatch, RootState } from '@/store';
import { logout, verifyToken } from '@/store/slices/authSlice';
import { sensorsInitialized, sensorUpdated } from '@/store/slices/sensorsSlice';
import { unitsInitialized, unitUpdated } from '@/store/slices/unitsSlice';
import { rampsInitialized, rampUpserted, rampRemoved } from '@/store/slices/rampsSlice';
import { hardwareInitialized, hardwareUpdated } from '@/store/slices/hardwareSlice';
import { setError, setStatus, resetReconnect, incrementReconnect } from '@/store/slices/websocketSlice';
import { eventsHistoryLoaded, eventTriggered } from '@/store/slices/eventsSlice';
import type { WebSocketConfig, WebSocketIncomingMessage, WebSocketMessage } from '@/types';
import type { Middleware } from '@reduxjs/toolkit';
import { triggerRulesInitialized, triggerRuleUpdated, triggerRuleAdded, triggerRuleRemoved } from '@/store/slices/triggerRulesSlice';
import { triggerRuleLabelsInitialized, triggerRuleLabelAdded } from '@/store/slices/triggerRuleLabelsSlice';

export function createWebSocketMiddleware(config: WebSocketConfig): Middleware {
    const {
        url,
        reconnect = true,
        reconnectAttempts = 10,
        reconnectInterval = 3000,
        heartbeatInterval = 25000,
        heartbeatTimeout = 60000,
        getToken,
    } = config;

    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let heartbeatIntervalId: NodeJS.Timeout | null = null;
    let heartbeatTimeoutId: NodeJS.Timeout | null = null;

    const startHeartbeat = () => {
        stopHeartbeat();

        heartbeatIntervalId = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));

                // Timeout si pas de réponse
                heartbeatTimeoutId = setTimeout(() => {
                    console.warn('Heartbeat timeout - closing connection');
                    ws?.close();
                }, heartbeatTimeout);
            }
        }, heartbeatInterval);
    };

    const stopHeartbeat = () => {
        if (heartbeatIntervalId) {
            clearInterval(heartbeatIntervalId);
            heartbeatIntervalId = null;
        }
        if (heartbeatTimeoutId) {
            clearTimeout(heartbeatTimeoutId);
            heartbeatTimeoutId = null;
        }
    };

    const connect = (dispatch: AppDispatch, getState: () => RootState) => {
        if (ws?.readyState === WebSocket.OPEN) return;

        const token = getToken ? getToken() : null;

        if (!token) {
            dispatch(setError('No authentication token'));
            return;
        }

        dispatch(setStatus('connecting'));

        // token inside url
        const wsUrl = `${url}?token=${encodeURIComponent(token)}`;
        ws = new WebSocket(wsUrl);

        // is connected
        ws.onopen = () => {
            dispatch(setStatus('connected'));
            dispatch(resetReconnect());
            startHeartbeat();
        };

        // disconnect use
        ws.onclose = (event) => {
            dispatch(setStatus('disconnected'));
            stopHeartbeat();

            // Code 4001/4003 = auth error
            if (event.code === 4001 || event.code === 4003) {
                dispatch(setError('Authentication failed'));
                dispatch(logout());
                return;
            }

            // Auto reconnect
            const state = getState();
            if (reconnect && state.websocket.reconnectAttempts < reconnectAttempts) {
                dispatch(incrementReconnect());

                // Backoff exponentiel
                const delay = Math.min(
                    reconnectInterval * Math.pow(2, state.websocket.reconnectAttempts),
                    30000
                );

                reconnectTimeout = setTimeout(() => connect(dispatch, getState), delay);
            }
        };

        ws.onerror = () => {
            dispatch(setError('WebSocket error'));
        };

        ws.onmessage = (event) => {
            try {
                const message: WebSocketIncomingMessage = JSON.parse(event.data);

                // Answer to heartbeat
                if (message.type === 'pong') {
                    if (heartbeatTimeoutId) {
                        clearTimeout(heartbeatTimeoutId);
                        heartbeatTimeoutId = null;
                    }
                    return;
                }

                console.log('WS MESSAGE RECEIVED:', message);

                // ping/pong carry no payload
                const payload = 'payload' in message ? message.payload : undefined;

                // Catch command responses
                if (message.id) {
                    // console.log('🎯 Dispatching command-response event for ID:', message.id);
                    const commandEvent = new CustomEvent('websocket:command-response', {
                        detail: { id: message.id, payload },
                    });
                    window.dispatchEvent(commandEvent);
                    // console.log('✅ Event dispatched');
                }

                // dispatch to listener of events
                const customEvent = new CustomEvent(`websocket:${message.type}`, {
                    detail: payload,
                });
                window.dispatchEvent(customEvent);

                // dispatch messages to redux stores
                switch (message.type) {
                    /**
                     * @Auth — profile/permissions changed server-side
                     */
                    case 'auth:refresh':
                        dispatch(verifyToken());
                        break;

                    /**
                     * @Sensors
                     * */
                    case 'sensors:init':
                        dispatch(sensorsInitialized(message.payload))
                        break;
                    case 'sensors:update':
                        dispatch(sensorUpdated({
                            id: message.payload.id,
                            changes: message.payload.changes
                        }))
                        break;
                    /**
                     * @Units 
                     * */
                    case 'units:init':
                        dispatch(unitsInitialized(message.payload))
                        break;
                    case 'units:update':
                        dispatch(unitUpdated({
                            id: message.payload.id,
                            changes: message.payload.changes
                        }))
                        break;

                    /**
                     * @Ramps
                     * */
                    case 'ramps:init':
                        dispatch(rampsInitialized(message.payload))
                        break;
                    case 'ramps:update':
                        dispatch(rampUpserted(message.payload))
                        break;
                    case 'ramps:remove':
                        dispatch(rampRemoved(`${message.payload.unit}.${message.payload.field}`))
                        break;

                    /**
                     * @Hardware
                     * */
                    case 'hardware:init':
                        dispatch(hardwareInitialized(message.payload))
                        break;
                    case 'hardware:update':
                        dispatch(hardwareUpdated(message.payload))
                        break;

                    /**
                     * @Events
                     */
                    case 'events:history':
                        dispatch(eventsHistoryLoaded(message.payload));
                        break;

                    case 'events:triggered':
                        dispatch(eventTriggered(message.payload));
                        break;

                    /**
                    * @TriggerRules
                    */
                    case 'trigger_rules:load':
                        dispatch(triggerRulesInitialized(message.payload));
                        break;

                    case 'trigger_rules:create':
                        dispatch(triggerRuleAdded(message.payload.rule));
                        break;

                    case 'trigger_rules:delete':
                        dispatch(triggerRuleRemoved(message.payload.id));
                        break;

                    case 'trigger_rules:load_labels':
                        dispatch(triggerRuleLabelsInitialized(message.payload));
                        break;

                    case 'trigger_rules:create_label':
                        dispatch(triggerRuleLabelAdded(message.payload));
                        break;

                    case 'trigger_rules:update':
                        dispatch(triggerRuleUpdated({
                            id: message.payload.id,
                            changes: message.payload.changes
                        }))
                        break;
                }
            } catch (err) {
                console.error('Failed to parse WebSocket message:', err);
            }
        };
    };

    const disconnect = () => {
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
        stopHeartbeat();
        ws?.close();
        ws = null;
    };

    return (store) => (next) => (action) => {
        const { dispatch, getState } = store;
        const websocketMessage = action as WebSocketMessage;

        switch (websocketMessage.type) {
            case 'websocket/connect':
                connect(dispatch, getState);
                break;

            case 'websocket/disconnect':
                disconnect();
                break;

            case 'websocket/send':
                if (ws?.readyState === WebSocket.OPEN) {
                    try {
                        ws.send(JSON.stringify(websocketMessage.payload));
                    } catch (err) {
                        console.error('Error sending WebSocket message:', err);
                    }
                } else {
                    console.warn('WebSocket not connected, cannot send message');
                }
                break;

            case 'auth/logout':
                disconnect();
                break;

            case 'auth/setToken':
                disconnect();
                setTimeout(() => {
                    const state = getState();
                    if (state.auth.isAuthenticated) {
                        connect(dispatch, getState);
                    }
                }, 300);
                break;
        }

        return next(action);
    };
}
