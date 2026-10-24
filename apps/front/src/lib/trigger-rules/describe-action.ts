import { ActionType } from "@/types/events.types";

export type ActionTone = "violet" | "emerald" | "amber" | "sky" | "pink" | "slate";

export interface DescribedAction {
    /** Raw action type id, shown in the type chip. */
    type: string;
    /** One-line summary used in dense rows. */
    title: string;
    /** Longer explanation used in the expanded chain. */
    detail: string;
    duration: string;
    mode: "cumulative" | "waits";
    tone: ActionTone;
}

/** Minimal shape shared by TriggerAction and TriggeredAction. */
export interface ActionLike {
    action_type: string;
    payload: Record<string, unknown>;
    duration: number;
    cumulative: boolean;
}

function text(value: unknown, fallback = "—"): string {
    if (typeof value === "string") return value.trim() || fallback;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return fallback;
}

function num(value: unknown, fallback = 0): number {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: unknown, fallback = false): boolean {
    return typeof value === "boolean" ? value : fallback;
}

/** "-1" means the action never expires. */
export function formatActionDuration(seconds: number): string {
    if (seconds < 0) return "∞";
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    const restSeconds = seconds % 60;
    if (minutes < 60) {
        return restSeconds === 0 ? `${minutes}m` : `${minutes}m ${restSeconds}s`;
    }

    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    return restMinutes === 0 ? `${hours}h` : `${hours}h ${restMinutes}m`;
}

export function actionTone(actionType: string): ActionTone {
    switch (actionType) {
        case ActionType.PROFILE:
            return "violet";
        case ActionType.LEVEL:
            return "emerald";
        case ActionType.MULT:
            return "amber";
        case ActionType.CHASTER_TIME_UPDATE:
            return "sky";
        default:
            return actionType.startsWith("PURYFI_") ? "pink" : "slate";
    }
}

/**
 * Single source of truth for how an action reads in the UI.
 * Kept free of React so the list, history and form can share it.
 */
export function describeAction(action: ActionLike): DescribedAction {
    const payload = action.payload ?? {};
    const base = {
        type: action.action_type,
        duration: formatActionDuration(num(action.duration, -1)),
        mode: action.cumulative ? ("cumulative" as const) : ("waits" as const),
        tone: actionTone(action.action_type),
    };

    switch (action.action_type) {
        case ActionType.PROFILE: {
            const profile = text(payload.profile, "profile");
            const level = num(payload.level_pct, 100);
            return {
                ...base,
                title: `${profile} at ${level}%`,
                detail: `Apply saved profile "${profile}" · level ${level}%`,
            };
        }

        case ActionType.LEVEL: {
            const value = text(payload.value);
            const units = text(payload.units);
            const channels = text(payload.channels);
            return {
                ...base,
                title: `${value} · ${units}/${channels}`,
                detail: `Level ${value} · units ${units} · channels ${channels}`,
            };
        }

        case ActionType.MULT: {
            const pct = num(payload.pct);
            const signed = pct > 0 ? `+${pct}` : `${pct}`;
            const target = text(payload.target, "all");
            const random = bool(payload.random);
            return {
                ...base,
                title: `${signed}% on ${target}${random ? " · random" : ""}`,
                detail: `Multiplier ${signed}% on ${target}${random ? " · randomized" : ""}`,
            };
        }

        case ActionType.CHASTER_TIME_UPDATE: {
            const minutes = num(payload.duration_minutes);
            const signed = minutes > 0 ? `+${minutes}` : `${minutes}`;
            const onlyMax = bool(payload.only_max);
            return {
                ...base,
                title: `${signed} min on Chaster${onlyMax ? " · max only" : ""}`,
                detail: onlyMax
                    ? "Add or remove time from the Chaster max lock time only"
                    : "Add or remove time from the Chaster lock",
            };
        }

        case ActionType.PURYFI_SET_ENABLED: {
            const enabled = bool(payload.enabled, true);
            return {
                ...base,
                title: enabled ? "Enable PuryFi blocker" : "Disable PuryFi blocker",
                detail: "Change the PuryFi blocker state",
            };
        }

        case ActionType.PURYFI_SET_LOCK: {
            const timer = num(payload.timer_minutes);
            return {
                ...base,
                title: timer > 0 ? `Lock PuryFi for ${timer} min` : "Lock PuryFi · no timer",
                detail: "Create a new PuryFi lock using the configured lock password",
            };
        }

        case ActionType.PURYFI_SET_LOCK_TIMER: {
            const value = text(payload.value);
            return {
                ...base,
                title: `PuryFi timer ${value}`,
                detail: `Update the PuryFi lock timer (${value} minutes)`,
            };
        }

        case ActionType.PURYFI_ENTER_LOCK_PASSWORD:
            return {
                ...base,
                title: "Unlock PuryFi with saved password",
                detail: "Use the saved lock password to remove the PuryFi lock",
            };

        case ActionType.PURYFI_EMERGENCY_UNLOCK:
            return {
                ...base,
                title: "Emergency-unlock PuryFi",
                detail: "Use the emergency server token to remove the PuryFi lock",
            };

        case ActionType.PURYFI_UPDATE_WBLIST: {
            const operation = text(payload.operation, "add");
            const list = text(payload.list, "blacklist");
            const value = text(payload.value, "");
            const operationLabel =
                operation === "remove"
                    ? `Remove from ${list}`
                    : operation === "set_mode"
                      ? `Set ${list} mode`
                      : `Add to ${list}`;
            return {
                ...base,
                title: value ? `${operationLabel} · ${value}` : operationLabel,
                detail: `PuryFi ${list} · ${text(payload.entry_mode, "text")} entry`,
            };
        }

        default:
            return {
                ...base,
                title: action.action_type,
                detail: "Action",
            };
    }
}
