import { useCallback, useEffect, useState } from "react";
import { useAppSelector } from "@/store/hooks";
import type { AdminUser, RolePermissionMap } from "@/types/admin.types";

const API_URL = import.meta.env.VITE_API_URL;

/**
 * Loads the admin user listing + role→permission map, polling so the
 * "online" status stays fresh. Returns nulls while loading.
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
            usersData.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
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
