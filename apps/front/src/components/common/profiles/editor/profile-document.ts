/**
 * Draft model of a profile being edited in the studio.
 *
 * The draft mirrors `threads_settings` but in a UI-friendly shape: every
 * value is concrete (missing fields are filled from live unit settings or
 * the hardware defaults), ramp start/max carry their target mode (live at
 * apply / fixed value / MagicNumber range), and unknown keys are preserved
 * so hand-edited profiles round-trip without losing data.
 */
import { MODE_2B } from "@/types/units.types";
import {
    RampMode,
    type ProfileDefaults,
    type ProfileDetail,
    type ProfileUpdatePayload,
} from "@/types";
import type { UnitSettings } from "@/types/units.types";

export const UNIT_IDS = ["UNIT1", "UNIT2", "UNIT3"] as const;
export type UnitId = (typeof UNIT_IDS)[number];

export const RAMPABLE_FIELDS = ["ch_A", "ch_B", "adj_1", "adj_2"] as const;
export type RampField = (typeof RAMPABLE_FIELDS)[number];

export const RAMP_FIELD_LABELS: Record<RampField, string> = {
    ch_A: "Channel A",
    ch_B: "Channel B",
    adj_1: "Adj 1",
    adj_2: "Adj 2",
};

/** `[25-35]` — a MagicNumber range resolved randomly at apply time. */
export const RAMP_RANGE_RE = /^\[\d{1,3}-\d{1,3}\]$/;
export const PROFILE_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;

export type RampTargetMode = "live" | "fixed" | "range";

export type RampTargetDraft = {
    /** live = value captured when the profile is applied */
    mode: RampTargetMode;
    /** Field level used by "fixed" (0-100). */
    value: number;
    /** `[low-high]` text used by "range". */
    range: string;
};

export type RampDraft = {
    timer: number;
    step: number;
    stepUnit: "percent" | "absolute";
    mode: RampMode;
    /** Seconds; -1 runs forever. */
    duration: number;
    start: RampTargetDraft;
    max: RampTargetDraft;
    /** Unknown ramp keys, preserved on save. */
    raw: Record<string, unknown>;
};

export type UnitDraft = {
    id: UnitId;
    /** Unknown unit-block keys, preserved on save. */
    raw: Record<string, unknown>;
    ch_A: number;
    ch_B: number;
    ch_A_use: string;
    ch_B_use: string;
    adj_1: number;
    adj_2: number;
    adj_3: number;
    adj_4: number;
    ch_link: boolean;
    level_d: boolean;
    level_h: boolean;
    level_map: number;
    power_bias: number;
    mode: number;
    ramps: Partial<Record<RampField, RampDraft>>;
};

export type DefaultsDraft = {
    /** Whether the profile stores apply defaults at all. */
    enabled: boolean;
    level_pct: number;
    duration: number;
    /** Empty = every unit included in the profile. */
    units: UnitId[];
};

export type ProfileDraft = {
    name: string;
    description: string;
    units: Partial<Record<UnitId, UnitDraft>>;
    defaults: DefaultsDraft;
    /** Non-blocking notes surfaced above the editor tabs. */
    warnings: string[];
};

// ── Option labels for the firmware-enumerated settings ──────────────────

export const POWER_BIAS_OPTIONS = [
    { value: 0, label: "Channel A" },
    { value: 1, label: "Channel B" },
    { value: 2, label: "Average" },
    { value: 3, label: "Max" },
];

export const LEVEL_MAP_OPTIONS = [
    { value: 0, label: "Map A" },
    { value: 1, label: "Map B" },
    { value: 2, label: "Map C" },
];

export const ADJ_3_OPTIONS = [
    { value: 0, label: "×1" },
    { value: 1, label: "×2" },
    { value: 2, label: "×3" },
    { value: 3, label: "×4" },
];

export const ADJ_4_OPTIONS = [
    { value: 0, label: "×1" },
    { value: 1, label: "×2" },
    { value: 2, label: "×4" },
    { value: 3, label: "×8" },
    { value: 4, label: "×16" },
    { value: 5, label: "×32" },
];

export const DURATION_PRESETS: Array<{ label: string; value: number }> = [
    { label: "∞", value: -1 },
    { label: "1m", value: 60 },
    { label: "5m", value: 300 },
    { label: "10m", value: 600 },
];

