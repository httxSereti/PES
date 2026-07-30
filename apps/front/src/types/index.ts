// WebSocket contract (generated from apps/app/src/api/ws/schema.py)
// plus hand-maintained transport types
export * from './websocket.types';

// Auth types
export type {
    User,
    AuthTokens,
    LoginCredentials,
    LoginResponse,
    AuthState,
} from './auth.types';

// Role/Permission enums + audience matrix (generated from the backend)
export { Role, Permission, SERVER_MESSAGE_AUDIENCE } from './auth.generated';

// API types
export type {
    ApiResponse,
    ApiError,
} from './api.types';

export type {
    SensorsState,
} from './sensor.types';

export type {
    UnitsState,
} from './units.types';

export type {
    CreateTriggerRule,
    UpdateTriggerRule,
    CreateTriggerAction,
    UpdateTriggerAction,
} from './events.types'
