import { useCallback, useEffect, useState } from "react";

import { useAppSelector } from "@/store/hooks";
import { eventsFetch } from "@/lib/api";

export type GraphNodeType = string;

export interface GraphNode {
    id: string;
    type: GraphNodeType;
    config: Record<string, unknown>;
    position?: { x: number; y: number } | null;
}

export interface GraphEdge {
    source: string;
    target: string;
    source_port: string;
    target_port: string;
}

export interface FlowGraph {
    id: string;
    name: string;
    version: number;
    nodes: GraphNode[];
    edges: GraphEdge[];
    variables: Record<string, unknown>;
    created_from: string | null;
    schema_version: number;
}

export interface CompiledOp {
    op: string;
    node_id: string;
    config: Record<string, unknown>;
}

export interface CompiledGraph {
    flow_id: string;
    flow_version: number;
    ops: CompiledOp[];
    warnings: string[];
}

export interface GraphVersion {
    id: string;
    version: number;
    created_at: string;
    created_by: string | null;
    nodes: number;
    current: boolean;
}

export interface GraphDiff {
    from_version: number;
    to_version: number;
    nodes: {
        added: GraphNode[];
        removed: GraphNode[];
        changed: GraphNode[];
    };
    edges: {
        added: GraphEdge[];
        removed: GraphEdge[];
    };
}

export interface GraphDiffResponse {
    from_version: number;
    to_version: number;
    diff: GraphDiff;
    from_graph: FlowGraph;
    to_graph: FlowGraph;
}

interface GraphPayload {
    graph: FlowGraph;
    version: number;
    saved: boolean;
    runtime_only?: boolean;
    warnings: string[];
    compiled: CompiledGraph;
}

function authHeaders(token: string | null): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseError(response: Response, fallback: string): Promise<string> {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    if (
        response.status === 404 &&
        (!body?.detail || body.detail === "Not Found")
    ) {
        return "Events graph API not found. Restart/update the backend and check VITE_API_URL.";
    }
    return body?.detail ?? fallback;
}

export function useFlowGraph(ruleId: string | undefined) {
    const token = useAppSelector((state) => state.auth.token);
    const [graph, setGraph] = useState<FlowGraph | null>(null);
    const [version, setVersion] = useState(0);
    const [saved, setSaved] = useState(false);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [compiled, setCompiled] = useState<CompiledGraph | null>(null);
    const [versions, setVersions] = useState<GraphVersion[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadVersions = useCallback(async () => {
        if (!token || !ruleId) return;
        const response = await eventsFetch(`/events/rules/${ruleId}/versions`, {
            headers: authHeaders(token),
        });
        if (response.ok) {
            setVersions((await response.json()) as GraphVersion[]);
        }
    }, [token, ruleId]);

    const load = useCallback(
        async (fromRule = false) => {
            if (!token || !ruleId) return null;
            setLoading(true);
            setError(null);
            try {
                const suffix = fromRule ? "?from_rule=true" : "";
                const response = await eventsFetch(`/events/rules/${ruleId}/graph${suffix}`, {
                    headers: authHeaders(token),
                });
                if (!response.ok) throw new Error(await parseError(response, "Failed to load graph"));
                const data = (await response.json()) as GraphPayload;
                setGraph(data.graph);
                setVersion(data.version);
                setSaved(data.saved);
                setWarnings(data.warnings ?? []);
                setCompiled(data.compiled ?? null);
                await loadVersions();
                return data.graph;
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load graph");
                return null;
            } finally {
                setLoading(false);
            }
        },
        [token, ruleId, loadVersions],
    );

    const save = useCallback(
        async (nextGraph: FlowGraph, apply = true) => {
            if (!token || !ruleId) return null;
            setSaving(true);
            setError(null);
            try {
                const response = await eventsFetch(`/events/rules/${ruleId}/graph`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        ...authHeaders(token),
                    },
                    body: JSON.stringify({ graph: nextGraph, apply }),
                });
                if (!response.ok) throw new Error(await parseError(response, "Failed to save graph"));
                const data = (await response.json()) as GraphPayload;
                setGraph(data.graph);
                setVersion(data.version);
                setSaved(true);
                setWarnings(data.warnings ?? []);
                setCompiled(data.compiled ?? null);
                await loadVersions();
                return data;
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to save graph");
                return null;
            } finally {
                setSaving(false);
            }
        },
        [token, ruleId, loadVersions],
    );

    const getVersion = useCallback(
        async (target: number) => {
            if (!token || !ruleId) return null;
            const response = await eventsFetch(`/events/rules/${ruleId}/versions/${target}`, {
                headers: authHeaders(token),
            });
            if (!response.ok) throw new Error(await parseError(response, "Failed to load version"));
            return (await response.json()) as { graph: FlowGraph; version: number };
        },
        [token, ruleId],
    );

    const diff = useCallback(
        async (from: number, to?: number) => {
            if (!token || !ruleId) return null;
            const query = new URLSearchParams({ from_version: String(from) });
            if (to !== undefined) query.set("to_version", String(to));
            const response = await eventsFetch(`/events/rules/${ruleId}/diff?${query.toString()}`, {
                headers: authHeaders(token),
            });
            if (!response.ok) throw new Error(await parseError(response, "Failed to load diff"));
            return (await response.json()) as GraphDiffResponse;
        },
        [token, ruleId],
    );

    const restore = useCallback(
        async (target: number) => {
            if (!token || !ruleId) return null;
            setSaving(true);
            setError(null);
            try {
                const response = await eventsFetch(`/events/rules/${ruleId}/versions/${target}/restore`, {
                    method: "POST",
                    headers: authHeaders(token),
                });
                if (!response.ok) throw new Error(await parseError(response, "Failed to restore version"));
                const data = (await response.json()) as GraphPayload;
                setGraph(data.graph);
                setVersion(data.version);
                setSaved(true);
                setWarnings(data.warnings ?? []);
                setCompiled(data.compiled ?? null);
                await loadVersions();
                return data;
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to restore version");
                return null;
            } finally {
                setSaving(false);
            }
        },
        [token, ruleId, loadVersions],
    );

    const runManual = useCallback(
        async (eventData: Record<string, unknown> = {}) => {
            if (!token || !ruleId) return null;
            setSaving(true);
            setError(null);
            try {
                const response = await eventsFetch(`/events/rules/${ruleId}/run`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...authHeaders(token),
                    },
                    body: JSON.stringify({ event_data: eventData }),
                });
                if (!response.ok) throw new Error(await parseError(response, "Failed to run flow"));
                return (await response.json()) as {
                    matched: boolean;
                    counts: { rules: number; actions: number; approvals: number; emissions: number };
                };
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to run flow");
                return null;
            } finally {
                setSaving(false);
            }
        },
        [token, ruleId],
    );

    useEffect(() => {
        void load();
    }, [load]);

    return {
        graph,
        setGraph,
        version,
        saved,
        warnings,
        compiled,
        versions,
        loading,
        saving,
        error,
        load,
        save,
        getVersion,
        diff,
        restore,
        runManual,
        reloadVersions: loadVersions,
    };
}
