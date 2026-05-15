
import type { AppDispatch, RootState } from '@/store';
import { logout } from '@/store/slices/authSlice';
import { sensorsInitialized, sensorUpdated } from '@/store/slices/sensorsSlice';
import { unitsInitialized, unitUpdated } from '@/store/slices/unitsSlice';
import { setError, setStatus, resetReconnect, incrementReconnect } from '@/store/slices/websocketSlice';
import { eventsHistoryLoaded, eventTriggered, type TriggeredEvent } from '@/store/slices/eventsSlice';
import type { Sensor, UnitSettings, WebSocketConfig, WebSocketIncomingMessage, WebSocketMessage } from '@/types';
import type { Middleware } from '@reduxjs/toolkit';

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

                // Catch Auth errors
                if (message.type === 'auth:error' || message.type === 'error:unauthorized') {
                    dispatch(setError('Authentication error'));
                    dispatch(logout());
                    ws?.close(4001, 'Unauthorized');
                    return;
                }

                // Catch command responses
                if (message.id) {
                    // console.log('🎯 Dispatching command-response event for ID:', message.id);
                    const commandEvent = new CustomEvent('websocket:command-response', {
                        detail: { id: message.id, payload: message.payload },
                    });
                    window.dispatchEvent(commandEvent);
                    // console.log('✅ Event dispatched');
                }

                // dispatch to listener of events
                const customEvent = new CustomEvent(`websocket:${message.type}`, {
                    detail: message.payload,
                });
                window.dispatchEvent(customEvent);

                // dispatch messages to redux stores
                switch (message.type) {
                    /**
                     * @Sensors 
                     * */
                    case 'sensors:init':
                        {
                            const sensors: Record<string, Sensor> = message.payload as unknown as Record<string, Sensor>
                            dispatch(sensorsInitialized(sensors))
                            break;
                        }
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
                        {
                            const units: Record<string, UnitSettings> = message.payload as unknown as Record<string, UnitSettings>
                            dispatch(unitsInitialized(units))
                            break;
                        }
                    case 'units:update':
                        dispatch(unitUpdated({
                            id: message.payload.id,
                            changes: message.payload.changes
                        }))
                        break;

                    /**
                     * @Events
                     */
                    case 'events:history':
                        dispatch(eventsHistoryLoaded(message.payload as unknown as TriggeredEvent[]));
                        break;

                    case 'events:triggered':
                        dispatch(eventTriggered(message.payload as unknown as TriggeredEvent));
                        break;

                    case 'notification':
                    case 'chat:message':
                        // dispatch(addMessage({ type: message.type, data: message.payload }));
                        break;

                    case 'user:connected':
                    case 'user:disconnected':
                        break;

                    //   default:
                    //     if (message.type.includes('message') || message.type.includes('notification')) {
                    //       dispatch(addMessage({ type: message.type, data: message.payload }));
                    //     }
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
