import { useCallback, useState } from "react";

import { useAppSelector } from "@/store/hooks";
import { eventsFetch } from "@/lib/api";

export interface SimulatedAction {
    queue_item_id: string;
    action_id: string | null;
    action_type: string;
    display_name: string | null;
    duration: number;
    cumulative: boolean;
    payload: Record<string, unknown>;
    modifiers?: Array<Record<string, unknown>>;
}

export interface SimulatedRule {
    rule_id: string | null;
    rule_name: string;
    priority: number;
    matched?: boolean;
    conditions?: Array<Record<string, unknown>>;
    condition_mode?: string;
    actions: SimulatedAction[];
}

export interface CompiledOp {
    op: string;
    node_id: string;
    config: Record<string, unknown>;
}

export interface CompiledFlow {
    flow_id: string;
    flow_version: number;
    ops: CompiledOp[];
    warnings: string[];
}

export interface SimulationResult {
    event: Record<string, unknown>;
    matched: boolean;
    skipped_reason: string | null;
    rules: SimulatedRule[];
    queue_items: Array<Record<string, unknown>>;
    counts: { rules: number; actions: number };
    warnings: string[];
    compiled?: CompiledFlow[];
}

export interface DraftRulePayload {
    name: string;
    description?: string | null;
    conditions: Array<Record<string, unknown>>;
    condition_mode: "all" | "any";
    actions: Array<Record<string, unknown>>;
}

export function useRuleSimulation() {
    const token = useAppSelector((state) => state.auth.token);
    const [result, setResult] = useState<SimulationResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const simulate = useCallback(
        async (eventType: string, draftRule: DraftRulePayload, eventData: Record<string, unknown>) => {
            if (!token || !eventType) return null;
            setLoading(true);
            setError(null);
            setResult(null);
            try {
                const response = await eventsFetch(`/events/simulate`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        event_type: eventType,
                        event_data: eventData,
                        origin: "composer-preview",
                        draft_rule: draftRule,
                    }),
                });
                if (!response.ok) {
                    const detail = (await response.json().catch(() => null)) as
                        | { detail?: string }
                        | null;
                    throw new Error(detail?.detail ?? "Simulation failed");
                }
                const data = (await response.json()) as SimulationResult;
                setResult(data);
                return data;
            } catch (err) {
                const message = err instanceof Error ? err.message : "Simulation failed";
                setError(message);
                return null;
            } finally {
                setLoading(false);
            }
        },
        [token],
    );

    const reset = useCallback(() => {
        setResult(null);
        setError(null);
    }, []);

    return { result, loading, error, simulate, reset };
}
