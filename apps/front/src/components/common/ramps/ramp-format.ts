import { RampEndAction, RampMode } from "@/types";
import type { RampDefaults } from "@/hooks/useRampDefaults";

/** "5:03" (or "1:02:03" past an hour). */
export function formatSeconds(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
    }
    return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** "permanent" for the DURATION_PERMANENT sentinel (-1), "5:03" otherwise. */
export function formatDuration(duration: number): string {
    return duration === -1 ? "permanent" : formatSeconds(duration);
}

/** "step 1% · every 1s" — step_unit "absolute" drops the %. */
export function describeRampSettings(
    step: number,
    stepUnit: string,
    timer: number,
    mode: RampMode,
    dwell = 0,
    release = 4,
): string {
    const stepText =
        mode === RampMode.SQUARE
            ? `every ${timer}s`
            : `step ${step}${stepUnit === "absolute" ? "" : "%"} · every ${timer}s`;
    const extra =
        mode === RampMode.SURGE
            ? ` · release ×${release}`
            : mode === RampMode.DWELL
              ? ` · hold ${dwell}s`
              : "";
    return `${stepText}${extra}`;
}

/** "rests at the peak (60%)" — phrase used in previews and duration hints. */
export function describeRampEnd(
    action: RampEndAction,
    endValue: number,
    startLevel: number,
    maxLevel: number,
): string {
    switch (action) {
        case RampEndAction.HOLD_CURRENT:
            return "keeps the level it reached";
        case RampEndAction.RESTORE_START:
            return `returns to the start (${startLevel}%)`;
        case RampEndAction.SET_LEVEL:
            return `goes to level ${Math.min(100, Math.max(0, Math.round(endValue)), maxLevel)}`;
        case RampEndAction.HOLD_PEAK:
        default:
            return `rests at the peak (${maxLevel}%)`;
    }
}

/** Short end-behavior label for compact remembered-setting summaries. */
export function describeRampEndShort(
    action: RampEndAction | undefined,
    endValue: number | null | undefined,
): string | null {
    switch (action) {
        case RampEndAction.HOLD_CURRENT:
            return "keep end";
        case RampEndAction.RESTORE_START:
            return "back to start";
        case RampEndAction.SET_LEVEL:
            return `end level ${Math.min(100, Math.max(0, Math.round(endValue ?? 0)))}`;
        default:
            return null;
    }
}

/** "WAVE · 1%/1s · → 60" — compact summary of remembered settings. */
export function describeDefaults(defaults: RampDefaults): string {
    const step =
        defaults.mode === RampMode.SQUARE
            ? `${defaults.timer}s/step`
            : `${defaults.step}${defaults.step_unit === "absolute" ? "" : "%"}/${defaults.timer}s`;
    const modeExtra =
        defaults.mode === RampMode.SURGE
            ? `release ×${defaults.release ?? 4}`
            : defaults.mode === RampMode.DWELL
              ? `hold ${defaults.dwell ?? 0}s`
              : null;
    const target = summarizeValue(defaults.max_value);
    return [
        defaults.mode.toUpperCase(),
        step,
        modeExtra,
        target ? `→ ${target}` : null,
        describeRampEndShort(defaults.end_action, defaults.end_value),
    ]
        .filter(Boolean)
        .join(" · ");
}

/** Human label for a numeric value or a MagicNumber range string like "[25-35]". */
export function summarizeValue(value: number | string | null | undefined): string | null {
    if (value === null || value === undefined || value === "") return null;
    return String(value);
}
