import type { TriggeredEvent } from "@/store/slices/eventsSlice";

export type TriggeredFilterMode = "any" | "yes" | "no";
export type TimeWindowKey = "all" | "5m" | "15m" | "1h" | "24h";

export interface EventsFilterState {
    /** Free text, AND-ed terms, matched against type/origin/rules/actions/event data */
    search: string;
    /** Explicitly allowed event types; empty = all */
    types: string[];
    /** Allowed origin providers (1st segment); empty = all */
    providers: string[];
    /** Allowed origin modules/actions (2nd segment); empty = all */
    modules: string[];
    /** Rule names that must appear among triggered rules; empty = all */
    rules: string[];
    /** Action types that must appear among triggered actions; empty = all */
    actionTypes: string[];
    /** Presence of triggered rules */
    triggered: TriggeredFilterMode;
    /** Sliding time window relative to now */
    timeWindow: TimeWindowKey;
}

export const DEFAULT_EVENTS_FILTER: EventsFilterState = {
    search: "",
    types: [],
    providers: [],
    modules: [],
    rules: [],
    actionTypes: [],
    triggered: "any",
    timeWindow: "all",
};

export const TIME_WINDOWS: Record<TimeWindowKey, { label: string; ms: number | null }> = {
    all: { label: "All time", ms: null },
    "5m": { label: "Last 5 min", ms: 5 * 60_000 },
    "15m": { label: "Last 15 min", ms: 15 * 60_000 },
    "1h": { label: "Last hour", ms: 60 * 60_000 },
    "24h": { label: "Last 24 h", ms: 24 * 60 * 60_000 },
};

export const TRIGGERED_FILTER_LABELS: Record<TriggeredFilterMode, string> = {
    any: "Any",
    yes: "With rules",
    no: "Without rules",
};

export interface ParsedOrigin {
    provider: string;
    module: string;
    id: string;
}

/** Origins look like "<provider>:<module/action>:<uniqueId>" — e.g. "chaster:wheel_of_fortune_turned:BBMqRi…". */
export function parseOrigin(origin: string): ParsedOrigin | null {
    const [provider, module, ...rest] = origin.split(":");
    if (!provider || !module || rest.length === 0 || rest.some(p => p === "")) return null;
    return { provider, module, id: rest.join(":") };
}

/** Removes `value` from `list`, or appends it when missing. */
export function toggleValue(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

/** Selects every type of a group, or clears them when the whole group is already selected. */
export function toggleGroupTypes(groupTypes: string[], selected: string[]): string[] {
    const allSelected = groupTypes.every(t => selected.includes(t));
    return allSelected
        ? selected.filter(t => !groupTypes.includes(t))
        : Array.from(new Set([...selected, ...groupTypes]));
}

function eventSearchHaystack(e: TriggeredEvent): string {
    const parts: string[] = [e.event_type, e.origin];
    for (const r of e.triggered_rules ?? []) {
        parts.push(r.rule_name);
        for (const a of r.actions) {
            parts.push(a.action_type, a.display_name ?? "");
        }
    }
    parts.push(JSON.stringify(e.event_data ?? {}));
    return parts.join("\n").toLowerCase();
}

/** True when the event passes every active filter dimension. */
export function matchesEventFilters(e: TriggeredEvent, f: EventsFilterState): boolean {
    const q = f.search.trim().toLowerCase();
    if (q) {
        const hay = eventSearchHaystack(e);
        if (!q.split(/\s+/).every(term => hay.includes(term))) return false;
    }

    if (f.types.length > 0 && !f.types.includes(e.event_type)) return false;

    const parsedOrigin = parseOrigin(e.origin);
    if (f.providers.length > 0 && (!parsedOrigin || !f.providers.includes(parsedOrigin.provider))) return false;
    if (f.modules.length > 0 && (!parsedOrigin || !f.modules.includes(parsedOrigin.module))) return false;

    const ruleNames = (e.triggered_rules ?? []).map(r => r.rule_name);
    if (f.triggered === "yes" && ruleNames.length === 0) return false;
    if (f.triggered === "no" && ruleNames.length > 0) return false;
    if (f.rules.length > 0 && !ruleNames.some(n => f.rules.includes(n))) return false;

    if (f.actionTypes.length > 0) {
        const actions = (e.triggered_rules ?? []).flatMap(r => r.actions.map(a => a.action_type));
        if (!actions.some(t => f.actionTypes.includes(t))) return false;
    }

    const win = TIME_WINDOWS[f.timeWindow]?.ms ?? null;
    if (win !== null) {
        const ts = new Date(e.triggered_at).getTime();
        if (Number.isNaN(ts) || Date.now() - ts > win) return false;
    }

    return true;
}

/** Number of non-default filter dimensions currently active. */
export function countActiveFilters(f: EventsFilterState): number {
    let n = 0;
    if (f.search.trim() !== "") n++;
    if (f.types.length > 0) n++;
    if (f.providers.length > 0) n++;
    if (f.modules.length > 0) n++;
    if (f.rules.length > 0) n++;
    if (f.actionTypes.length > 0) n++;
    if (f.triggered !== "any") n++;
    if (f.timeWindow !== "all") n++;
    return n;
}
