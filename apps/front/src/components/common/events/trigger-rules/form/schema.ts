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
        profile: z.string().min(1, "Profile is required"),
        level_pct: z.coerce.number().int().min(0).max(150, "Max 150"),
    }),
    baseAction.extend({
        action_type: z.literal(ActionType.LEVEL),
        units: z
            .string()
            .min(1, "Choose a unit group, e.g. 123 or 12RM")
            .regex(/^[1-3]+(?:RM|RO)?$/i, "Use unit IDs 1–3, optionally followed by RM or RO"),
        channels: z
            .string()
            .min(1, "Choose a channel group, e.g. AB or ABRM")
            .regex(/^[AB]+(?:RM|RO)?$/i, "Use channels A/B, optionally followed by RM or RO"),
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
    baseAction.extend({
        action_type: z.literal(ActionType.PURYFI_SET_ENABLED),
        enabled: z.boolean(),
    }),
    baseAction.extend({
        action_type: z.literal(ActionType.PURYFI_SET_LOCK),
        timer_minutes: z.coerce.number().int().min(0, "Use 0 for no timer"),
        password: z.string(),
    }),
    baseAction.extend({
        action_type: z.literal(ActionType.PURYFI_SET_LOCK_TIMER),
        // a minutes expression: 30, +10, -5, [5-25], +[5-25]
        value: z.string().min(1, "e.g. 30, +10, -5, [5-25]"),
    }),
    baseAction.extend({
        action_type: z.literal(ActionType.PURYFI_ENTER_LOCK_PASSWORD),
    }),
    baseAction.extend({
        action_type: z.literal(ActionType.PURYFI_EMERGENCY_UNLOCK),
    }),
    baseAction.extend({
        action_type: z.literal(ActionType.PURYFI_UPDATE_WBLIST),
        operation: z.enum(["add", "remove", "set_mode"]),
        list: z.enum(["blacklist", "whitelist"]),
        entry_mode: z.enum(["text", "regex"]),
        value: z.string(),
    }),
]);

export const formSchema = z.object({
    name: z.string().min(3, "Name must be at least 3 characters.").max(64, "Name must be at most 64 characters."),
    description: z.string().max(256, "Description must be at most 256 characters.").optional(),
    event_types: z.array(z.string().min(1)).min(1, "Select at least one event."),
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
        case ActionType.PURYFI_SET_ENABLED:
            return { ...base, action_type, enabled: true };
        case ActionType.PURYFI_SET_LOCK:
            return { ...base, action_type, timer_minutes: 30, password: "" };
        case ActionType.PURYFI_SET_LOCK_TIMER:
            return { ...base, action_type, value: "+10" };
        case ActionType.PURYFI_ENTER_LOCK_PASSWORD:
            return { ...base, action_type };
        case ActionType.PURYFI_EMERGENCY_UNLOCK:
            return { ...base, action_type };
        case ActionType.PURYFI_UPDATE_WBLIST:
            return { ...base, action_type, operation: "add", list: "blacklist", entry_mode: "text", value: "" };
    }
}

