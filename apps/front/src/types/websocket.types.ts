// Wire message types are generated from the backend contract
// (apps/app/src/api/ws/schema.py) — see ./websocket.generated.ts.
// Only transport-level, hand-maintained types live here.
export * from './websocket.generated';

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WebSocketMessage<T = unknown> {
    type: string;
    payload?: T;
    id?: string;
    timestamp?: number;
}

export interface WebSocketError {
    code: number;
    reason: string;
    timestamp: number;
}

export interface WebSocketConfig {
    url: string;
    reconnect?: boolean;
    reconnectAttempts?: number;
    reconnectInterval?: number;
    heartbeatInterval?: number;
    heartbeatTimeout?: number;
    getToken?: () => string | null;
}

export interface WebSocketState {
    status: WebSocketStatus;
    error: string | null;
    reconnectAttempts: number;
    lastConnected: number | null;
}
