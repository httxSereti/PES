import type { TriggerRule, TriggeredEvent } from "@/types";
import { eventTone, humanizeEventType, type EventTone } from "./describe-event";
import { buildRuleStats } from "./rule-stats";

/** Minimal integration-catalog shape needed to attribute events to a source. */
export interface EventSourceMeta {
    integrationId: string;
    integrationName: string;
}

export interface SourceBreakdown {
    key: string;
    label: string;
    tone: EventTone;
    count: number;
    /** Share of the buffered events, 0–100. */
    percent: number;
}

const KNOWN_SOURCES: Record<string, { label: string; tone: EventTone }> = {
    chaster: { label: "Chaster", tone: "violet" },
    puryfi: { label: "PuryFi", tone: "pink" },
    sensors: { label: "Sensors", tone: "teal" },
    sensor: { label: "Sensors", tone: "teal" },
    units: { label: "Core", tone: "slate" },
    unit: { label: "Core", tone: "slate" },
    custom: { label: "Custom", tone: "slate" },
    other: { label: "Other", tone: "slate" },
};

/** Best-effort source id for events that are missing from the live catalog. */
function fallbackSourceKey(eventType: string): string {
    if (eventType.startsWith("custom:")) return "custom";
    if (eventType.startsWith("puryfi")) return "puryfi";
    if (eventType.startsWith("sensor")) return "sensors";
    if (eventType.startsWith("unit")) return "units";
    return eventType.split("_")[0] || "other";
}

/**
 * Groups the in-memory stream by integration/source and returns the share of
 * events each one contributed, largest first.
 */
export function computeSourceBreakdown(
    events: TriggeredEvent[],
    catalog: Record<string, EventSourceMeta> = {},
): SourceBreakdown[] {
    const buckets = new Map<string, { label: string; tone: EventTone; count: number }>();

    for (const event of events) {
        const meta = catalog[event.event_type];
        const key = meta?.integrationId ?? fallbackSourceKey(event.event_type);
        const known = KNOWN_SOURCES[key];
        const existing = buckets.get(key);

        if (existing) {
            existing.count += 1;
            continue;
        }

        buckets.set(key, {
            label: meta?.integrationName ?? known?.label ?? humanizeEventType(key),
            tone: known?.tone ?? eventTone(event.event_type, event.origin),
            count: 1,
        });
    }

    const total = events.length;

    return Array.from(buckets.entries())
        .map(([key, bucket]) => ({
            key,
            ...bucket,
            percent: total > 0 ? (bucket.count / total) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export interface RulePerformanceEntry {
    id: string;
    name: string;
    enabled: boolean;
    priority: number;
    count: number;
    lastFired: string | null;
    actionCount: number;
}

export interface RuleHealthSummary {
    total: number;
    enabled: number;
    paused: number;
    /** Rules that fired at least once in the current event buffer. */
    fired: number;
    /** Enabled rules with no firing in the current event buffer. */
    neverFiredEnabled: number;
}

function timeOf(iso: string | null): number {
    if (!iso) return 0;
    const time = new Date(iso).getTime();
    return Number.isNaN(time) ? 0 : time;
}

/** Joins configured rules with their firing stats from the in-memory buffer. */
export function computeRulePerformance(events: TriggeredEvent[], rules: TriggerRule[]): RulePerformanceEntry[] {
    const stats = buildRuleStats(events);

    return rules
        .map((rule) => {
            const firing = stats.get(rule.id);
            return {
                id: rule.id,
                name: rule.name,
                enabled: rule.enabled,
                priority: rule.priority,
                count: firing?.count ?? 0,
                lastFired: firing?.lastFired ?? null,
                actionCount: rule.actions.length,
            };
        })
        .sort(
            (a, b) =>
                b.count - a.count ||
                timeOf(b.lastFired) - timeOf(a.lastFired) ||
                b.priority - a.priority ||
                a.name.localeCompare(b.name),
        );
}

export function computeRuleHealth(performance: RulePerformanceEntry[]): RuleHealthSummary {
    let enabled = 0;
    let fired = 0;
    let neverFiredEnabled = 0;

    for (const entry of performance) {
        if (entry.enabled) enabled += 1;
        if (entry.count > 0) fired += 1;
        if (entry.enabled && entry.count === 0) neverFiredEnabled += 1;
    }

    return {
        total: performance.length,
        enabled,
        paused: performance.length - enabled,
        fired,
        neverFiredEnabled,
    };
}
