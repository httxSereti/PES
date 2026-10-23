import { useCallback, useEffect, useMemo, useState } from "react";

import { useAppSelector } from "@/store/hooks";
import type { AdminUser } from "@/types/admin.types";

const API_URL = import.meta.env.VITE_API_URL;

/**
 * Lightweight presence feed for the home page. Only enabled for accounts
 * allowed to read the user listing (ADMIN/HOST, or a custom READ_USERS grant).
 */
export function useOnlineUsers(enabled: boolean, pollMs = 30_000) {
    const token = useAppSelector((state) => state.auth.token);
    const [users, setUsers] = useState<AdminUser[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!enabled || !token) return;

        try {
            const response = await fetch(`${API_URL}/users`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "ngrok-skip-browser-warning": "69420",
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to load users (${response.status})`);
            }

            setUsers((await response.json()) as AdminUser[]);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Network error");
        } finally {
            setLoading(false);
        }
    }, [enabled, token]);

    useEffect(() => {
        if (!enabled) {
            setUsers(null);
            setError(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        void load();

        if (!pollMs) return;
        const id = window.setInterval(() => void load(), pollMs);
        return () => window.clearInterval(id);
    }, [enabled, load, pollMs]);

    const online = useMemo(
        () => (users ?? []).filter((user) => user.is_online),
        [users],
    );

    return { users, online, loading, error };
}
