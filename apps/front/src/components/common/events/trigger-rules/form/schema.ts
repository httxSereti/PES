import * as z from "zod";
import { ActionType } from "@/types/events.types";

// ───────── Schema ─────────

const baseAction = z.object({
    duration: z.coerce.number().int().min(-1, "Use -1 for no expiry"),
    cumulative: z.boolean(),
});

export const actionSchema = z.discriminatedUnion("action_type", [
    baseAction.extend({
        action_type: z.literal(ActionType.PROFILE),
        profile: z.string().min(1, "Profile is required (A-J, or X for random)"),
        level_pct: z.coerce.number().int().min(0).max(200),
    }),
    baseAction.extend({
        action_type: z.literal(ActionType.LEVEL),
        units: z.string().min(1, "e.g. 123, 12RM, 23RO"),
        channels: z.string().min(1, "e.g. AB, ABRM"),
        operation: z.string(),
        value: z.string().min(1, "e.g. 30, +10, %-5"),
    }),
    baseAction.extend({
        action_type: z.literal(ActionType.MULT),
        target: z.string().min(1, "Usage name or 'all'"),
        pct: z.coerce.number().int(),
        random: z.boolean(),
    }),
    baseAction.extend({
        action_type: z.literal(ActionType.CHASTER_TIME_UPDATE),
        duration_minutes: z.coerce.number().int(),
        only_max: z.boolean(),
    }),
]);

export const formSchema = z.object({
    name: z.string().min(3, "Name must be at least 3 characters.").max(64, "Name must be at most 64 characters."),
    description: z.string().max(256, "Description must be at most 256 characters.").optional(),
    event_type: z.string().min(1, "Please select an event."),
    priority: z.coerce.number().int().min(0).max(100),
    enabled: z.boolean(),
    actions: z.array(actionSchema).min(1, "Add at least one action."),
});

export type FormValues = z.infer<typeof formSchema>;
export type ActionValues = z.infer<typeof actionSchema>;

// "set" is a UI sentinel — Radix Select forbids empty values; it maps to "" (the backend's set prefix).
export const LEVEL_OPERATIONS = [
    { value: "set", label: "set (=)" },
    { value: "+", label: "add (+)" },
    { value: "-", label: "subtract (-)" },
    { value: "%+", label: "add % (%+)" },
    { value: "%-", label: "subtract % (%-)" },
] as const;

/** Default payload when adding or switching to an action type. */
export function defaultAction(action_type: ActionType): ActionValues {
    const base = { duration: -1, cumulative: false };
    switch (action_type) {
        case ActionType.PROFILE:
            return { ...base, action_type, profile: "", level_pct: 100 };
        case ActionType.LEVEL:
            return { ...base, action_type, units: "", channels: "", operation: "set", value: "" };
        case ActionType.MULT:
            return { ...base, action_type, target: "all", pct: 0, random: false };
        case ActionType.CHASTER_TIME_UPDATE:
            return { ...base, action_type, duration_minutes: 0, only_max: false };
    }
}

/** Turn a validated action into the WS { action_type, payload, duration, cumulative, sort_order } body. */
export function toActionBody(action: ActionValues, sort_order: number) {
    const { action_type, duration, cumulative } = action;
    let payload: Record<string, unknown>;
    switch (action.action_type) {
        case ActionType.PROFILE:
            payload = { profile: action.profile, level_pct: action.level_pct };
            break;
        case ActionType.LEVEL:
            payload = {
                units: action.units,
                channels: action.channels,
                operation: action.operation === "set" ? "" : action.operation,
                value: action.value,
            };
            break;
        case ActionType.MULT:
            payload = { target: action.target, pct: action.pct, random: action.random };
            break;
        case ActionType.CHASTER_TIME_UPDATE:
            payload = { duration_minutes: action.duration_minutes, only_max: action.only_max };
            break;
    }
    return { action_type, payload, duration, cumulative, sort_order };
}
