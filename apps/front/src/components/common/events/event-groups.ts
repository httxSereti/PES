import { useMemo } from "react";
import { useAppSelector } from "@/store/hooks";
import { integrationsSelectors } from "@/store/slices/integrationsSlice";
import type { IntegrationCatalogEntry } from "@/types/integrations.types";

export type EventGroupDef = { key: string; label: string; types: string[] };

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
        for (const entry of entries ?? []) {
            for (const event of entry.events) {
                descriptions[event.id] = event.description;
                labels[event.id] = event.label;
                if (event.enabled === false) disabledTypes.add(event.id);
            }
        }

        return { groups, grouped, knownTypes, disabledTypes, descriptions, labels };
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
