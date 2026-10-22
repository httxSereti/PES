import { useCallback } from "react";
import { useAppSelector } from "@/store/hooks";
import type { RampStartPayload, RampTarget } from "@/types";
import {
    normalizeRampEndAction,
    normalizeRampEndValue,
} from "@/lib/ramp-end";

/** A ramp start payload without its target: the settings worth remembering. */
export type RampDefaults = Omit<RampStartPayload, "unit" | "field">;

const STORAGE_KEY = "pes.ramp.defaults.v1";

type DefaultsMap = Record<string, RampDefaults>;

/** Fill the post-ramp fields for entries saved before they existed. */
function normalizeDefaults(defaults: RampDefaults): RampDefaults {
    const endAction = normalizeRampEndAction(defaults.end_action);
    return {
        ...defaults,
        end_action: endAction,
        end_value: normalizeRampEndValue(defaults.end_value, endAction),
    };
}

const targetKey = (
    userId: string,
    unit: RampTarget["unit"],
    field: RampTarget["field"],
) => `${userId}:${unit}.${field}`;

function readMap(): DefaultsMap {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as DefaultsMap) : {};
    } catch {
        return {};
    }
}

function writeMap(map: DefaultsMap): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
        // storage unavailable (private mode, quota): ramps still start,
        // only the one-click memory is lost
    }
}

/**
 * Per-user, per-channel memory of the last ramp settings, so the home page
 * can start a ramp in one click. Client-only (localStorage).
 */
export function useRampDefaults() {
    const userId = useAppSelector((state) => state.auth.user?.id ?? "anonymous");

    const getDefaults = useCallback(
        (unit: RampTarget["unit"], field: RampTarget["field"]): RampDefaults | null => {
            const stored = readMap()[targetKey(userId, unit, field)];
            return stored ? normalizeDefaults(stored) : null;
        },
        [userId],
    );

    const saveDefaults = useCallback(
        (
            unit: RampTarget["unit"],
            field: RampTarget["field"],
            defaults: RampDefaults,
        ): void => {
            const map = readMap();
            map[targetKey(userId, unit, field)] = normalizeDefaults(defaults);
            writeMap(map);
        },
        [userId],
    );

    const clearDefaults = useCallback(
        (unit: RampTarget["unit"], field: RampTarget["field"]): void => {
            const map = readMap();
            delete map[targetKey(userId, unit, field)];
            writeMap(map);
        },
        [userId],
    );

    return { getDefaults, saveDefaults, clearDefaults };
}
