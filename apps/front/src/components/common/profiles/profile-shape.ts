/**
 * Program-preview helpers for saved profiles.
 *
 * The sparklines and the time axis are derived from the profile's real ramps
 * (`ProfileSummary.ramps`, resolved by `services/profiles.py` with the same
 * semantics the action executor uses) and mirror `hardware/ramp.py`: a ramp
 * climbs from `start` to 100% of `max` in `step`-percent increments every
 * `timer` seconds, then loops according to its mode.
 */
import { RampMode } from "@/types";
import type { ProfileRampPreview, ProfileSummary } from "@/types";
import { resolveRampEndLevel } from "@/lib/ramp-end";

/** Samples drawn per lane by the inspector chart. */
export const CHART_SAMPLES = 24;
/** Samples per stim channel used by the table sparkline. */
export const SPARKLINE_SAMPLES = 24;

/** Lanes of the program shape: A/B are the stim channels, C the adjusters. */
const SHAPE_LANES = [
    { label: "A", fields: ["ch_A"] },
    { label: "B", fields: ["ch_B"] },
    { label: "C", fields: ["adj_1", "adj_2"] },
] as const;

export type ProfileLane = {
    label: string;
    /** Sample levels in % of the track (empty when nothing drives the lane). */
    samples: number[];
};

export type ProfilePreview = {
    /** Program window in seconds — 0 when there is nothing to plot. */
    durationSeconds: number;
    lanes: ProfileLane[];
};

/** Table sparkline data. A/B are stim channels; adjusters are intentionally absent. */
export type ProfileSparkline = {
    /** Channel A samples (0-100), empty when no A ramp drives the profile. */
    a: number[];
    /** Channel B samples (0-100), empty when no B ramp drives the profile. */
    b: number[];
    /** Highest stim channel per sample — the neutral trace shown when unselected. */
    envelope: number[];
    /** Stim-channel window in seconds, used for the row tooltip. */
    durationSeconds: number;
};

type RampCurve = {
    /** One full loop of the ramp in seconds (0 when it is already static). */
    periodSeconds: number;
    /** Absolute field level (0-100) at `seconds` into the loop. */
    levelAt: (seconds: number) => number;
};

type CurveEntry = {
    ramp: ProfileRampPreview;
    curve: RampCurve;
};

/** Resolved ramp used to draw a curve (editor + saved-profile previews). */
export type RampCurveInput = {
    mode: RampMode;
    /** Seconds between two steps. */
    timer: number;
    /** Increment per step (percent of max by default). */
    step: number;
    /** "percent" (default) or "absolute" field levels per step. */
    stepUnit?: string;
    /** DWELL: seconds held at 100% and back at start. */
    dwell?: number;
    /** SURGE: descent speed multiplier (default 4). */
    release?: number;
    /** Absolute field level (0-100) treated as 100% — the ramp target. */
    max: number;
    /** Absolute field level (0-100) the cycle rests at — the ramp start. */
    start: number;
};

function clampLevel(value: number): number {
    return Math.min(100, Math.max(0, Math.round(value)));
}

function positiveModulo(value: number, modulus: number): number {
    if (modulus <= 0) return 0;
    return ((value % modulus) + modulus) % modulus;
}

/** Small deterministic PRNG, so a DRIFT preview is stable across renders. */
function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function curveSeed(...values: number[]): number {
    let seed = 0x9e3779b9;
    for (const value of values) {
        seed = (seed ^ Math.round(value * 1000)) >>> 0;
        seed = Math.imul(seed, 0x85ebca6b) >>> 0;
        seed = (seed ^ (seed >>> 13)) >>> 0;
    }
    return seed;
}

/**
 * Cycle of one ramp: climb from `start` to 100% of `max`, then loop by mode —
 * WAVE goes back down, RESET dwells one step at the top, ASCEND holds there,
 * SQUARE toggles between the ends, DRIFT wanders randomly, SURGE drops faster
 * than it climbs and DWELL pauses at both ends.
 */
