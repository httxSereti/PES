/**
 * Program-preview helpers for saved profiles.
 *
 * The bars and the time axis are derived from the profile's real ramps
 * (`ProfileSummary.ramps`, resolved by `services/profiles.py` with the same
 * semantics the action executor uses) and mirror `hardware/ramp.py`: a ramp
 * climbs from `start` to 100% of `max` in `step`-percent increments every
 * `timer` seconds, then loops according to its mode.
 */
import { RampMode } from "@/types";
import type { ProfileRampPreview, ProfileSummary } from "@/types";

/** Samples drawn per lane by the inspector chart / by the list sparkline. */
export const CHART_SAMPLES = 12;
export const SPARKLINE_SAMPLES = 10;

/** Flat marker bar shown when there is no shape to draw (no ramps at all). */
const NO_RAMPS_BAR = 33;

/** Lanes of the program shape: A/B are the stim channels, C the adjusters. */
const SHAPE_LANES = [
    { label: "A", fields: ["ch_A"] },
    { label: "B", fields: ["ch_B"] },
    { label: "C", fields: ["adj_1", "adj_2"] },
] as const;

export type ProfileLane = {
    label: string;
    /** Bar heights in % of the track (empty when nothing drives the lane). */
    bars: number[];
};

export type ProfilePreview = {
    /** Program window in seconds — 0 when there is nothing to plot. */
    durationSeconds: number;
    lanes: ProfileLane[];
};

type RampCurve = {
    /** One full loop of the ramp in seconds (0 when it is already static). */
    periodSeconds: number;
    /** Absolute field level (0-100) at `seconds` into the loop. */
    levelAt: (seconds: number) => number;
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
function buildCurve(ramp: ProfileRampPreview): RampCurve {
    const maxLevel = clampLevel(ramp.max);
    const startLevel = clampLevel(ramp.start);
    const startPct = maxLevel > 0 ? (startLevel * 100) / maxLevel : 0;
    const timer = ramp.timer > 0 ? ramp.timer : 1;

    const climbPct = Math.max(0, 100 - startPct);
    const climbSeconds =
        ramp.step > 0 && climbPct > 0 ? (climbPct / ramp.step) * timer : 0;

    if (climbSeconds <= 0) {
        // Already at (or above) the max — a static level, nothing to shape.
        return { periodSeconds: 0, levelAt: () => maxLevel };
    }

    const level = (progressPct: number) =>
        clampLevel((maxLevel * progressPct) / 100);

    if (ramp.mode === RampMode.WAVE) {
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

    if (ramp.mode === RampMode.ASCEND) {
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
    if (windowSeconds <= 0 || curves.length === 0) return [];
    return Array.from({ length: samples }, (_, index) => {
        const at = (windowSeconds * index) / Math.max(samples - 1, 1);
        return curves.reduce(
            (top, curve) => Math.max(top, curve.levelAt(at)),
            0,
        );
    });
}

/** Builds the inspector preview: bar heights per lane + the program window. */
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
        bars: sampleCurves(
            lane.fields.flatMap((field) => curvesByField.get(field) ?? []),
            durationSeconds,
            samples,
        ),
    }));

    return { durationSeconds, lanes };
}

/** Overall intensity envelope of every ramp — used by the list sparkline. */
export function sparklineBars(
    profile: ProfileSummary,
    samples = SPARKLINE_SAMPLES,
): number[] {
    const ramps = profile.ramps ?? [];
    const curves = ramps.map(buildCurve);
    const bars = sampleCurves(curves, sampleWindow(ramps, curves), samples);
    return bars.length > 0 ? bars : [NO_RAMPS_BAR];
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