export function clampLevel(value: number): number {
    return Math.min(100, Math.max(0, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return Math.round(value);
}

/** First concrete value between the file, the live unit and the defaults. */
function resolveNumber(
    block: Record<string, unknown>,
    live: UnitSettings | undefined,
    fallbacks: Record<string, unknown> | undefined,
    field: string,
    fallback = 0,
): number {
    return (
        toNumber(block[field]) ??
        toNumber(live?.[field as keyof UnitSettings]) ??
        toNumber(fallbacks?.[field]) ??
        fallback
    );
}

function resolveString(
    block: Record<string, unknown>,
    live: UnitSettings | undefined,
    fallbacks: Record<string, unknown> | undefined,
    field: string,
    fallback: string,
): string {
    const raw = block[field];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    const liveValue = live?.[field as keyof UnitSettings];
    if (typeof liveValue === "string" && liveValue.trim())
        return liveValue.trim();
    const fallbackValue = fallbacks?.[field];
    if (typeof fallbackValue === "string" && fallbackValue.trim()) {
        return fallbackValue.trim();
    }
    return fallback;
}

function resolveBool(
    block: Record<string, unknown>,
    live: UnitSettings | undefined,
    fallbacks: Record<string, unknown> | undefined,
    field: string,
): boolean {
    const raw = block[field];
    if (typeof raw === "boolean") return raw;
    const liveValue = live?.[field as keyof UnitSettings];
    if (typeof liveValue === "boolean") return liveValue;
    const fallbackValue = fallbacks?.[field];
    if (typeof fallbackValue === "boolean") return fallbackValue;
    return false;
}

// ── Ramp parsing ────────────────────────────────────────────────────────

function parseRampTarget(raw: unknown): RampTargetDraft {
    const range = typeof raw === "string" ? raw.trim() : "";
    if (RAMP_RANGE_RE.test(range)) {
        return { mode: "range", value: 50, range };
    }
    const number = toNumber(raw);
    if (number !== null) {
        return { mode: "fixed", value: clampLevel(number), range: "" };
    }
    return { mode: "live", value: 50, range: "" };
}

/** Parse one ramp config; null (and a warning) when the executor would skip it. */
function parseRamp(cfg: unknown): RampDraft | null {
    if (!isRecord(cfg)) return null;

    const timer = typeof cfg.timer === "number" ? cfg.timer : NaN;
    const step = typeof cfg.step === "number" ? cfg.step : NaN;
    const stepUnit = cfg.step_unit === "absolute" ? "absolute" : "percent";
    const duration = typeof cfg.duration === "number" ? cfg.duration : -1;
    const rawMode = typeof cfg.mode === "string" ? cfg.mode : "reset";

    if (!Number.isFinite(timer) || timer <= 0) return null;
    if (
        !Number.isFinite(step) ||
        step <= 0 ||
        (stepUnit === "percent" && step > 100)
    ) {
        return null;
    }
    if (!Object.values(RampMode).includes(rawMode as RampMode)) return null;
    if (!Number.isFinite(duration) || (duration !== -1 && duration <= 0))
        return null;

    return {
        timer,
        step,
        stepUnit,
        mode: rawMode as RampMode,
        duration,
        start: parseRampTarget(cfg.start),
        max: parseRampTarget(cfg.max),
        raw: { ...cfg },
    };
}

function parseRamps(
    unitId: string,
    block: Record<string, unknown>,
    warnings: string[],
): Partial<Record<RampField, RampDraft>> {
    const ramps: Partial<Record<RampField, RampDraft>> = {};
    const rawRamps = block.ramps;
    if (rawRamps === undefined) return ramps;
    if (!isRecord(rawRamps)) {
        warnings.push(`${unitId}.ramps is not an object — it will be removed`);
        return ramps;
    }

    for (const [field, cfg] of Object.entries(rawRamps)) {
        if (!(RAMPABLE_FIELDS as readonly string[]).includes(field)) {
            warnings.push(
                `${unitId}.ramps.${field} cannot be ramped — it will be removed`,
            );
            continue;
        }
        const ramp = parseRamp(cfg);
        if (ramp === null) {
            warnings.push(
                `${unitId}.ramps.${field} has invalid settings — it will be removed`,
            );
            continue;
        }
        ramps[field as RampField] = ramp;
    }
    return ramps;
}

// ── Draft construction ──────────────────────────────────────────────────

/**
 * Build the editable draft from a `profiles:detail` reply.
 *
 * Known fields missing from the file are filled from the live unit settings
 * (when the unit is known) or from the hardware defaults, and reported in
 * `warnings` — they are written explicitly when the profile is saved.
 */
export function parseProfileDraft(
    detail: ProfileDetail,
    liveUnits: Partial<Record<string, UnitSettings>>,
): ProfileDraft {
    const warnings: string[] = [];
    const units: Partial<Record<UnitId, UnitDraft>> = {};
    const defaultsBlocks = detail.unit_defaults ?? {};

    for (const [unitName, rawBlock] of Object.entries(
        detail.threads_settings,
    )) {
        if (!(UNIT_IDS as readonly string[]).includes(unitName)) {
            warnings.push(`${unitName} is not a known unit — it will be removed`);
            continue;
        }
        const id = unitName as UnitId;
        const live = liveUnits[id];
        const fallbacks = defaultsBlocks[id];
        const missing: string[] = [];

        const known: Array<[string, unknown]> = [
            ["ch_A", rawBlock.ch_A],
            ["ch_B", rawBlock.ch_B],
            ["ch_A_use", rawBlock.ch_A_use],
            ["ch_B_use", rawBlock.ch_B_use],
            ["adj_1", rawBlock.adj_1],
            ["adj_2", rawBlock.adj_2],
            ["adj_3", rawBlock.adj_3],
            ["adj_4", rawBlock.adj_4],
            ["ch_link", rawBlock.ch_link],
            ["level_d", rawBlock.level_d],
            ["level_h", rawBlock.level_h],
            ["level_map", rawBlock.level_map],
            ["power_bias", rawBlock.power_bias],
            ["mode", rawBlock.mode],
        ];
        for (const [field, value] of known) {
            if (value === undefined) missing.push(field);
        }
        if (missing.length > 0) {
            warnings.push(
                `${id}: ${missing.length} missing field${missing.length === 1 ? "" : "s"} filled from ${live ? "live settings" : "hardware defaults"} (${missing.join(", ")})`,
            );
        }

        const raw = { ...rawBlock };
        delete raw.ramps;

        units[id] = {
            id,
            raw,
            ch_A: clampLevel(resolveNumber(rawBlock, live, fallbacks, "ch_A")),
            ch_B: clampLevel(resolveNumber(rawBlock, live, fallbacks, "ch_B")),
            ch_A_use: resolveString(
                rawBlock,
                live,
                fallbacks,
                "ch_A_use",
                "default",
            ),
            ch_B_use: resolveString(
                rawBlock,
                live,
                fallbacks,
                "ch_B_use",
                "default",
            ),
            adj_1: clampLevel(
                resolveNumber(rawBlock, live, fallbacks, "adj_1", 50),
            ),
            adj_2: clampLevel(
                resolveNumber(rawBlock, live, fallbacks, "adj_2", 50),
            ),
            adj_3: resolveNumber(rawBlock, live, fallbacks, "adj_3"),
            adj_4: resolveNumber(rawBlock, live, fallbacks, "adj_4"),
            ch_link: resolveBool(rawBlock, live, fallbacks, "ch_link"),
            level_d: resolveBool(rawBlock, live, fallbacks, "level_d"),
            level_h: resolveBool(rawBlock, live, fallbacks, "level_h"),
            level_map: resolveNumber(rawBlock, live, fallbacks, "level_map"),
            power_bias: resolveNumber(rawBlock, live, fallbacks, "power_bias"),
            mode: resolveNumber(rawBlock, live, fallbacks, "mode", 1),
            ramps: parseRamps(id, rawBlock, warnings),
        };
    }

    const included = Object.keys(units) as UnitId[];
    const storedDefaults = detail.defaults ?? null;
    const defaultsUnits = (storedDefaults?.units ?? []).filter(
        (unit): unit is UnitId =>
            (UNIT_IDS as readonly string[]).includes(unit) && unit in units,
    );

    return {
        name: detail.name,
        description: detail.description ?? "",
        units,
        defaults: {
            enabled: storedDefaults !== null,
            level_pct: storedDefaults?.level_pct ?? 100,
            duration: storedDefaults?.duration ?? -1,
            units: defaultsUnits.length > 0 ? defaultsUnits : included,
        },
        warnings,
    };
}

/** Unit block for a unit the profile does not contain yet. */
export function draftUnitFrom(
    id: UnitId,
    source: Record<string, unknown>,
): UnitDraft {
    return {
        id,
        raw: {},
        ch_A: clampLevel(toNumber(source.ch_A) ?? 0),
        ch_B: clampLevel(toNumber(source.ch_B) ?? 0),
        ch_A_use:
            typeof source.ch_A_use === "string" && source.ch_A_use.trim()
                ? source.ch_A_use.trim()
                : "default",
        ch_B_use:
            typeof source.ch_B_use === "string" && source.ch_B_use.trim()
                ? source.ch_B_use.trim()
                : "default",
        adj_1: clampLevel(toNumber(source.adj_1) ?? 50),
        adj_2: clampLevel(toNumber(source.adj_2) ?? 50),
        adj_3: toNumber(source.adj_3) ?? 0,
        adj_4: toNumber(source.adj_4) ?? 0,
        ch_link: source.ch_link === true,
        level_d: source.level_d === true,
        level_h: source.level_h === true,
        level_map: toNumber(source.level_map) ?? 0,
        power_bias: toNumber(source.power_bias) ?? 0,
        mode: toNumber(source.mode) ?? 1,
        ramps: {},
    };
}

/** Live unit settings as an "add unit" source block. */
export function liveUnitBlock(unit: UnitSettings): Record<string, unknown> {
    return {
        ch_A: unit.ch_A,
        ch_B: unit.ch_B,
        ch_A_use: unit.ch_A_use,
        ch_B_use: unit.ch_B_use,
        adj_1: unit.adj_1,
        adj_2: unit.adj_2,
        adj_3: unit.adj_3,
        adj_4: unit.adj_4,
        ch_link: unit.ch_link,
        level_d: unit.level_d,
        level_h: unit.level_h,
        level_map: unit.level_map,
        power_bias: unit.power_bias,
        mode: unit.mode,
    };
}

// ── Serialization / validation ──────────────────────────────────────────

function serializeRampTarget(
    target: RampTargetDraft,
): number | string | undefined {
    if (target.mode === "fixed") return clampLevel(target.value);
    if (target.mode === "range") return target.range.trim();
    return undefined;
}

export function rampTargetIsValid(target: RampTargetDraft): boolean {
    if (target.mode === "live") return true;
    if (target.mode === "fixed") {
        return (
            Number.isFinite(target.value) &&
            target.value >= 0 &&
            target.value <= 100
        );
    }
    const match = RAMP_RANGE_RE.exec(target.range.trim());
    if (!match) return false;
    const [, low, high] = match;
    return Number(low) <= 100 && Number(high) <= 100;
}

function serializeRamp(ramp: RampDraft): Record<string, unknown> {
    const block: Record<string, unknown> = {
        ...ramp.raw,
        timer: ramp.timer,
        step: ramp.step,
        step_unit: ramp.stepUnit,
        mode: ramp.mode,
        duration: ramp.duration,
    };
    const start = serializeRampTarget(ramp.start);
    const max = serializeRampTarget(ramp.max);
    if (start === undefined) delete block.start;
    else block.start = start;
    if (max === undefined) delete block.max;
    else block.max = max;
    return block;
}

function serializeUnit(unit: UnitDraft): Record<string, unknown> {
    const block: Record<string, unknown> = {
        ...unit.raw,
        ch_A: clampLevel(unit.ch_A),
        ch_B: clampLevel(unit.ch_B),
        ch_A_use: unit.ch_A_use,
        ch_B_use: unit.ch_B_use,
        adj_1: clampLevel(unit.adj_1),
        adj_2: clampLevel(unit.adj_2),
        adj_3: unit.adj_3,
        adj_4: unit.adj_4,
        ch_link: unit.ch_link,
        level_d: unit.level_d,
        level_h: unit.level_h,
        level_map: unit.level_map,
        power_bias: unit.power_bias,
        mode: unit.mode,
    };

    const ramps: Record<string, unknown> = {};
    for (const field of RAMPABLE_FIELDS) {
        const ramp = unit.ramps[field];
        if (ramp) ramps[field] = serializeRamp(ramp);
    }
    if (Object.keys(ramps).length > 0) block.ramps = ramps;
    else delete block.ramps;

    return block;
}

export function serializeThreadsSettings(
    draft: ProfileDraft,
): Record<string, Record<string, unknown>> {
    const settings: Record<string, Record<string, unknown>> = {};
    for (const id of UNIT_IDS) {
        const unit = draft.units[id];
        if (unit) settings[id] = serializeUnit(unit);
    }
    return settings;
}

export function serializeDefaults(draft: ProfileDraft): ProfileDefaults | null {
    if (!draft.defaults.enabled) return null;
    const included = Object.keys(draft.units);
    const units = draft.defaults.units.filter((unit) =>
        included.includes(unit),
    );
    return {
        level_pct: draft.defaults.level_pct,
        duration: draft.defaults.duration,
        units: units.length === included.length ? [] : units,
    };
}

/** First blocking problem in the draft, or null when it can be saved. */
export function validateDraft(draft: ProfileDraft): string | null {
    const name = draft.name.trim();
    if (!PROFILE_NAME_RE.test(name)) {
        return "Name must be 1-32 characters: letters, digits, '-' or '_'";
    }
    if (draft.description.length > 200) {
        return "Description must be at most 200 characters";
    }

    const unitIds = Object.keys(draft.units);
    if (unitIds.length === 0) {
        return "The profile must include at least one unit";
    }

    for (const id of UNIT_IDS) {
        const unit = draft.units[id];
        if (!unit) continue;

        if (!unit.ch_A_use || !unit.ch_B_use) {
            return `${id} needs a usage on both channels`;
        }
        if (unit.mode < 0 || unit.mode >= MODE_2B.length) {
            return `${id}: unknown mode`;
        }
        if (unit.adj_3 < 0 || unit.adj_3 > 3) {
            return `${id}: ramp speed must be between ×1 and ×4`;
        }
        if (unit.adj_4 < 0 || unit.adj_4 > 5) {
            return `${id}: warp factor must be between ×1 and ×32`;
        }

        for (const field of RAMPABLE_FIELDS) {
            const ramp = unit.ramps[field];
            if (!ramp) continue;
            const path = `${id}.${field}`;
            if (!Number.isFinite(ramp.timer) || ramp.timer <= 0) {
                return `${path}: timer must be greater than 0`;
            }
            if (!Number.isFinite(ramp.step) || ramp.step <= 0) {
                return `${path}: step must be greater than 0`;
            }
            if (ramp.stepUnit === "percent" && ramp.step > 100) {
                return `${path}: step cannot exceed 100% of the max`;
            }
            if (
                ramp.duration !== -1 &&
                (!Number.isFinite(ramp.duration) || ramp.duration <= 0)
            ) {
                return `${path}: duration must be -1 (∞) or greater than 0`;
            }
            if (!rampTargetIsValid(ramp.start)) {
                return `${path}: start must be a value 0-100 or a range like [25-35]`;
            }
            if (!rampTargetIsValid(ramp.max)) {
                return `${path}: max must be a value 0-100 or a range like [25-35]`;
            }
        }
    }

    if (draft.defaults.enabled) {
        if (
            !Number.isFinite(draft.defaults.level_pct) ||
            draft.defaults.level_pct < 0 ||
            draft.defaults.level_pct > 150
        ) {
            return "Apply defaults: intensity must be between 0 and 150%";
        }
        if (
            draft.defaults.duration !== -1 &&
            (!Number.isFinite(draft.defaults.duration) ||
                draft.defaults.duration <= 0)
        ) {
            return "Apply defaults: duration must be -1 (∞) or greater than 0";
        }
    }

    return null;
}

/** Payload fields shared by "Save changes" and "Save & apply". */
export function buildUpdatePayload(
    draft: ProfileDraft,
    originalName: string,
): Pick<
    ProfileUpdatePayload,
    | "description"
    | "rename_to"
    | "threads_settings"
    | "defaults"
    | "replace_defaults"
> {
    const name = draft.name.trim();
    return {
        description: draft.description.trim(),
        rename_to: name !== originalName ? name : null,
        threads_settings: serializeThreadsSettings(draft),
        defaults: serializeDefaults(draft),
        replace_defaults: true,
    };
}

/** Human label of a unit's power mode. */
export function powerModeOf(unit: UnitDraft): "L" | "H" | "D" {
    if (unit.level_d) return "D";
    if (unit.level_h) return "H";
    return "L";
}

/** Ramp count of a unit. */
export function unitRampCount(unit: UnitDraft): number {
    return RAMPABLE_FIELDS.filter((field) => unit.ramps[field]).length;
}
