// AUTO-GENERATED from apps/app/src/api/ws/schema.py + apps/app/src/typings
// by apps/app/scripts/generate_ws_types.py — DO NOT EDIT.
// Regenerate with: pnpm codegen:ws

import type { WebSocketServerMessage } from './websocket.generated';

export enum Role {
    GUEST = "guest",
    USER = "user",
    OPERATOR = "operator",
    TRUSTED = "trusted",
    ADMIN = "admin",
    HOST = "host",
}

export enum Permission {
    READ_UNITS = "read_units",
    READ_SENSORS = "read_sensors",
    READ_PROFILES = "read_profiles",
    READ_USERS = "read_users",
    READ_EVENTS = "read_events",
    WRITE_UNITS = "write_units",
    WRITE_SENSORS = "write_sensors",
    WRITE_PROFILES = "write_profiles",
    MANAGE_USERS = "manage_users",
    MANAGE_SENSORS = "manage_sensors",
    MANAGE_PROFILES = "manage_profiles",
    TRAINING_EDGING_READ = "training_edging_read",
    TRAINING_EDGING_MANAGE = "training_edging_manage",
    ADMIN = "admin",
    HOST = "host",
}

export const SERVER_MESSAGE_AUDIENCE: Record<WebSocketServerMessage['type'], Permission | null> = {
    'connected': null,
    'ping': null,
    'pong': null,
    'auth:refresh': null,
    'command': null,
    'sensors:init': Permission.READ_SENSORS,
    'sensors:update': Permission.READ_SENSORS,
    'units:init': Permission.READ_UNITS,
    'units:update': Permission.READ_UNITS,
    'ramps:init': Permission.READ_UNITS,
    'ramps:update': Permission.READ_UNITS,
    'ramps:remove': Permission.READ_UNITS,
    'hardware:init': Permission.READ_SENSORS,
    'hardware:update': Permission.READ_SENSORS,
    'core:stop': Permission.READ_UNITS,
    'events:history': Permission.READ_EVENTS,
    'events:triggered': Permission.READ_EVENTS,
    'queue:update': Permission.ADMIN,
    'trigger_rules:load': Permission.ADMIN,
    'trigger_rules:load_labels': Permission.ADMIN,
    'trigger_rules:update': Permission.ADMIN,
    'trigger_rules:create': Permission.ADMIN,
    'trigger_rules:create_label': Permission.ADMIN,
    'trigger_rules:delete': Permission.ADMIN,
    'training:init': Permission.TRAINING_EDGING_READ,
    'training:session': Permission.TRAINING_EDGING_READ,
    'training:session_deleted': Permission.TRAINING_EDGING_READ,
    'training:edge': Permission.TRAINING_EDGING_READ,
};
