import { useCallback, useEffect, useState } from "react";

import { useWebSocketEvent } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";

const API_URL = import.meta.env.VITE_API_URL;

export interface ApprovalAction {
    action_type: string;
    display_name: string | null;
    duration: number | null;
    cumulative: boolean | null;
    payload: Record<string, unknown>;
}

export interface ApprovalRequest {
    id: string;
    event_id: string;
    rule_id: string;
    rule_name: string;
    status: string;
    actions: ApprovalAction[];
    summary: Record<string, unknown>;
    requested_at: string;
    expires_at: string;
    resolved_at: string | null;
    resolved_by: string | null;
    reason: string | null;
}

function authHeaders(token: string | null): Record<string, string> {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

export function useApprovals(status: "pending" | "approved" | "rejected" | "expired" = "pending") {
    const token = useAppSelector((state) => state.auth.token);
    const [requests, setRequests] = useState<ApprovalRequest[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_URL}/events/approvals?status=${status}`, {
                headers: authHeaders(token),
            });
            if (!response.ok) throw new Error("Failed to load approvals");
            setRequests((await response.json()) as ApprovalRequest[]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load approvals");
        } finally {
            setLoading(false);
        }
    }, [token, status]);

    useEffect(() => {
        void load();
    }, [load]);

    useWebSocketEvent("approvals:update", () => {
        void load();
    });

    const decide = useCallback(
        async (requestId: string, decision: "approve" | "reject", reason?: string) => {
            if (!token) return null;
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(`${API_URL}/events/approvals/${requestId}/${decision}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...authHeaders(token),
                    },
                    body: decision === "reject" ? JSON.stringify({ reason: reason ?? null }) : undefined,
                });
                if (!response.ok) {
                    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
                    throw new Error(body?.detail ?? `Failed to ${decision} request`);
                }
                await load();
                return (await response.json()) as ApprovalRequest;
            } catch (err) {
                setError(err instanceof Error ? err.message : `Failed to ${decision} request`);
                return null;
            } finally {
                setLoading(false);
            }
        },
        [token, load],
    );

    return {
        requests,
        loading,
        error,
        reload: load,
        approve: (requestId: string) => decide(requestId, "approve"),
        reject: (requestId: string, reason?: string) => decide(requestId, "reject", reason),
    };
}
