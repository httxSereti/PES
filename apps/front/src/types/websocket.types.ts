// Wire message types are generated from the backend contract
// (apps/app/src/api/ws/schema.py) — see ./websocket.generated.ts.
// Only transport-level, hand-maintained types live here.
import type {
    HardwareUpdateBtSensorsCommand,
    HardwareUpdateMk2btCommand,
    WebSocketClientMessage,
    WebSocketServerMessage,
} from './websocket.generated';

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

// ── Typed command/event maps (derived from the generated unions) ──

export type WebSocketCommandType = WebSocketClientMessage['type'];

/** Payload type paired with a command type (undefined when the command has no payload). */
export type CommandPayload<T extends WebSocketCommandType> =
    Extract<WebSocketClientMessage, { type: T }> extends { payload: infer P } ? P : undefined;

export type WebSocketServerEventType = WebSocketServerMessage['type'];

/** Payload type paired with a server event type (undefined when the event has no payload). */
export type ServerEventPayload<T extends WebSocketServerEventType> =
    Extract<WebSocketServerMessage, { type: T }> extends { payload: infer P } ? P : undefined;

// ── Hardware command target ids (generated literal unions) ──

export type HardwareUnitId = HardwareUpdateMk2btCommand['payload']['id'];
export type HardwareSensorId = HardwareUpdateBtSensorsCommand['payload']['id'];
