// WebSocket types
export type {
    WebSocketStatus,
    WebSocketMessage,
    WebSocketError,
    WebSocketIncomingMessage,
    WebSocketConfig,
    WebSocketState,
    // Message types
    CoreStopMessage,
    ChatMessage,
    UserConnected,
    UserDisconnected,
    NotificationMessage,
    AuthErrorMessage,
    PingMessage,
    PongMessage,
    TriggerRulesInitialMessage
} from './websocket.types';

// Auth types
export type {
    User,
    AuthTokens,
    LoginCredentials,
    LoginResponse,
    AuthState,
} from './auth.types';

export { UserRole } from './auth.types';

// API types
export type {
    ApiResponse,
    ApiError,
} from './api.types';

export type {
    BaseSensor,
    Sensor,
    MotionSensor,
    SoundSensor,
    SensorsState,
} from './sensor.types';

export type {
    UnitsState,
    UnitSettings,
} from './units.types';

export type {
    ActionType,
    TriggerRule,
    CreateTriggerRule,
    UpdateTriggerRule,
    TriggerAction,
    CreateTriggerAction,
    UpdateTriggerAction,
} from './events.types'