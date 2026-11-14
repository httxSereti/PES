import { useCallback, useEffect, useState } from "react";

import { useAppSelector } from "@/store/hooks";

const API_URL = import.meta.env.VITE_API_URL;

export interface FlowRunSummary {
    id: string;
    event_id: string;
    flow_id: string;
    flow_version: number;
    status: string;
    trigger_node_id: string | null;
    correlation_id: string | null;
    causation_id: string | null;
    started_at: string;
    finished_at: string | null;
    latency_ms: number | null;
    error: string | null;
    trace: Record<string, unknown>;
}

export interface NodeRun {
    id: string;
    node_id: string;
    node_type: string;
    status: string;
    iteration: number;
    started_at: string | null;
    duration_ms: number | null;
    input_preview: Record<string, unknown> | null;
    output_preview: Record<string, unknown> | null;
    reason: string | null;
    error: string | null;
}

export interface EffectLedgerEntry {
    id: string;
    node_id: string;
    effect_kind: string;
    target: Record<string, unknown> | null;
    params_before: Record<string, unknown> | null;
    params_after: Record<string, unknown> | null;
    modifiers: Array<Record<string, unknown>> | null;
    clamp: Record<string, unknown> | null;
    blocked_reason: string | null;
    status: string;
    queue_item_id: string | null;
    idempotency_key: string | null;
    created_at: string;
    applied_at: string | null;
    reversed_at: string | null;
}

export interface FlowRunDetail extends FlowRunSummary {
    node_runs: NodeRun[];
    effects: EffectLedgerEntry[];
}

function authHeaders(token: string | null): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useFlowRuns(limit = 50) {
    const token = useAppSelector((state) => state.auth.token);
    const [runs, setRuns] = useState<FlowRunSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_URL}/events/runs?limit=${limit}`, {
                headers: authHeaders(token),
            });
            if (!response.ok) throw new Error("Failed to load flow runs");
            setRuns((await response.json()) as FlowRunSummary[]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load flow runs");
        } finally {
            setLoading(false);
        }
    }, [token, limit]);

    useEffect(() => {
        void load();
    }, [load]);

    return { runs, loading, error, reload: load };
}

export function useFlowRun(runId: string | undefined) {
    const token = useAppSelector((state) => state.auth.token);
    const [run, setRun] = useState<FlowRunDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!token || !runId) return;
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_URL}/events/runs/${runId}`, {
                headers: authHeaders(token),
            });
            if (!response.ok) throw new Error("Flow run not found");
            setRun((await response.json()) as FlowRunDetail);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load flow run");
        } finally {
            setLoading(false);
        }
    }, [token, runId]);

    useEffect(() => {
        void load();
    }, [load]);

    return { run, loading, error, reload: load };
}

export function useEventReplay() {
    const token = useAppSelector((state) => state.auth.token);
    const [result, setResult] = useState<Record<string, unknown> | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const replay = useCallback(
        async (eventId: string) => {
            if (!token) return null;
            setLoading(true);
            setError(null);
            setResult(null);
            try {
                const response = await fetch(`${API_URL}/events/${eventId}/replay`, {
                    method: "POST",
                    headers: authHeaders(token),
                });
                if (!response.ok) throw new Error("Replay failed");
                const data = (await response.json()) as Record<string, unknown>;
                setResult(data);
                return data;
            } catch (err) {
                setError(err instanceof Error ? err.message : "Replay failed");
                return null;
            } finally {
                setLoading(false);
            }
        },
        [token],
    );

    return { result, loading, error, replay };
}
