import type { TriggeredEvent } from "@/types";

export interface RuleFiringStats {
    /** Number of events where this rule fired. */
    count: number;
    /** Most recent firing (ISO string), or null. */
    lastFired: string | null;
}

/**
 * Derives per-rule firing stats from the event buffer already held in Redux.
 * The buffer is capped (250 events), so these are recent stats — not lifetime.
 */
export function buildRuleStats(events: TriggeredEvent[]): Map<string, RuleFiringStats> {
    const stats = new Map<string, RuleFiringStats>();

    for (const event of events) {
        for (const rule of event.triggered_rules ?? []) {
            if (!rule.rule_id) continue;

            const current = stats.get(rule.rule_id);
            if (!current) {
                stats.set(rule.rule_id, { count: 1, lastFired: event.triggered_at });
                continue;
            }

            current.count += 1;
            if (!current.lastFired || event.triggered_at > current.lastFired) {
                current.lastFired = event.triggered_at;
            }
        }
    }

    return stats;
}
