import * as z from "zod";
import { ActionType, type TriggerAction, type TriggerRule } from "@/types/events.types";

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
        // the operator is part of the value itself (a MagicNumber): 30, +5, -5, %+5, %-[5-10]
        value: z.string().min(1, "e.g. 30, +5, %-[5-10]"),
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
    labels: z.array(z.string().min(1)),
    actions: z.array(actionSchema).min(1, "Add at least one action."),
});

export type FormValues = z.infer<typeof formSchema>;
export type ActionValues = z.infer<typeof actionSchema>;

/** Default payload when adding or switching to an action type. */
export function defaultAction(action_type: ActionType): ActionValues {
    const base = { duration: -1, cumulative: false };
    switch (action_type) {
        case ActionType.PROFILE:
            return { ...base, action_type, profile: "", level_pct: 100 };
        case ActionType.LEVEL:
            return { ...base, action_type, units: "", channels: "", value: "" };
        case ActionType.MULT:
            return { ...base, action_type, target: "all", pct: 0, random: false };
        case ActionType.CHASTER_TIME_UPDATE:
            return { ...base, action_type, duration_minutes: 0, only_max: false };
    }
}

/** Map a persisted action's payload back onto the form's per-type fields. */
export function actionToFormValues(action: TriggerAction): ActionValues {
    const p = action.payload ?? {};
    const base = { duration: action.duration ?? -1, cumulative: action.cumulative ?? false };
    switch (action.action_type) {
        case ActionType.PROFILE:
            return { ...base, action_type: ActionType.PROFILE, profile: String(p["profile"] ?? ""), level_pct: Number(p["level_pct"] ?? 100) };
        case ActionType.LEVEL:
            return {
                ...base,
                action_type: ActionType.LEVEL,
                units: String(p["units"] ?? ""),
                channels: String(p["channels"] ?? ""),
                value: String(p["value"] ?? ""),
            };
        case ActionType.MULT:
            return { ...base, action_type: ActionType.MULT, target: String(p["target"] ?? "all"), pct: Number(p["pct"] ?? 0), random: Boolean(p["random"] ?? false) };
        case ActionType.CHASTER_TIME_UPDATE:
            return { ...base, action_type: ActionType.CHASTER_TIME_UPDATE, duration_minutes: Number(p["duration_minutes"] ?? 0), only_max: Boolean(p["only_max"] ?? false) };
        default:
            return defaultAction(ActionType.LEVEL);
    }
}

/** Build form defaults from an existing rule (for the edit page). */
export function ruleToFormValues(rule: TriggerRule): FormValues {
    return {
        name: rule.name,
        description: rule.description ?? "",
        event_type: rule.event_type,
        priority: rule.priority,
        enabled: rule.enabled,
        labels: rule.labels.map((l) => l.name),
        actions: rule.actions.length > 0
            ? [...rule.actions].sort((a, b) => a.sort_order - b.sort_order).map(actionToFormValues)
            : [defaultAction(ActionType.LEVEL)],
    };
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
