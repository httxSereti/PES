import type { IntegrationCatalogEntry } from './websocket.generated';

// Wire shapes come from the generated WS contract
// (apps/app/src/api/ws/schema) — re-exported here for app code.
export type {
    IntegrationCatalogEntry,
    IntegrationEvent,
    IntegrationAction,
    IntegrationSetting,
} from './websocket.generated';

export type IntegrationValues = Record<string, unknown>;

/**
 * REST GET /integrations — catalog entry with current settings values
 * (env-backed secrets arrive masked).
 */
export type IntegrationDetail = IntegrationCatalogEntry & { values: IntegrationValues };
