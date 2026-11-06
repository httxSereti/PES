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
    oneShot: boolean;
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
const TRAINING_SOURCE = { integrationId: "training", integrationName: "Training" };

const FALLBACK_ACTIONS: Record<string, Omit<ActionCatalogEntry, "id">> = {
    [ActionType.PROFILE]: {
        label: "Apply profile",
        description: "Apply a saved EStim profile to the selected units.",
        ...CORE_SOURCE,
        group: "Intensity",
        enabled: true,
        reversible: true,
        oneShot: false,
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
        oneShot: false,
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
        oneShot: false,
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
        oneShot: false,
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
        oneShot: false,
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
        oneShot: false,
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
        oneShot: false,
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
        oneShot: false,
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
        oneShot: false,
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
        oneShot: false,
        payloadSchema: {
            operation: "add, remove or set_mode",
            list: "Whitelist or blacklist",
            entry_mode: "Text or regex",
            value: "URL, domain or pattern",
        },
    },
    [ActionType.TRAINING_START]: {
        label: "Start training session",
        description: "Create and start an edging session from a template or program.",
        ...TRAINING_SOURCE,
        group: "Session",
        enabled: true,
        reversible: false,
        oneShot: true,
        payloadSchema: {
            template_id: "Template id (or program_id)",
            program_id: "Program id (or template_id)",
        },
    },
    [ActionType.TRAINING_PAUSE]: {
        label: "Pause training session",
        description: "Pause the running training session.",
        ...TRAINING_SOURCE,
        group: "Session",
        enabled: true,
        reversible: false,
        oneShot: true,
        payloadSchema: { session_id: "Optional session id" },
    },
    [ActionType.TRAINING_RESUME]: {
        label: "Resume training session",
        description: "Resume the paused running training session.",
        ...TRAINING_SOURCE,
        group: "Session",
        enabled: true,
        reversible: false,
        oneShot: true,
        payloadSchema: { session_id: "Optional session id" },
    },
    [ActionType.TRAINING_END]: {
        label: "End training session",
        description: "End the running session as succeeded, cancelled or failed.",
        ...TRAINING_SOURCE,
        group: "Session",
        enabled: true,
        reversible: false,
        oneShot: true,
        payloadSchema: {
            status: "succeeded, cancelled or failed",
            session_id: "Optional session id",
        },
    },
    [ActionType.TRAINING_NEXT_PROGRAM_STEP]: {
        label: "Start next program step",
        description: "Start the next uncompleted step of a training program.",
        ...TRAINING_SOURCE,
        group: "Program",
        enabled: true,
        reversible: false,
        oneShot: true,
        payloadSchema: { program_id: "Program id" },
    },
    [ActionType.TRAINING_RECORD_EDGE]: {
        label: "Record system edge",
        description: "Record an edge as the system actor (automation only).",
        ...TRAINING_SOURCE,
        group: "Edges",
        enabled: true,
        reversible: false,
        oneShot: true,
        payloadSchema: {
            difficulty: "easy, normal, hard or extreme",
            outcome: "success or fail",
            note: "Optional note",
        },
    },
    [ActionType.TRAINING_STOP_AND_NEUTRALIZE]: {
        label: "Stop training and neutralize",
        description: "Fail the session, clear the queue and zero every output.",
        ...TRAINING_SOURCE,
        group: "Safety",
        enabled: true,
        reversible: false,
        oneShot: true,
        payloadSchema: { session_id: "Optional session id" },
    },
    [ActionType.LOVENSE_SET]: {
        label: "Set Lovense output",
        description: "Set vibration or another output on the targeted devices.",
        integrationId: "lovense",
        integrationName: "Lovense",
        group: "Control",
        enabled: true,
        reversible: false,
        oneShot: false,
        payloadSchema: {
            devices: "Device ids or 'all'",
            tags: "Target tags",
            output: "Vibrate, Rotate, ...",
            value: "MagicNumber, e.g. 50, +10, [10-20]",
            mode: "expression, absolute, relative or percent",
        },
    },
    [ActionType.LOVENSE_PULSE]: {
        label: "Lovense pulse",
        description: "One attack/hold/release pulse.",
        integrationId: "lovense",
        integrationName: "Lovense",
        group: "Control",
        enabled: true,
        reversible: false,
        oneShot: true,
        payloadSchema: { value: "Peak percentage", hold_ms: "Hold time" },
    },
    [ActionType.LOVENSE_STOP]: {
        label: "Stop Lovense output",
        description: "Stop the targeted devices.",
        integrationId: "lovense",
        integrationName: "Lovense",
        group: "Safety",
        enabled: true,
        reversible: false,
        oneShot: true,
        payloadSchema: { devices: "Device ids or 'all'", tags: "Target tags" },
    },
    [ActionType.LOVENSE_PATTERN_PLAY]: {
        label: "Play Lovense pattern",
        description: "Play a saved Lovense profile on the targeted devices.",
        integrationId: "lovense",
        integrationName: "Lovense",
        group: "Patterns",
        enabled: true,
        reversible: true,
        oneShot: false,
        payloadSchema: { pattern_id: "Pattern id", devices: "Device ids or 'all'" },
    },
    [ActionType.LOVENSE_PATTERN_STOP]: {
        label: "Stop Lovense pattern",
        description: "Stop one run, one pattern or every run.",
        integrationId: "lovense",
        integrationName: "Lovense",
        group: "Patterns",
        enabled: true,
        reversible: false,
        oneShot: true,
        payloadSchema: { run_id: "Run id", pattern_id: "Pattern id", all: "All runs" },
    },
    [ActionType.LOVENSE_RANDOM_PATTERN]: {
        label: "Play random Lovense pattern",
        description: "Pick a random pattern, optionally filtered by tags.",
        integrationId: "lovense",
        integrationName: "Lovense",
        group: "Patterns",
        enabled: true,
        reversible: true,
        oneShot: false,
        payloadSchema: { pattern_tags: "Pattern tags", devices: "Device ids or 'all'" },
    },
    [ActionType.LOVENSE_SCAN]: {
        label: "Scan Lovense devices",
        description: "Start a scan on one Buttplug node.",
        integrationId: "lovense",
        integrationName: "Lovense",
        group: "Setup",
        enabled: true,
        reversible: false,
        oneShot: true,
        payloadSchema: { node_id: "Node id", seconds: "Duration" },
    },
    [ActionType.LOVENSE_SET_CAP]: {
        label: "Set Lovense intensity cap",
        description: "Change the maximum output percentage of the targeted devices.",
        integrationId: "lovense",
        integrationName: "Lovense",
        group: "Safety",
        enabled: true,
        reversible: false,
        oneShot: true,
        payloadSchema: { devices: "Device ids or 'all'", max_pct: "Cap percentage" },
    },
    [ActionType.LOVENSE_ASSIGN]: {
        label: "Assign Lovense devices",
        description: "Set an alias and/or tags on the targeted devices.",
        integrationId: "lovense",
        integrationName: "Lovense",
        group: "Setup",
        enabled: true,
        reversible: false,
        oneShot: true,
        payloadSchema: { devices: "Device ids or 'all'", alias: "Alias", new_tags: "Tags" },
    },
    [ActionType.LOVENSE_RECONNECT]: {
        label: "Reconnect Lovense node",
        description: "Ask one node (or every node) to reconnect.",
        integrationId: "lovense",
        integrationName: "Lovense",
        group: "Setup",
        enabled: true,
        reversible: false,
        oneShot: true,
        payloadSchema: { node_id: "Optional node id" },
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
        oneShot: fallback?.oneShot ?? false,
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
                    oneShot: action.one_shot ?? fallback.oneShot,
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
