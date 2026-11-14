import { useCallback, useEffect, useState } from "react";

import { useAppSelector } from "@/store/hooks";

const API_URL = import.meta.env.VITE_API_URL;

export interface FlowSpecNode {
    id: string;
    type: string;
    config: Record<string, unknown>;
}

export interface FlowSpecEdge {
    source: string;
    target: string;
    source_port: string;
    target_port: string;
}

export interface FlowSpec {
    id: string;
    name: string;
    version: number;
    nodes: FlowSpecNode[];
    edges: FlowSpecEdge[];
    variables: Record<string, unknown>;
    created_from: string | null;
    schema_version: number;
}

export interface CompiledFlow {
    flow_id: string;
    flow_version: number;
    ops: Array<{ op: string; node_id: string; config: Record<string, unknown> }>;
    warnings: string[];
}

export function useFlowSpec(ruleId: string | undefined) {
    const token = useAppSelector((state) => state.auth.token);
    const [spec, setSpec] = useState<FlowSpec | null>(null);
    const [compiled, setCompiled] = useState<CompiledFlow | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!token || !ruleId) return;
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_URL}/events/flows/${ruleId}/spec`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new Error("Flow not found");
            const data = (await response.json()) as {
                spec: FlowSpec;
                compiled: CompiledFlow;
            };
            setSpec(data.spec);
            setCompiled(data.compiled);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load flow");
        } finally {
            setLoading(false);
        }
    }, [token, ruleId]);

    useEffect(() => {
        void load();
    }, [load]);

    return { spec, compiled, loading, error, reload: load };
}
