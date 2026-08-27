import { useState, useMemo } from "react";
import { KeyRound, Link2, RefreshCw, UserCheck } from "lucide-react";
import type { Route } from ".react-router/types/src/pages/app/admin/+types/users";
import type { RouteHandle } from "@/types/route-handle";
import { useAppSelector } from "@/store/hooks";
import { useAdminUsers } from "@/hooks/useAdminUsers";
import { formatDateTime } from "@/lib/format-date";
import type { AdminUser } from "@/types/admin.types";
import { Role } from "@/types";
import { toast } from "sonner";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@pes/ui/components/select";
import { Button } from "@pes/ui/components/button";
import { Skeleton } from "@pes/ui/components/skeleton";
import { UserPermissionsDialog } from "@/components/common/admin/user-permissions-dialog";

export const handle: RouteHandle = { header: "adminUsers" };

// eslint-disable-next-line no-empty-pattern
export function meta({ }: Route.MetaArgs) {
    return [
        { title: "PES | Admin - Users" },
        { name: "description", content: "Manage users, roles and permissions" },
    ];
}

const API_URL = import.meta.env.VITE_API_URL;

const ROLE_LABELS: Record<string, string> = {
    guest: "Guest",
    user: "User",
    operator: "Operator",
    trusted: "Trusted",
    admin: "Admin",
    root: "Root",
};

/** Roles an admin may assign from the UI (ROOT is bootstrap-only). */
const ASSIGNABLE_ROLES = Object.values(Role).filter(r => r !== Role.ROOT);

function initials(user: AdminUser): string {
    const name = user.display_name?.trim();
    if (!name) return "??";
    return name.slice(0, 2).toUpperCase();
}

function OnlineDot({ online }: { online: boolean }) {
    return (
        <span className="relative inline-flex h-2 w-2 shrink-0">
            {online && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
            )}
            <span
                className={`relative inline-flex rounded-full h-2 w-2 ${online ? "bg-emerald-500" : "bg-muted-foreground/25"}`}
            />
        </span>
    );
}

