import { useCallback, useEffect, useState } from "react";
import { useAppSelector } from "@/store/hooks";
import type { AdminUser, RolePermissionMap } from "@/types/admin.types";

const API_URL = import.meta.env.VITE_API_URL;

/** Role priority for the final tie-break (host first, guest last). */
const ROLE_RANK: Record<string, number> = {
    host: 0,
    admin: 1,
    trusted: 2,
    operator: 3,
    user: 4,
    guest: 5,
};

function roleRank(role: string): number {
    return ROLE_RANK[role] ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Loads the admin user listing + role→permission map, polling so the
 * "online" status stays fresh. Users are ordered online-first, then by
 * most recent login (never-logged-in last), then by role. Returns nulls
 * while loading.
 */
export function useAdminUsers(pollMs = 15000) {
    const token = useAppSelector(state => state.auth.token);
    const [users, setUsers] = useState<AdminUser[] | null>(null);
    const [rolePermissions, setRolePermissions] = useState<RolePermissionMap | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!token) return;
        try {
            const headers = { Authorization: `Bearer ${token}` };

            const [usersRes, rolesRes] = await Promise.all([
                fetch(`${API_URL}/users`, { headers }),
                fetch(`${API_URL}/admin/roles`, { headers }),
            ]);

            if (!usersRes.ok) throw new Error(`Failed to load users (${usersRes.status})`);
            if (!rolesRes.ok) throw new Error(`Failed to load roles (${rolesRes.status})`);

            const usersData: AdminUser[] = await usersRes.json();
            usersData.sort((a, b) => {
                // Online users first
                if (a.is_online !== b.is_online) return a.is_online ? -1 : 1;
                // Then most recent login first (never-logged-in users last)
                const byLogin = (b.last_login_at ?? "").localeCompare(a.last_login_at ?? "");
                if (byLogin !== 0) return byLogin;
                // Tie-break: highest role first (host → guest)
                return roleRank(a.role) - roleRank(b.role);
            });
            setUsers(usersData);
            setRolePermissions(await rolesRes.json());
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Network error");
        }
    }, [token]);

    useEffect(() => {
        void load();
        if (!pollMs) return;
        const id = setInterval(() => void load(), pollMs);
        return () => clearInterval(id);
    }, [load, pollMs]);

    return { users, rolePermissions, error, reload: load };
}
