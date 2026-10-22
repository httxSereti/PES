import type { TriggeredEvent, TriggeredRule } from "@/store/slices/eventsSlice";

/** Default window in which consecutive identical events collapse into one row. */
export const BURST_WINDOW_MS = 60_000;

export interface BurstRule {
    /** Latest firing of this rule, used for the action chain. */
    rule: TriggeredRule;
    /** How many events in the burst matched this rule. */
    fires: number;
    /** Total actions queued by this rule across the burst. */
    actionCount: number;
}

export interface EventBurst {
    /** Stable React key (the newest event when the burst was opened). */
    key: string;
    /** Newest → oldest. */
    events: TriggeredEvent[];
    latest: TriggeredEvent;
    oldest: TriggeredEvent;
    count: number;
    rules: BurstRule[];
    actionCount: number;
}

function timeOf(event: TriggeredEvent): number {
    const time = new Date(event.triggered_at).getTime();
    return Number.isNaN(time) ? 0 : time;
}

/** Same source + module + event type; the origin's unique id is intentionally ignored. */
function burstKey(event: TriggeredEvent): string {
    const [provider, module] = event.origin.split(":");
    return `${provider ?? "unknown"}|${module ?? ""}|${event.event_type}`;
}

function actionsOf(event: TriggeredEvent): number {
    return (event.triggered_rules ?? []).reduce((total, rule) => total + rule.actions.length, 0);
}

function createGroup(event: TriggeredEvent): EventBurst {
    const rules = new Map<string, BurstRule>();
    addRules(rules, event);

    return {
        key: event.id,
        events: [event],
        latest: event,
        oldest: event,
        count: 1,
        rules: Array.from(rules.values()),
        actionCount: actionsOf(event),
    };
}

function addRules(target: Map<string, BurstRule>, event: TriggeredEvent): void {
    for (const rule of event.triggered_rules ?? []) {
        const key = rule.rule_id ?? rule.rule_name;
        const existing = target.get(key);
        if (existing) {
            existing.fires += 1;
            existing.actionCount += rule.actions.length;
        } else {
            target.set(key, { rule, fires: 1, actionCount: rule.actions.length });
        }
    }
}

/**
 * Collapses consecutive identical events (same provider + event type, within
 * `windowMs`) into a single burst. Input must be sorted newest → oldest.
 */
export function groupEventBursts(events: TriggeredEvent[], windowMs = BURST_WINDOW_MS): EventBurst[] {
    const groups: EventBurst[] = [];

    for (const event of events) {
        const current = groups[groups.length - 1];

        if (current) {
            const gap = timeOf(current.oldest) - timeOf(event);
            const sameKind = burstKey(current.latest) === burstKey(event);

            if (sameKind && gap <= windowMs) {
                current.events.push(event);
                current.oldest = event;
                current.count += 1;
                current.actionCount += actionsOf(event);

                const rules = new Map<string, BurstRule>(
                    current.rules.map((entry) => [entry.rule.rule_id ?? entry.rule.rule_name, { ...entry }]),
                );
                addRules(rules, event);
                current.rules = Array.from(rules.values());
                continue;
            }
        }

        groups.push(createGroup(event));
    }

    return groups;
}

/** Wraps a single event so burst and non-burst rows share one shape. */
export function singleEventGroup(event: TriggeredEvent): EventBurst {
    return createGroup(event);
}