/** Map a persisted action's payload back onto the form's per-type fields. */
export function actionToFormValues(action: TriggerAction): ActionValues {
    const p = action.payload ?? {};
    const base = { duration: action.duration ?? -1, cumulative: action.cumulative ?? false };
    switch (action.action_type) {
        case ActionType.PROFILE:
            return {
                ...base,
                action_type: ActionType.PROFILE,
                profile: String(p["profile"] ?? ""),
                level_pct: Number(p["level_pct"] ?? 100),
            };
        case ActionType.LEVEL:
            return {
                ...base,
                action_type: ActionType.LEVEL,
                units: String(p["units"] ?? ""),
                channels: String(p["channels"] ?? ""),
                value: String(p["value"] ?? ""),
            };
        case ActionType.MULT:
            return {
                ...base,
                action_type: ActionType.MULT,
                target: String(p["target"] ?? "all"),
                pct: Number(p["pct"] ?? 0),
                random: Boolean(p["random"] ?? false),
            };
        case ActionType.CHASTER_TIME_UPDATE:
            return {
                ...base,
                action_type: ActionType.CHASTER_TIME_UPDATE,
                duration_minutes: Number(p["duration_minutes"] ?? 0),
                only_max: Boolean(p["only_max"] ?? false),
            };
        case ActionType.PURYFI_SET_ENABLED:
            return { ...base, action_type: ActionType.PURYFI_SET_ENABLED, enabled: Boolean(p["enabled"] ?? true) };
        case ActionType.PURYFI_SET_LOCK:
            return {
                ...base,
                action_type: ActionType.PURYFI_SET_LOCK,
                timer_minutes: Number(p["timer_minutes"] ?? 0),
                password: String(p["password"] ?? ""),
            };
        case ActionType.PURYFI_SET_LOCK_TIMER:
            return { ...base, action_type: ActionType.PURYFI_SET_LOCK_TIMER, value: String(p["value"] ?? "+10") };
        case ActionType.PURYFI_ENTER_LOCK_PASSWORD:
            return { ...base, action_type: ActionType.PURYFI_ENTER_LOCK_PASSWORD };
        case ActionType.PURYFI_EMERGENCY_UNLOCK:
            return { ...base, action_type: ActionType.PURYFI_EMERGENCY_UNLOCK };
        case ActionType.PURYFI_UPDATE_WBLIST: {
            const operation = String(p["operation"] ?? "add");
            const list = String(p["list"] ?? "blacklist");
            const entryMode = String(p["entry_mode"] ?? "text");
            return {
                ...base,
                action_type: ActionType.PURYFI_UPDATE_WBLIST,
                operation: operation === "remove" || operation === "set_mode" ? operation : "add",
                list: list === "whitelist" ? "whitelist" : "blacklist",
                entry_mode: entryMode === "regex" ? "regex" : "text",
                value: String(p["value"] ?? ""),
            };
        }
        default:
            return defaultAction(ActionType.LEVEL);
    }
}

/** Compact one-line summary shown in the collapsed action row. */
export function actionSummary(action: ActionValues): string {
    switch (action.action_type) {
        case ActionType.PROFILE:
            if (!action.profile) return "Not configured";
            return `${action.profile} · ${action.level_pct}%`;
        case ActionType.LEVEL:
            if (!action.units && !action.channels && !action.value) {
                return "Not configured";
            }
            return `Units ${action.units || "?"} · Channels ${action.channels || "?"} · ${action.value || "?"}`;
        case ActionType.MULT:
            return `${action.target || "all"} · ${action.pct}%${action.random ? " · random" : ""}`;
        case ActionType.CHASTER_TIME_UPDATE:
            return `${action.duration_minutes} min${action.only_max ? " · max only" : ""}`;
        case ActionType.PURYFI_SET_ENABLED:
            return action.enabled ? "Enable blocker" : "Disable blocker";
        case ActionType.PURYFI_SET_LOCK:
            return `${action.timer_minutes} min${action.password ? " · password set" : ""}`;
        case ActionType.PURYFI_SET_LOCK_TIMER:
            return action.value || "No time set";
        case ActionType.PURYFI_ENTER_LOCK_PASSWORD:
        case ActionType.PURYFI_EMERGENCY_UNLOCK:
            return "Uses saved credentials";
        case ActionType.PURYFI_UPDATE_WBLIST:
            return `${action.operation} · ${action.list}${action.value ? ` · ${action.value}` : ""}`;
        default:
            return "Configure action";
    }
}

/** Build form defaults from an existing rule (for the edit page). */
export function ruleToFormValues(rule: TriggerRule): FormValues {
    return {
        name: rule.name,
        description: rule.description ?? "",
        event_types: rule.event_types?.length > 0 ? rule.event_types : rule.event_type ? [rule.event_type] : [],
        priority: rule.priority,
        enabled: rule.enabled,
        labels: rule.labels.map((l) => l.name),
        actions:
            rule.actions.length > 0
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
        case ActionType.PURYFI_SET_ENABLED:
            payload = { enabled: action.enabled };
            break;
        case ActionType.PURYFI_SET_LOCK:
            payload = { timer_minutes: action.timer_minutes, password: action.password };
            break;
        case ActionType.PURYFI_SET_LOCK_TIMER:
            payload = { value: action.value };
            break;
        case ActionType.PURYFI_ENTER_LOCK_PASSWORD:
        case ActionType.PURYFI_EMERGENCY_UNLOCK:
            payload = {};
            break;
        case ActionType.PURYFI_UPDATE_WBLIST:
            payload = {
                operation: action.operation,
                list: action.list,
                entry_mode: action.entry_mode,
                value: action.value,
            };
            break;
    }
    return { action_type, payload, duration, cumulative, sort_order };
}