function RoleSelect({ user, onChanged }: {
    user: AdminUser;
    onChanged: () => void;
}) {
    const token = useAppSelector(state => state.auth.token);
    const me = useAppSelector(state => state.auth.user);
    const [saving, setSaving] = useState(false);

    // Safety rails: never reassign ROOT, never change your own role here
    const locked = user.role === Role.ROOT || user.id === me?.id;

    const change = async (role: string) => {
        if (!token) return;
        setSaving(true);
        try {
            const response = await fetch(
                `${API_URL}/admin/users/${user.id}/role?role=${role}`,
                { method: "POST", headers: { Authorization: `Bearer ${token}` } }
            );
            if (!response.ok) {
                throw new Error(`Failed (${response.status}): ${await response.text()}`);
            }
            toast.success(`${user.display_name ?? user.id} is now ${ROLE_LABELS[role] ?? role}`, {
                position: "bottom-right",
            });
            onChanged();
        } catch (err) {
            toast.error("Can't update role", {
                description: err instanceof Error ? err.message : "Network error",
                position: "top-right",
            });
        } finally {
            setSaving(false);
        }
    };

    if (locked) {
        return (
            <span
                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border font-mono ${user.role === Role.ROOT
                    ? "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300"
                    : "bg-muted/50 text-muted-foreground/60 border-border"
                }`}
                title={user.role === Role.ROOT ? "ROOT role can't be changed" : "You can't change your own role"}
            >
                {ROLE_LABELS[user.role] ?? user.role}
            </span>
        );
    }

    return (
        <Select value={user.role} onValueChange={v => void change(v)} disabled={saving}>
            <SelectTrigger className="h-[26px] px-2.5 py-1 w-auto min-w-0 text-xs bg-muted/50 border-border rounded-md focus:ring-violet-500/20 focus:border-violet-500/50 transition cursor-pointer font-normal">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {ASSIGNABLE_ROLES.map(role => (
                    <SelectItem key={role} value={role} className="text-xs">
                        {ROLE_LABELS[role]}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function MagicLinkButton({ user }: { user: AdminUser }) {
    const token = useAppSelector(state => state.auth.token);
    const [loading, setLoading] = useState(false);

    const getLink = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const response = await fetch(
                `${API_URL}/admin/users/${user.id}/magic-link`,
                { method: "POST", headers: { Authorization: `Bearer ${token}` } }
            );
            if (!response.ok) {
                throw new Error(`Failed (${response.status}): ${await response.text()}`);
            }
            const { magic_link } = (await response.json()) as { magic_link: string };
            await navigator.clipboard.writeText(magic_link);
            toast.success("Magic link copied to clipboard", {
                description: "Share it with the user so they can log in",
                position: "bottom-right",
            });
        } catch (err) {
            toast.error("Can't generate magic link", {
                description: err instanceof Error ? err.message : "Network error",
                position: "top-right",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button
            variant="ghost"
            size="sm"
            className="h-[26px] px-2 py-0.5 text-xs gap-1.5 text-muted-foreground/70 hover:text-foreground"
            onClick={() => void getLink()}
            disabled={loading}
            title="Generate & copy magic link"
        >
            {loading ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
                <Link2 size={12} />
            )}
        </Button>
    );
}

export default function UsersAdminPage() {
    const { users, rolePermissions, error, reload } = useAdminUsers();
    const [permUser, setPermUser] = useState<AdminUser | null>(null);

    const stats = useMemo(() => ({
        total: users?.length ?? 0,
        online: users?.filter(u => u.is_online).length ?? 0,
    }), [users]);

    return (
        <div className="space-y-4 px-4 md:px-5">
            {/* Toolbar */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                    <UserCheck size={13} className="text-emerald-500" />
                    <span className="tabular-nums">{stats.online}</span>
                    <span>online</span>
                    <span className="text-muted-foreground/30">·</span>
                    <span className="tabular-nums">{stats.total}</span>
                    <span>users</span>
                </div>
                {error && (
                    <span className="text-xs text-destructive">{error}</span>
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-[28px] px-2.5 text-xs text-muted-foreground/70 hover:text-foreground gap-1.5"
                    onClick={() => void reload()}
                >
                    <RefreshCw size={12} />
                    Refresh
                </Button>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border bg-muted/40">
                            {["User", "Role", "Status", "Created", "Last login", "Permissions", "Magic link"].map(h => (
                                <th key={h} className="py-2.5 px-3 first:pl-4 last:pr-4 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 whitespace-nowrap">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {!users ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <tr key={i}>
                                    <td colSpan={7} className="py-2 px-4">
                                        <Skeleton className="h-8 w-full" />
                                    </td>
                                </tr>
                            ))
                        ) : users.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="py-16 text-center text-sm text-muted-foreground/40 italic">
                                    No users found
                                </td>
                            </tr>
                        ) : (
                            users.map(user => (
                                <tr key={user.id} className="border-b border-border/40 last:border-b-0 hover:bg-muted/30 transition-colors">
                                    <td className="py-2.5 pl-4 pr-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold border ${user.is_online
                                                ? "accent-tile accent-tile-icon"
                                                : "bg-muted/60 text-muted-foreground/60 border-border"
                                                }`}>
                                                {initials(user)}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-mono text-xs text-foreground truncate max-w-[160px]">
                                                    {user.display_name ?? "—"}
                                                    {!user.is_active && (
                                                        <span className="ml-1.5 text-[9px] uppercase tracking-wide text-red-500/80">inactive</span>
                                                    )}
                                                </div>
                                                <div className="font-mono text-[10px] text-muted-foreground/40 truncate max-w-[160px]">{user.id}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-2.5 px-3">
                                        <RoleSelect user={user} onChanged={() => void reload()} />
                                    </td>
                                    <td className="py-2.5 px-3">
                                        <span className="flex items-center gap-2 text-xs whitespace-nowrap">
                                            <OnlineDot online={user.is_online} />
                                            <span className={user.is_online ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/50"}>
                                                {user.is_online ? "Online" : "Offline"}
                                            </span>
                                        </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-xs text-muted-foreground/60 font-mono whitespace-nowrap tabular-nums hidden md:table-cell">
                                        {formatDateTime(user.created_at)}
                                    </td>
                                    <td className="py-2.5 px-3 text-xs text-muted-foreground/60 font-mono whitespace-nowrap tabular-nums hidden lg:table-cell">
                                        {formatDateTime(user.last_login_at)}
                                    </td>
                                    <td className="py-2.5 pr-4 pl-3 text-right">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-[26px] px-2 py-0.5 text-xs gap-1.5"
                                            onClick={() => setPermUser(user)}
                                        >
                                            <KeyRound size={11} />
                                            {user.permissions.length}
                                        </Button>
                                    </td>
                                    <td className="py-2.5 pr-4 pl-3 text-right">
                                        <MagicLinkButton user={user} />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <p className="text-[11px] text-muted-foreground/40">
                Status refreshes automatically every 15 s.
            </p>

            <UserPermissionsDialog
                user={permUser}
                rolePermissions={rolePermissions}
                onClose={() => setPermUser(null)}
                onUpdated={updated => {
                    setPermUser(updated);
                    void reload();
                }}
            />
        </div>
    );
}
