import type { LovenseDeviceInfo } from "@/types";

export interface PlayerOutput {
    deviceId: string;
    featureIndex: number;
    output: string;
    label: string;
    max: number;
    cap: number;
}

export function outputKey(
    deviceId: string,
    featureIndex: number,
    output: string,
) {
    return `${deviceId}:${featureIndex}:${output}`;
}

export function effectiveCap(device: LovenseDeviceInfo, globalCap: number) {
    return Math.max(0, Math.min(globalCap, device.max_intensity_pct));
}

export function deviceOutputs(
    device: LovenseDeviceInfo,
    globalCap: number,
): PlayerOutput[] {
    const cap = effectiveCap(device, globalCap);
    const entries: PlayerOutput[] = [];

    for (const feature of device.features ?? []) {
        for (const [output, spec] of Object.entries(feature.outputs ?? {})) {
            const defaultLabel =
                output === "Vibrate"
                    ? `Motor ${feature.index + 1}`
                    : `${output} ${feature.index + 1}`;
            entries.push({
                deviceId: device.id,
                featureIndex: feature.index,
                output,
                label: feature.description || defaultLabel,
                max: Math.max(1, spec.max ?? 1),
                cap,
            });
        }
    }

    return entries.sort((a, b) => {
        if (a.output === "Vibrate" && b.output !== "Vibrate") return -1;
        if (a.output !== "Vibrate" && b.output === "Vibrate") return 1;
        return (
            a.featureIndex - b.featureIndex || a.output.localeCompare(b.output)
        );
    });
}

export function clampIntensity(value: number, cap = 100) {
    return Math.max(0, Math.min(cap, Math.round(value)));
}

export function formatPatternDuration(durationMs: number) {
    const seconds = Math.max(0, Math.round(durationMs / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export function formatRunTime(seconds: number) {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const remainder = safeSeconds % 60;
    return hours
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
        : `${minutes}:${String(remainder).padStart(2, "0")}`;
}
