import { RampEndAction } from "@/types";

/** Fall back to the legacy peak-hold behaviour for missing/unknown values. */
export function normalizeRampEndAction(value: unknown): RampEndAction {
    return Object.values(RampEndAction).includes(value as RampEndAction)
        ? (value as RampEndAction)
        : RampEndAction.HOLD_PEAK;
}

/** Keep a SET_LEVEL target explicit and inside the global 0-100 range. */
export function normalizeRampEndValue(
    value: unknown,
    action: RampEndAction,
): number {
    if (action !== RampEndAction.SET_LEVEL) return 0;
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Resolve the field level after a finite ramp stops. `currentLevel` is the
 * level the curve had reached, used by "keep current".
 */
export function resolveRampEndLevel({
    action,
    endValue,
    startLevel,
    maxLevel,
    currentLevel,
}: {
    action: RampEndAction | undefined;
    endValue: number | null | undefined;
    startLevel: number;
    maxLevel: number;
    currentLevel: number;
}): number {
    const clamp = (value: number) =>
        Math.min(100, Math.max(0, Math.round(value)));
    switch (action) {
        case RampEndAction.HOLD_CURRENT:
            return clamp(currentLevel);
        case RampEndAction.RESTORE_START:
            return clamp(startLevel);
        case RampEndAction.SET_LEVEL:
            return Math.min(clamp(maxLevel), clamp(endValue ?? 0));
        case RampEndAction.HOLD_PEAK:
        default:
            return clamp(maxLevel);
    }
}
