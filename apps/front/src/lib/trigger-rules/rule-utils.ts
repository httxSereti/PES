import type { TriggerRule } from "@/types";

/** Rules support both the legacy single event and the multi-event field. */
export function eventTypesOf(rule: TriggerRule): string[] {
    if (rule.event_types?.length) return rule.event_types;
    return rule.event_type ? [rule.event_type] : [];
}
