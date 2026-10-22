/**
 * Draft state of the profile studio: one reducer-ish hook that owns the
 * editable copy, the dirty flag and every mutation the tabs need.
 *
 * The draft is re-parsed when a new `profiles:detail` reply arrives; live
 * unit updates never reset it (they are only a source for "copy live").
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RampEndAction, RampMode } from "@/types";
import type { ProfileDetail } from "@/types";
import type { UnitSettings } from "@/types/units.types";
import {
    normalizeRampEndAction,
    normalizeRampEndValue,
} from "@/lib/ramp-end";

import {
    draftUnitFrom,
    liveUnitBlock,
    parseProfileDraft,
    RAMPABLE_FIELDS,
    unitRampCount,
    UNIT_IDS,
    type DefaultsDraft,
    type ProfileDraft,
    type RampDraft,
    type RampField,
    type UnitDraft,
    type UnitId,
} from "./profile-document";

/** Default ramp added by the "Add ramp" buttons. */
function newRamp(): RampDraft {
    return {
        timer: 1,
        step: 1,
        stepUnit: "percent",
        mode: RampMode.WAVE,
        dwell: 0,
        release: 4,
        duration: -1,
        start: { mode: "live", value: 0, range: "" },
        max: { mode: "live", value: 100, range: "" },
        endAction: RampEndAction.HOLD_PEAK,
        endValue: 0,
        raw: {},
    };
}

export type LiveRampLike = {
    unit: string;
    field: string;
    timer: number;
    step: number;
    step_unit: string;
    mode: RampMode;
    dwell: number;
    release: number;
    duration: number;
    start_value: number;
    max_value: number;
    end_action?: RampEndAction;
    end_value?: number | null;
};

export type ProfileEditorActions = {
    setName: (name: string) => void;
    setDescription: (description: string) => void;
    patchUnit: (id: UnitId, patch: Partial<UnitDraft>) => void;
    addUnit: (id: UnitId, block: Record<string, unknown>) => void;
    removeUnit: (id: UnitId) => void;
    copyLiveUnit: (id: UnitId, live: UnitSettings) => void;
    patchRamp: (
        id: UnitId,
        field: RampField,
        patch: Partial<RampDraft>,
    ) => void;
    addRamp: (id: UnitId, field: RampField) => void;
    removeRamp: (id: UnitId, field: RampField) => void;
    copyLiveRamps: (id: UnitId, ramps: LiveRampLike[]) => void;
    patchDefaults: (patch: Partial<DefaultsDraft>) => void;
};