export function buildRampCurve(input: RampCurveInput): RampCurve {
    const maxLevel = clampLevel(input.max);
    const startLevel = clampLevel(input.start);
    const startPct = maxLevel > 0 ? (startLevel * 100) / maxLevel : 0;
    const timer = input.timer > 0 ? input.timer : 1;

    // `step` is a share of the max: absolute steps are converted like the
    // backend does (`step * 100 / max`), mirroring `_preview_ramps`.
    const step = input.step > 0 ? input.step : 0;
    const stepPct =
        input.stepUnit === "absolute" && maxLevel > 0
            ? (step * 100) / maxLevel
            : step;

    const climbPct = Math.max(0, 100 - startPct);
    const climbSeconds =
        stepPct > 0 && climbPct > 0 ? (climbPct / stepPct) * timer : 0;

    if (climbSeconds <= 0) {
        // Already at (or above) the max — a static level, nothing to shape.
        return { periodSeconds: 0, levelAt: () => maxLevel };
    }

    const level = (progressPct: number) =>
        clampLevel((maxLevel * progressPct) / 100);

    const release =
        input.release !== undefined && input.release > 0 ? input.release : 4;
    const dwell = input.dwell ?? 0;
    // Extra hold steps after the step that reaches an end (see hardware/ramp.py).
    const dwellSeconds =
        input.mode === RampMode.DWELL
            ? Math.max(0, Math.ceil(dwell / timer) - 1) * timer
            : 0;

    if (input.mode === RampMode.SQUARE) {
        // On/off: start for one step, max for one step.
        const periodSeconds = timer * 2;
        return {
            periodSeconds,
            levelAt: (seconds) => {
                const phase = positiveModulo(seconds, periodSeconds);
                return phase < timer ? level(startPct) : maxLevel;
            },
        };
    }

    if (input.mode === RampMode.DRIFT) {
        // One deterministic random walk per settings combo, one sample per
        // step, so the preview mirrors the backend's bounded walk.
        const samples = 32;
        const span = 100 - startPct;
        const random = mulberry32(curveSeed(startPct, stepPct, timer));
        const levels: number[] = [];
        let offset = startPct;
        for (let index = 0; index < samples; index += 1) {
            if (index > 0) {
                offset += (random() * 2 - 1) * stepPct;
                let relative = offset - startPct;
                relative = Math.abs(relative) % (2 * span);
                if (relative > span) relative = 2 * span - relative;
                offset = startPct + relative;
            }
            levels.push(level(offset));
        }
        // Close the loop on the starting level so the preview repeats cleanly.
        levels[samples - 1] = levels[0] ?? level(startPct);
        const periodSeconds = samples * timer;
        return {
            periodSeconds,
            levelAt: (seconds) => {
                const phase = positiveModulo(seconds, periodSeconds);
                const index = Math.min(samples - 1, Math.floor(phase / timer));
                return levels[index] ?? level(startPct);
            },
        };
    }

    if (input.mode === RampMode.SURGE) {
        // Asymmetric wave: the descent is `release` times faster.
        const descentSeconds = climbSeconds / release;
        const periodSeconds = climbSeconds + descentSeconds;
        return {
            periodSeconds,
            levelAt: (seconds) => {
                const phase = positiveModulo(seconds, periodSeconds);
                if (phase <= climbSeconds) {
                    return level(startPct + (climbPct * phase) / climbSeconds);
                }
                const descentPhase = phase - climbSeconds;
                return level(100 - (climbPct * descentPhase) / descentSeconds);
            },
        };
    }

    if (input.mode === RampMode.DWELL) {
        // Triangle with a hold at 100% and back at the start level.
        const periodSeconds = climbSeconds * 2 + dwellSeconds * 2;
        return {
            periodSeconds,
            levelAt: (seconds) => {
                const phase = positiveModulo(seconds, periodSeconds);
                if (phase <= climbSeconds) {
                    return level(startPct + (climbPct * phase) / climbSeconds);
                }
                if (phase <= climbSeconds + dwellSeconds) {
                    return maxLevel;
                }
                if (phase <= climbSeconds * 2 + dwellSeconds) {
                    const descentPhase = phase - climbSeconds - dwellSeconds;
                    return level(100 - (climbPct * descentPhase) / climbSeconds);
                }
                return level(startPct);
            },
        };
    }

    if (input.mode === RampMode.WAVE) {
        const periodSeconds = climbSeconds * 2;
        return {
            periodSeconds,
            levelAt: (seconds) => {
                const phase = positiveModulo(seconds, periodSeconds);
                const progressPct =
                    phase <= climbSeconds
                        ? startPct + (climbPct * phase) / climbSeconds
                        : 100 -
                          (climbPct * (phase - climbSeconds)) / climbSeconds;
                return level(progressPct);
            },
        };
    }

    if (input.mode === RampMode.ASCEND) {
        return {
            periodSeconds: climbSeconds,
            levelAt: (seconds) =>
                seconds >= climbSeconds
                    ? maxLevel
                    : level(startPct + (climbPct * seconds) / climbSeconds),
        };
    }

    // RESET — sawtooth with one dwell step at the top.
    const periodSeconds = climbSeconds + timer;
    return {
        periodSeconds,
        levelAt: (seconds) => {
            const phase = positiveModulo(seconds, periodSeconds);
            return phase <= climbSeconds
                ? level(startPct + (climbPct * phase) / climbSeconds)
                : maxLevel;
        },
    };
}

