import type { TriggeredEvent } from "@/store/slices/eventsSlice";

const MINUTE = 60_000;

export interface ThroughputBucket {
    /** Bucket start, epoch ms. */
    start: number;
    count: number;
}

export interface EventStats {
    buffer: number;
    capacity: number;
    bufferPct: number;
    fired: number;
    unmatched: number;
    firedPct: number;
    actions: number;
    rules: number;
    /** Events in the last 60 seconds. */
    rate: number;
    /** Twelve one-minute buckets, oldest → newest. */
    buckets: ThroughputBucket[];
    peak: number;
    peakAt: number | null;
}

/** Aggregates the in-memory stream for the console stats band. */
export function computeEventStats(events: TriggeredEvent[], capacity: number, now: number): EventStats {
    let fired = 0;
    let actions = 0;
    const ruleNames = new Set<string>();

    for (const event of events) {
        const rules = event.triggered_rules ?? [];
        if (rules.length > 0) fired += 1;
        for (const rule of rules) {
            ruleNames.add(rule.rule_name);
            actions += rule.actions.length;
        }
    }

    const currentMinute = Math.floor(now / MINUTE) * MINUTE;
    const buckets: ThroughputBucket[] = Array.from({ length: 12 }, (_, index) => ({
        start: currentMinute - (11 - index) * MINUTE,
        count: 0,
    }));

    let rate = 0;
    const firstBucket = buckets[0];
    for (const event of events) {
        const time = new Date(event.triggered_at).getTime();
        if (Number.isNaN(time)) continue;

        if (time >= now - MINUTE && time <= now) rate += 1;

        if (!firstBucket) continue;
        const bucketIndex = Math.floor((time - firstBucket.start) / MINUTE);
        const bucket = buckets[bucketIndex];
        if (bucket) bucket.count += 1;
    }

    let peak = 0;
    let peakAt: number | null = null;
    for (const bucket of buckets) {
        if (bucket.count >= peak && bucket.count > 0) {
            peak = bucket.count;
            peakAt = bucket.start;
        }
    }

    const buffer = events.length;
    return {
        buffer,
        capacity,
        bufferPct: capacity > 0 ? Math.round((buffer / capacity) * 100) : 0,
        fired,
        unmatched: buffer - fired,
        firedPct: buffer > 0 ? Math.round((fired / buffer) * 100) : 0,
        actions,
        rules: ruleNames.size,
        rate,
        buckets,
        peak,
        peakAt,
    };
}

/** Formats a throughput bucket start, e.g. "14:32". */
export function formatBucketTime(start: number): string {
    return new Date(start).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
    });
}