export function useProfileEditorDraft(
    detail: ProfileDetail | undefined,
    liveUnits: Partial<Record<string, UnitSettings>>,
) {
    const [draft, setDraft] = useState<ProfileDraft | null>(null);
    const [baseline, setBaseline] = useState("");

    // Live settings only seed the initial parse; keep them in a ref so
    // streaming unit updates do not reset the draft under the user.
    const liveRef = useRef(liveUnits);
    useEffect(() => {
        liveRef.current = liveUnits;
    }, [liveUnits]);

    useEffect(() => {
        if (!detail) {
            setDraft(null);
            setBaseline("");
            return;
        }
        const parsed = parseProfileDraft(detail, liveRef.current);
        setDraft(parsed);
        setBaseline(JSON.stringify(parsed));
    }, [detail]);

    const patchUnit = useCallback((id: UnitId, patch: Partial<UnitDraft>) => {
        setDraft((current) => {
            if (!current) return current;
            const unit = current.units[id];
            if (!unit) return current;
            return {
                ...current,
                units: { ...current.units, [id]: { ...unit, ...patch } },
            };
        });
    }, []);

    const addUnit = useCallback(
        (id: UnitId, block: Record<string, unknown>) => {
            setDraft((current) => {
                if (!current || current.units[id]) return current;
                const unit = draftUnitFrom(id, block);
                return {
                    ...current,
                    units: { ...current.units, [id]: unit },
                    defaults: {
                        ...current.defaults,
                        units: [...current.defaults.units, id],
                    },
                };
            });
        },
        [],
    );

    const removeUnit = useCallback((id: UnitId) => {
        setDraft((current) => {
            if (!current) return current;
            const units = { ...current.units };
            delete units[id];
            return {
                ...current,
                units,
                defaults: {
                    ...current.defaults,
                    units: current.defaults.units.filter((unit) => unit !== id),
                },
            };
        });
    }, []);

    const copyLiveUnit = useCallback((id: UnitId, live: UnitSettings) => {
        setDraft((current) => {
            if (!current || !current.units[id]) return current;
            const source = liveUnitBlock(live);
            const unit = current.units[id]!;
            const next = draftUnitFrom(id, source);
            return {
                ...current,
                units: {
                    ...current.units,
                    [id]: { ...next, raw: unit.raw, ramps: unit.ramps },
                },
            };
        });
    }, []);

    const patchRamp = useCallback(
        (id: UnitId, field: RampField, patch: Partial<RampDraft>) => {
            setDraft((current) => {
                const unit = current?.units[id];
                const ramp = unit?.ramps[field];
                if (!current || !unit || !ramp) return current;
                return {
                    ...current,
                    units: {
                        ...current.units,
                        [id]: {
                            ...unit,
                            ramps: {
                                ...unit.ramps,
                                [field]: { ...ramp, ...patch },
                            },
                        },
                    },
                };
            });
        },
        [],
    );

    const addRamp = useCallback((id: UnitId, field: RampField) => {
        setDraft((current) => {
            const unit = current?.units[id];
            if (!current || !unit || unit.ramps[field]) return current;
            return {
                ...current,
                units: {
                    ...current.units,
                    [id]: {
                        ...unit,
                        ramps: { ...unit.ramps, [field]: newRamp() },
                    },
                },
            };
        });
    }, []);

    const removeRamp = useCallback((id: UnitId, field: RampField) => {
        setDraft((current) => {
            const unit = current?.units[id];
            if (!current || !unit) return current;
            const ramps = { ...unit.ramps };
            delete ramps[field];
            return {
                ...current,
                units: { ...current.units, [id]: { ...unit, ramps } },
            };
        });
    }, []);

    const copyLiveRamps = useCallback((id: UnitId, ramps: LiveRampLike[]) => {
        setDraft((current) => {
            const unit = current?.units[id];
            if (!current || !unit) return current;
            const next = { ...unit.ramps };
            for (const live of ramps) {
                if (live.unit !== id) continue;
                if (
                    !(RAMPABLE_FIELDS as readonly string[]).includes(live.field)
                ) {
                    continue;
                }
                const endAction = normalizeRampEndAction(live.end_action);
                next[live.field as RampField] = {
                    timer: live.timer,
                    step: live.step,
                    stepUnit:
                        live.step_unit === "absolute" ? "absolute" : "percent",
                    mode: live.mode,
                    dwell: live.dwell ?? 0,
                    release: live.release ?? 4,
                    duration: live.duration,
                    start: {
                        mode: "fixed",
                        value: live.start_value,
                        range: "",
                    },
                    max: { mode: "fixed", value: live.max_value, range: "" },
                    endAction,
                    endValue: normalizeRampEndValue(
                        live.end_value,
                        endAction,
                    ),
                    raw: {},
                };
            }
            return {
                ...current,
                units: { ...current.units, [id]: { ...unit, ramps: next } },
            };
        });
    }, []);

    const patchDefaults = useCallback((patch: Partial<DefaultsDraft>) => {
        setDraft((current) =>
            current
                ? { ...current, defaults: { ...current.defaults, ...patch } }
                : current,
        );
    }, []);

    const setName = useCallback((name: string) => {
        setDraft((current) => (current ? { ...current, name } : current));
    }, []);

    const setDescription = useCallback((description: string) => {
        setDraft((current) =>
            current ? { ...current, description } : current,
        );
    }, []);

    const reset = useCallback(() => {
        if (!detail) return;
        const parsed = parseProfileDraft(detail, liveRef.current);
        setDraft(parsed);
        setBaseline(JSON.stringify(parsed));
    }, [detail]);

    const isDirty = useMemo(
        () => draft !== null && JSON.stringify(draft) !== baseline,
        [draft, baseline],
    );

    const actions: ProfileEditorActions = useMemo(
        () => ({
            setName,
            setDescription,
            patchUnit,
            addUnit,
            removeUnit,
            copyLiveUnit,
            patchRamp,
            addRamp,
            removeRamp,
            copyLiveRamps,
            patchDefaults,
        }),
        [
            setName,
            setDescription,
            patchUnit,
            addUnit,
            removeUnit,
            copyLiveUnit,
            patchRamp,
            addRamp,
            removeRamp,
            copyLiveRamps,
            patchDefaults,
        ],
    );

    const includedUnits = useMemo(
        () => (draft ? UNIT_IDS.filter((id) => Boolean(draft.units[id])) : []),
        [draft],
    );

    const rampCount = useMemo(() => {
        if (!draft) return 0;
        return UNIT_IDS.reduce((total, id) => {
            const unit = draft.units[id];
            return total + (unit ? unitRampCount(unit) : 0);
        }, 0);
    }, [draft]);

    return { draft, actions, isDirty, reset, includedUnits, rampCount };
}
