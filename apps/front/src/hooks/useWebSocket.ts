
import { useContext, createContext, useEffect, useRef } from 'react';
import type {
  CommandPayload,
  CommandResult,
  ServerEventPayload,
  WebSocketCommandType,
  WebSocketServerEventType,
} from '@/types';

export interface WebSocketContextValue {
  status: string;
  error: string | null;
  reconnectAttempts: number;
  isConnected: boolean;
  send: <T extends WebSocketCommandType>(
    type: T,
    ...args: CommandPayload<T> extends undefined ? [] : [payload: CommandPayload<T>]
  ) => void;
  sendCommand: <T extends WebSocketCommandType>(
    type: T,
    ...args: CommandPayload<T> extends undefined ? [] : [payload: CommandPayload<T>]
  ) => Promise<CommandResult>;
  disconnect: () => void;
  reconnect: () => void;
}

export const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function useWebSocket() {
  const context = useContext(WebSocketContext);

  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider');
  }

  return context;
}

// hook to subscribe to an event
export function useWebSocketEvent<T extends WebSocketServerEventType>(
  eventType: T,
  callback: (data: ServerEventPayload<T>) => void
) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const handleEvent = (event: Event) => {
      const customEvent = event as CustomEvent<ServerEventPayload<T>>;
      callbackRef.current(customEvent.detail);
    };

    const eventName = `websocket:${eventType}`;
    window.addEventListener(eventName, handleEvent);

    return () => {
      window.removeEventListener(eventName, handleEvent);
    };
  }, [eventType]);
}
