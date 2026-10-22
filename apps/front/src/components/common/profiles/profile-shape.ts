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

/** Resolved ramp used to draw a curve (editor + saved-profile previews). */
export type RampCurveInput = {
    mode: RampMode;
    /** Seconds between two steps. */
    timer: number;
    /** Increment per step (percent of max by default). */
    step: number;
    /** "percent" (default) or "absolute" field levels per step. */
    stepUnit?: string;
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

/**
 * Cycle of one ramp: climb from `start` to 100% of `max`, then loop by mode —
 * WAVE goes back down, RESET dwells one step at the top, ASCEND holds there.
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
        max: ramp.max,
        start: ramp.start,
    });
}

/**
 * Visible span of the program: the longest finite ramp duration, or one loop
 * for permanent ramps (`duration = -1`).
 */
function sampleWindow(
    ramps: ProfileRampPreview[],
    curves: RampCurve[],
): number {
    let window = 0;
    for (let index = 0; index < ramps.length; index += 1) {
        const ramp = ramps[index];
        const curve = curves[index];
        if (!ramp || !curve) continue;
        const span = ramp.duration > 0 ? ramp.duration : curve.periodSeconds;
        window = Math.max(window, span);
    }
    return window;
}

/** Intensity envelope (max over the curves) sampled evenly across the window. */
function sampleCurves(
    curves: RampCurve[],
    windowSeconds: number,
    samples: number,
): number[] {
    if (curves.length === 0) return [];
    // A static ramp (period 0) still has a level to show: sample it flat.
    const span = windowSeconds > 0 ? windowSeconds : 1;
    return Array.from({ length: samples }, (_, index) => {
        const at = (span * index) / Math.max(samples - 1, 1);
        return curves.reduce(
            (top, curve) => Math.max(top, curve.levelAt(at)),
            0,
        );
    });
}

/** Builds the inspector preview: sample levels per lane + the program window. */
export function buildProfilePreview(
    profile: ProfileSummary,
    samples = CHART_SAMPLES,
): ProfilePreview {
    const ramps = profile.ramps ?? [];
    const curves: RampCurve[] = [];
    const curvesByField = new Map<string, RampCurve[]>();

    for (const ramp of ramps) {
        const curve = buildCurve(ramp);
        curves.push(curve);
        const laneCurves = curvesByField.get(ramp.field);
        if (laneCurves) laneCurves.push(curve);
        else curvesByField.set(ramp.field, [curve]);
    }

    const durationSeconds = sampleWindow(ramps, curves);
    const lanes = SHAPE_LANES.map((lane) => ({
        label: lane.label,
        samples: sampleCurves(
            lane.fields.flatMap((field) => curvesByField.get(field) ?? []),
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
    const ramps = (profile.ramps ?? []).filter(
        (ramp) => ramp.field === "ch_A" || ramp.field === "ch_B",
    );
    const curves: RampCurve[] = [];
    const curvesByField = new Map<string, RampCurve[]>();

    for (const ramp of ramps) {
        const curve = buildCurve(ramp);
        curves.push(curve);
        const fieldCurves = curvesByField.get(ramp.field);
        if (fieldCurves) fieldCurves.push(curve);
        else curvesByField.set(ramp.field, [curve]);
    }

    const durationSeconds = sampleWindow(ramps, curves);
    const a = sampleCurves(
        curvesByField.get("ch_A") ?? [],
        durationSeconds,
        samples,
    );
    const b = sampleCurves(
        curvesByField.get("ch_B") ?? [],
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