/** Curve of a resolved profile ramp (`ProfileRampPreview.step` is percent). */
function buildCurve(ramp: ProfileRampPreview): RampCurve {
    return buildRampCurve({
        mode: ramp.mode,
        timer: ramp.timer,
        step: ramp.step,
        stepUnit: "percent",
        dwell: ramp.dwell,
        release: ramp.release,
        max: ramp.max,
        start: ramp.start,
    });
}

/**
 * Visible span of the program: the longest finite ramp duration, or one loop
 * for permanent ramps (`duration = -1`).
 */
function sampleWindow(entries: CurveEntry[]): number {
    let window = 0;
    for (const entry of entries) {
        const span =
            entry.ramp.duration > 0
                ? entry.ramp.duration
                : entry.curve.periodSeconds;
        window = Math.max(window, span);
    }
    return window;
}

/** Level of one ramp at `at`, including its configured post-duration end. */
function curveLevelAt(entry: CurveEntry, at: number): number {
    const { ramp, curve } = entry;
    if (ramp.duration > 0 && at >= ramp.duration) {
        return resolveRampEndLevel({
            action: ramp.end_action,
            endValue: ramp.end_value,
            startLevel: ramp.start,
            maxLevel: ramp.max,
            currentLevel: curve.levelAt(ramp.duration),
        });
    }
    return curve.levelAt(at);
}

/** Intensity envelope (max over the curves) sampled evenly across the window. */
function sampleCurves(
    entries: CurveEntry[],
    windowSeconds: number,
    samples: number,
): number[] {
    if (entries.length === 0) return [];
    // A static ramp (period 0) still has a level to show: sample it flat.
    const span = windowSeconds > 0 ? windowSeconds : 1;
    return Array.from({ length: samples }, (_, index) => {
        const at = (span * index) / Math.max(samples - 1, 1);
        return entries.reduce(
            (top, entry) => Math.max(top, curveLevelAt(entry, at)),
            0,
        );
    });
}

/** Builds the inspector preview: sample levels per lane + the program window. */
export function buildProfilePreview(
    profile: ProfileSummary,
    samples = CHART_SAMPLES,
): ProfilePreview {
    const entries: CurveEntry[] = (profile.ramps ?? []).map((ramp) => ({
        ramp,
        curve: buildCurve(ramp),
    }));
    const entriesByField = new Map<string, CurveEntry[]>();

    for (const entry of entries) {
        const fieldEntries = entriesByField.get(entry.ramp.field);
        if (fieldEntries) fieldEntries.push(entry);
        else entriesByField.set(entry.ramp.field, [entry]);
    }

    const durationSeconds = sampleWindow(entries);
    const lanes = SHAPE_LANES.map((lane) => ({
        label: lane.label,
        samples: sampleCurves(
            lane.fields.flatMap((field) => entriesByField.get(field) ?? []),
            durationSeconds,
            samples,
        ),
    }));

    return { durationSeconds, lanes };
}

/**
 * Table sparkline for the two stim channels only.
 *
 * Adjuster ramps (`adj_1`, `adj_2`) are deliberately excluded: they change the
 * feel of a profile but do not describe the intensity envelope of A/B, and a
 * third line in an 88 px cell would be noise. The window is also based on the
 * A/B ramps so an adjuster ramp cannot flatten the visible shape.
 */
