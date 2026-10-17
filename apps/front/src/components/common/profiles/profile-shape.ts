/**
 * Deterministic, hash-seeded helpers for the list sparkline and the inspector
 * chart.
 *
 * `ProfileSummary` only carries `ramp_count` — no per-ramp detail reaches the
 * frontend yet, so every shape here is fake and derived from the ramp count
 * plus a hash of the profile name.
 *
 * TODO: replace `shapeBars` / `profileDurationSeconds` with real ramp data
 * once the backend exposes per-ramp detail (requires a websocket schema
 * change, deliberately out of scope for this redesign).
 */

/** FNV-1a string hash — stable across sessions and platforms. */
export function hashString(value: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/** Tiny deterministic PRNG (mulberry32). */
export function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

/** Never render more bars than this, however many ramps a profile has. */
const MAX_BARS = 12;

/** Single flat bar shown for profiles with no (or one) ramp. */
const FLAT_BAR_HEIGHT = 33;

/**
 * Deterministic bar heights in % of the track. One bar per ramp (capped),
 * ramping from `start` to `end` with a hash-seeded jitter.
 */
export function shapeBars(
    seedKey: string,
    rampCount: number,
    start: number,
    end: number,
    jitter = 6,
): number[] {
    if (rampCount <= 1) return [FLAT_BAR_HEIGHT];
    const count = Math.min(rampCount, MAX_BARS);
    const random = seededRandom(hashString(seedKey));
    return Array.from({ length: count }, (_, index) => {
        const progress = index / (count - 1);
        const noise = (random() - 0.5) * 2 * jitter;
        const height = start + (end - start) * progress + noise;
        return Math.round(Math.min(100, Math.max(8, height)));
    });
}

/**
 * Fake total program duration — the design's sample plot implies 2 minutes
 * per ramp — used for the chart time axis.
 */
export function profileDurationSeconds(rampCount: number): number {
    return Math.max(0, rampCount) * 120;
}

/** `m:ss` clock label, e.g. 1080 → "18:00". */
export function formatClock(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
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
