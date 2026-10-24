import { useMemo } from "react";

import { useAppSelector } from "@/store/hooks";
import { integrationsSelectors } from "@/store/slices/integrationsSlice";
import { ActionType } from "@/types/events.types";

export interface ActionCatalogEntry {
    id: ActionType;
    label: string;
    description: string;
    integrationId: string;
    integrationName: string;
    group: string;
    enabled: boolean;
    reversible: boolean;
    payloadSchema: Record<string, string>;
}

export interface ActionSource {
    id: string;
    label: string;
    count: number;
}

export interface ActionCatalog {
    actions: Record<string, ActionCatalogEntry>;
    sources: ActionSource[];
}

const CORE_SOURCE = { integrationId: "units", integrationName: "Core" };

const FALLBACK_ACTIONS: Record<string, Omit<ActionCatalogEntry, "id">> = {
    [ActionType.PROFILE]: {
        label: "Apply profile",
        description: "Apply a saved EStim profile to the selected units.",
        ...CORE_SOURCE,
        group: "Intensity",
        enabled: true,
        reversible: true,
        payloadSchema: {
            profile: "Profile name (A-J or X for random)",
            level_pct: "Level percentage (0-150)",
        },
    },
    [ActionType.LEVEL]: {
        label: "Update level",
        description: "Apply an absolute, relative or percentage level change.",
        ...CORE_SOURCE,
        group: "Intensity",
        enabled: true,
        reversible: false,
        payloadSchema: {
            units: "Unit ids, e.g. 123, 12RM",
            channels: "Channels, e.g. AB, ABRM",
            value: "MagicNumber, e.g. 30, +5, %-[5-10]",
        },
    },
    [ActionType.MULT]: {
        label: "Update multiplier",
        description: "Add or remove a percentage from the channel multipliers.",
        ...CORE_SOURCE,
        group: "Intensity",
        enabled: true,
        reversible: false,
        payloadSchema: {
            target: "Usage name or 'all'",
            pct: "Percentage to add or remove",
            random: "Randomize between 0 and pct",
        },
    },
    [ActionType.CHASTER_TIME_UPDATE]: {
        label: "Update Chaster time",
        description: "Add or remove time from the Chaster lock.",
        integrationId: "chaster",
        integrationName: "Chaster",
        group: "Lock",
        enabled: true,
        reversible: false,
        payloadSchema: {
            duration_minutes: "Minutes to add or remove",
            only_max: "Update max only, not current time",
        },
    },
    [ActionType.PURYFI_SET_ENABLED]: {
        label: "Enable/disable PuryFi",
        description: "Turn the PuryFi blocker on or off.",
        integrationId: "puryfi",
        integrationName: "PuryFi",
        group: "State",
        enabled: true,
        reversible: false,
        payloadSchema: { enabled: "Boolean" },
    },
    [ActionType.PURYFI_SET_LOCK]: {
        label: "Set PuryFi lock",
        description: "Create or replace the PuryFi lock using the saved lock password.",
        integrationId: "puryfi",
        integrationName: "PuryFi",
        group: "Lock",
        enabled: true,
        reversible: false,
        payloadSchema: {
            timer_minutes: "Timer in minutes (0 = none)",
        },
    },
    [ActionType.PURYFI_SET_LOCK_TIMER]: {
        label: "Update lock timer",
        description: "Add, remove or set time on the PuryFi lock timer.",
        integrationId: "puryfi",
        integrationName: "PuryFi",
        group: "Lock",
        enabled: true,
        reversible: false,
        payloadSchema: { value: "Minutes expression, e.g. +10" },
    },
    [ActionType.PURYFI_ENTER_LOCK_PASSWORD]: {
        label: "Unlock with password",
        description: "Use the saved lock password to remove the lock.",
        integrationId: "puryfi",
        integrationName: "PuryFi",
        group: "Lock",
        enabled: true,
        reversible: false,
        payloadSchema: {},
    },
    [ActionType.PURYFI_EMERGENCY_UNLOCK]: {
        label: "Emergency unlock",
        description: "Use the emergency server token to remove the lock.",
        integrationId: "puryfi",
        integrationName: "PuryFi",
        group: "Lock",
        enabled: true,
        reversible: false,
        payloadSchema: {},
    },
    [ActionType.PURYFI_UPDATE_WBLIST]: {
        label: "Update whitelist/blacklist",
        description: "Add/remove entries or switch the PuryFi list mode.",
        integrationId: "puryfi",
        integrationName: "PuryFi",
        group: "Lists",
        enabled: true,
        reversible: false,
        payloadSchema: {
            operation: "add, remove or set_mode",
            list: "Whitelist or blacklist",
            entry_mode: "Text or regex",
            value: "URL, domain or pattern",
        },
    },
};

export function fallbackAction(id: string): ActionCatalogEntry {
    const fallback = FALLBACK_ACTIONS[id];
    return {
        id: id as ActionType,
        label: fallback?.label ?? id,
        description: fallback?.description ?? "",
        integrationId: fallback?.integrationId ?? "units",
        integrationName: fallback?.integrationName ?? "Core",
        group: fallback?.group ?? "",
        enabled: true,
        reversible: fallback?.reversible ?? false,
        payloadSchema: fallback?.payloadSchema ?? {},
    };
}

/** Action metadata for the explorer and the action card. */
export function useActionCatalog(): ActionCatalog {
    const integrations = useAppSelector(integrationsSelectors.selectAll);

    return useMemo(() => {
        const actions: Record<string, ActionCatalogEntry> = {};
        for (const type of Object.values(ActionType)) {
            actions[type] = fallbackAction(type);
        }

        for (const integration of integrations) {
            for (const action of integration.actions) {
                const fallback = fallbackAction(action.id);
                actions[action.id] = {
                    id: action.id as ActionType,
                    label: action.label || fallback.label,
                    description: action.description || fallback.description,
                    integrationId: integration.id,
                    integrationName: integration.id === "units" ? "Core" : integration.name,
                    group: action.group || fallback.group,
                    enabled: action.enabled !== false,
                    reversible: action.reversible,
                    payloadSchema: action.payload_schema ?? {},
                };
            }
        }

        const sourceCounts = new Map<string, ActionSource>();
        for (const action of Object.values(actions)) {
            const source = sourceCounts.get(action.integrationId);
            if (source) source.count += 1;
            else
                sourceCounts.set(action.integrationId, {
                    id: action.integrationId,
                    label: action.integrationName,
                    count: 1,
                });
        }

        return {
            actions,
            sources: Array.from(sourceCounts.values()).sort((a, b) => a.label.localeCompare(b.label)),
        };
    }, [integrations]);
}