export function buildSparkline(
    profile: ProfileSummary,
    samples = SPARKLINE_SAMPLES,
): ProfileSparkline {
    const entries: CurveEntry[] = (profile.ramps ?? [])
        .filter((ramp) => ramp.field === "ch_A" || ramp.field === "ch_B")
        .map((ramp) => ({ ramp, curve: buildCurve(ramp) }));
    const entriesByField = new Map<string, CurveEntry[]>();

    for (const entry of entries) {
        const fieldEntries = entriesByField.get(entry.ramp.field);
        if (fieldEntries) fieldEntries.push(entry);
        else entriesByField.set(entry.ramp.field, [entry]);
    }

    const durationSeconds = sampleWindow(entries);
    const a = sampleCurves(
        entriesByField.get("ch_A") ?? [],
        durationSeconds,
        samples,
    );
    const b = sampleCurves(
        entriesByField.get("ch_B") ?? [],
        durationSeconds,
        samples,
    );
    const envelope =
        a.length === 0
            ? b
            : b.length === 0
              ? a
              : a.map((value, index) => Math.max(value, b[index] ?? 0));

    return { a, b, envelope, durationSeconds };
}

/** Padding (in viewBox units) kept above and below a sparkline trace. */
const SHAPE_PADDING = 2.5;

function roundPath(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * Smooth SVG path through the sampled levels. Control-point Y values are
 * clamped inside the plot so a fast edge cannot overshoot the 24 px cell.
 */
export function shapeLinePath(
    points: number[],
    width = 88,
    height = 24,
    padding = SHAPE_PADDING,
): string {
    if (points.length === 0) return "";

    const top = padding;
    const bottom = height - padding;
    const yFor = (value: number) => {
        const level = clampLevel(value);
        return roundPath(bottom - ((bottom - top) * level) / 100);
    };

    if (points.length === 1) {
        const only = points[0];
        if (only === undefined) return "";
        const y = yFor(only);
        return `M0 ${y} L${width} ${y}`;
    }

    const step = width / (points.length - 1);
    const coords = points.map((value, index) => ({
        x: roundPath(index * step),
        y: yFor(value),
    }));
    const firstCoord = coords[0];
    if (!firstCoord) return "";

    let path = `M${firstCoord.x} ${firstCoord.y}`;
    for (let index = 0; index < coords.length - 1; index += 1) {
        const start = coords[index];
        const end = coords[index + 1];
        if (!start || !end) break;
        const previous = coords[index - 1] ?? start;
        const next = coords[index + 2] ?? end;

        const control1Y = Math.min(
            bottom,
            Math.max(top, start.y + (end.y - previous.y) / 6),
        );
        const control2Y = Math.min(
            bottom,
            Math.max(top, end.y - (next.y - start.y) / 6),
        );

        path += ` C${roundPath(start.x + (end.x - previous.x) / 6)} ${roundPath(
            control1Y,
        )} ${roundPath(end.x - (next.x - start.x) / 6)} ${roundPath(
            control2Y,
        )} ${end.x} ${end.y}`;
    }

    return path;
}

/** Closed path that fills the area below a sparkline trace, down to the plot baseline. */
export function shapeAreaPath(
    points: number[],
    width = 88,
    height = 24,
    padding = SHAPE_PADDING,
): string {
    const line = shapeLinePath(points, width, height, padding);
    const baseline = height - padding;
    return line ? `${line} L${width} ${baseline} L0 ${baseline} Z` : "";
}

/** Y coordinate of the last sample, used for the end dot. */
export function shapeEndY(
    points: number[],
    height = 24,
    padding = SHAPE_PADDING,
): number {
    const last = clampLevel(points[points.length - 1] ?? 0);
    return roundPath(height - padding - ((height - padding * 2) * last) / 100);
}

/** `m:ss` clock label (rounded to the nearest second), e.g. 1080 → "18:00". */
export function formatClock(totalSeconds: number): string {
    const rounded = Math.round(totalSeconds);
    const minutes = Math.floor(rounded / 60);
    const seconds = rounded % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const TAG_STOPWORDS = new Set([
    "all",
    "and",
    "are",
    "but",
    "for",
    "from",
    "have",
    "has",
    "into",
    "its",
    "long",
    "no",
    "not",
    "of",
    "on",
    "only",
    "that",
    "the",
    "they",
    "this",
    "very",
    "was",
    "were",
    "with",
    "without",
    "you",
    "your",
]);

/** Up to `limit` distinct tag words derived from the profile description. */
export function descriptionTags(
    description: string | null | undefined,
    limit = 3,
): string[] {
    if (!description) return [];
    const words = description.toLowerCase().match(/[a-z]+/g) ?? [];
    const tags: string[] = [];
    for (const word of words) {
        if (tags.length >= limit) break;
        if (word.length < 4 || TAG_STOPWORDS.has(word) || tags.includes(word)) {
            continue;
        }
        tags.push(word);
    }
    return tags;
}
