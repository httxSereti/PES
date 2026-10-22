import { useMemo } from "react";
import { useAppSelector } from "@/store/hooks";
import { integrationsSelectors } from "@/store/slices/integrationsSlice";
import type { IntegrationCatalogEntry } from "@/types/integrations.types";

export type EventGroupDef = { key: string; label: string; types: string[] };

/** Everything the event picker needs to render one event. */
export interface EventCatalogEvent {
    id: string;
    label: string;
    description: string;
    /** Integration id/name, e.g. "puryfi" / "PuryFi". */
    integrationId: string;
    integrationName: string;
    /** Optional subgroup declared by the integration, e.g. "Detection". */
    group: string;
    enabled: boolean;
    /** Optional preview image (PuryFi scan thumbnails, illustrations, ...). */
    imageUrl: string | null;
    dataSchema: Record<string, string>;
}

const EVENT_ID_PREFIXES = new Set([
    "chaster",
    "puryfi",
    "sensor",
    "sensors",
    "units",
    "unit",
]);

/** Readable fallback label while the live integration catalog is loading. */
export function humanizeEventId(id: string): string {
    const base = id.includes(":") ? id.split(":").pop() ?? id : id;
    const parts = base.split("_").filter(Boolean);
    const first = parts[0];
    if (first && parts.length > 1 && EVENT_ID_PREFIXES.has(first)) parts.shift();
    const label = parts.join(" ");
    return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Static fallback used until the integrations catalog arrives (and offline).
 * The live catalog (WS `integrations:load`) supersedes it; event ids must
 * match the backend registry — see apps/app/src/integrations.
 */
export const FALLBACK_EVENT_GROUPS: Record<string, EventGroupDef> = {
    chaster: {
        key: "chaster",
        label: "Chaster",
        types: [
            "chaster_pillory_vote",
            "chaster_pillory_started",
            "chaster_pillory_ended",
            "chaster_vote_add",
            "chaster_vote_sub",
            "chaster_time_add",
            "chaster_time_sub",
            "chaster_wof_turned",
            "chaster_lock_frozen",
            "chaster_lock_unfrozen",
        ],
    },
    sensors: {
        key: "sensors",
        label: "Sensors",
        types: [
            "sensor_sound_alarm",
            "sensor_position_alarm",
            "sensor_move_alarm",
        ],
    },
};

export interface EventCatalog {
    /** Group key (integration id) → group definition. */
    groups: Record<string, EventGroupDef>;
    /** Group key → event type ids (toolbar-friendly view of `groups`). */
    grouped: Record<string, string[]>;
    /** Every known event type id. */
    knownTypes: Set<string>;
    /** Event type ids currently disabled in their integration. */
    disabledTypes: Set<string>;
    /** Event type id → short description. */
    descriptions: Record<string, string>;
    /** Event type id → human label. */
    labels: Record<string, string>;
    /** Event type id → full display metadata used by the event picker. */
    events: Record<string, EventCatalogEvent>;
}

export function buildEventGroups(
    entries: IntegrationCatalogEntry[]
): Record<string, EventGroupDef> {
    const groups: Record<string, EventGroupDef> = {};
    for (const entry of entries) {
        groups[entry.id] = {
            key: entry.id,
            label: entry.name,
            types: entry.events.map(event => event.id),
        };
    }
    return groups;
}

/**
 * The event catalog for the UI, derived from the integrations slice with a
 * static fallback while the WS catalog has not arrived yet.
 */
export function useEventCatalog(): EventCatalog {
    const integrations = useAppSelector(integrationsSelectors.selectAll);

    return useMemo(() => {
        const entries = integrations.length > 0 ? integrations : null;
        const groups = entries ? buildEventGroups(entries) : FALLBACK_EVENT_GROUPS;

        const grouped: Record<string, string[]> = Object.fromEntries(
            Object.entries(groups).map(([key, group]) => [key, group.types])
        );
        const knownTypes = new Set(Object.values(groups).flatMap(group => group.types));
        const disabledTypes = new Set<string>();

        const descriptions: Record<string, string> = {};
        const labels: Record<string, string> = {};
        const events: Record<string, EventCatalogEvent> = {};

        // Start from the group catalog so the picker still renders while the
        // live integrations catalog is loading.
        for (const [integrationId, group] of Object.entries(groups)) {
            for (const id of group.types) {
                events[id] = {
                    id,
                    label: humanizeEventId(id),
                    description: "",
                    integrationId,
                    integrationName: group.label,
                    group: "",
                    enabled: true,
                    imageUrl: null,
                    dataSchema: {},
                };
            }
        }

        for (const entry of entries ?? []) {
            for (const event of entry.events) {
                descriptions[event.id] = event.description;
                labels[event.id] = event.label;
                if (event.enabled === false) disabledTypes.add(event.id);
                events[event.id] = {
                    id: event.id,
                    label: event.label,
                    description: event.description,
                    integrationId: entry.id,
                    integrationName: entry.name,
                    group: event.group ?? "",
                    enabled: event.enabled !== false,
                    imageUrl: event.image_url ?? null,
                    dataSchema: event.data_schema ?? {},
                };
            }
        }

        return { groups, grouped, knownTypes, disabledTypes, descriptions, labels, events };
    }, [integrations]);
}

/** Returns the group key for a given event type, or null. */
export function getEventGroup(
    eventType: string,
    groups: Record<string, EventGroupDef>
): string | null {
    for (const [key, group] of Object.entries(groups)) {
        if (group.types.includes(eventType)) return key;
    }
    return null;
}
