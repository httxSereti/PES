import { useCallback, useEffect, useState } from "react";
import { useAppSelector } from "@/store/hooks";
import type { RampDefaults } from "@/hooks/useRampDefaults";

export type RampPreset = {
    id: string;
    name: string;
    defaults: RampDefaults;
};

const STORAGE_KEY = "pes.ramp.presets.v1";
const MAX_PRESETS = 12;

type PresetsMap = Record<string, RampPreset[]>;

function readMap(): PresetsMap {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as PresetsMap) : {};
    } catch {
        return {};
    }
}

function writeMap(map: PresetsMap): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
        // storage unavailable: ramps still start, only presets are lost
    }
}

function createId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Named ramp presets, shared across channels and persisted per user in
 * localStorage. `refresh()` re-reads storage (e.g. before opening a menu
 * that another component may have written to).
 */
export function useRampPresets() {
    const userId = useAppSelector((state) => state.auth.user?.id ?? "anonymous");
    const [presets, setPresets] = useState<RampPreset[]>(
        () => readMap()[userId] ?? [],
    );

    const refresh = useCallback(() => {
        setPresets(readMap()[userId] ?? []);
    }, [userId]);

    // Re-read when the signed-in user changes.
    useEffect(() => {
        refresh();
    }, [refresh]);

    const savePreset = useCallback(
        (name: string, defaults: RampDefaults): RampPreset | null => {
            const trimmed = name.trim();
            if (!trimmed) return null;

            const map = readMap();
            const list = map[userId] ?? [];
            const existing = list.find(
                (preset) => preset.name.toLowerCase() === trimmed.toLowerCase(),
            );

            let saved: RampPreset;
            let next: RampPreset[];
            if (existing) {
                saved = { ...existing, name: trimmed, defaults };
                next = list.map((preset) =>
                    preset.id === existing.id ? saved : preset,
                );
            } else {
                saved = { id: createId(), name: trimmed, defaults };
                next = [...list, saved];
                if (next.length > MAX_PRESETS) {
                    next = next.slice(next.length - MAX_PRESETS);
                }
            }

            map[userId] = next;
            writeMap(map);
            setPresets(next);
            return saved;
        },
        [userId],
    );

    const deletePreset = useCallback(
        (id: string): void => {
            const map = readMap();
            const next = (map[userId] ?? []).filter((preset) => preset.id !== id);
            map[userId] = next;
            writeMap(map);
            setPresets(next);
        },
        [userId],
    );

    return { presets, savePreset, deletePreset, refresh };
}
