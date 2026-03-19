import type { UnitSettings } from "@/types/units.types";
import type { Sensor } from "@/types/sensor.types";

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

export interface ChatMessage {
    id?: string;
    type: 'chat:message';
    payload: {
        text: string;
        userId: string;
        username: string;
    };
}

export interface UserConnected {
    id?: string;
    type: 'user:connected';
    payload: {
        id: number;
        name: string;
        online: boolean;
    };
}

export interface UserDisconnected {
    id?: string;
    type: 'user:disconnected';
    payload: {
        id: number;
    };
}

export interface NotificationMessage {
    id?: string;
    type: 'notification';
    payload: {
        title: string;
        message: string;
        severity: 'info' | 'warning' | 'error' | 'success';
    };
}

export interface AuthErrorMessage {
    id?: string;
    type: 'auth:error' | 'error:unauthorized';
    payload: {
        message: string;
        code: number;
    };
}

export interface PingMessage {
    id?: string;
    type: 'ping';
    payload?: never;
}

export interface PongMessage {
    id?: string;
    type: 'pong';
    payload?: never;
}

export interface SensorsInitialMessage {
    id?: string;
    type: 'sensors:init';
    payload?: never;
}

export interface SensorsUpdateMessage {
    id?: string;
    type: 'sensors:update';
    payload: {
        id: string;
        changes: Partial<Sensor>;
    };
}

export interface UnitsInitialMessage {
    id?: string;
    type: 'units:init';
    payload?: never;
}

export interface UnitsUpdateMessage {
    id?: string;
    type: 'units:update';
    payload: {
        id: string;
        changes: Partial<UnitSettings>;
    };
}

export interface CoreStopMessage {
    status: string;
    message: string;
}

export type WebSocketIncomingMessage =
    | ChatMessage
    | UserConnected
    | UserDisconnected
    | NotificationMessage
    | AuthErrorMessage
    | PingMessage
    | PongMessage
    | SensorsInitialMessage
    | SensorsUpdateMessage
    | UnitsInitialMessage
    | UnitsUpdateMessage
    | CoreStopMessage
    ;

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
