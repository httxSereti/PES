import { useState, useMemo } from "react";
import { KeyRound, RefreshCw, Search, UserCheck, UsersRound, X } from "lucide-react";
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
import { Input } from "@pes/ui/components/input";
import { Skeleton } from "@pes/ui/components/skeleton";
import { UserPermissionsDialog } from "@/components/common/admin/user-permissions-dialog";
import { UserActionsMenu } from "@/components/common/admin/user-actions-menu";

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
    host: "Host",
};

/** Roles an admin may assign from the UI (HOST is bootstrap-only). */
const ASSIGNABLE_ROLES = Object.values(Role).filter(r => r !== Role.HOST);

const ROLE_FILTERS = [
    { label: "All roles", value: "all" },
    ...ASSIGNABLE_ROLES.map(role => ({
        label: ROLE_LABELS[role] ?? role,
        value: role as string,
    })),
];

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

    // Safety rails: never reassign HOST, never change your own role here
    const locked = user.role === Role.HOST || user.id === me?.id;

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
                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border font-mono ${user.role === Role.HOST
                    ? "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300"
                    : "bg-muted/50 text-muted-foreground/60 border-border"
                }`}
                title={user.role === Role.HOST ? "HOST role can't be changed" : "You can't change your own role"}
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

export default function UsersAdminPage() {
    const { users, rolePermissions, error, reload } = useAdminUsers();
    const me = useAppSelector(state => state.auth.user);
    const [permUser, setPermUser] = useState<AdminUser | null>(null);
    const [query, setQuery] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");

    const stats = useMemo(() => ({
        total: users?.length ?? 0,
        online: users?.filter(u => u.is_online).length ?? 0,
    }), [users]);

    // HOST accounts are shown pinned above the table, not in the list
    const hostUsers = useMemo(
        () => users?.filter(user => user.role === Role.HOST) ?? [],
        [users]
    );
    const listTotal = stats.total - hostUsers.length;

    const isFiltered = query.trim().length > 0 || roleFilter !== "all";

    const filteredUsers = useMemo(() => {
        if (!users) return null;
        const needle = query.trim().toLowerCase();
        return users.filter(user => {
            if (user.role === Role.HOST) return false;
            if (roleFilter !== "all" && user.role !== roleFilter) return false;
            if (!needle) return true;
            const name = user.display_name?.toLowerCase() ?? "";
            const role = (ROLE_LABELS[user.role] ?? user.role).toLowerCase();
            return (
                name.includes(needle) ||
                user.id.toLowerCase().includes(needle) ||
                role.includes(needle)
            );
        });
    }, [users, query, roleFilter]);

    const clearFilters = () => {
        setQuery("");
        setRoleFilter("all");
    };

    return (
        <div className="space-y-4 px-4 md:px-5">
            {/* Page header */}
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-3">
                <div className="flex-col">
                    <h1 className="font-syne text-xl sm:text-2xl lg:text-[26px] font-extrabold">
                        Users
                    </h1>
                    <div className="text-muted-foreground text-xs">
                        Accounts, roles and permissions for everyone who can access PES
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md accent-tile">
                        <UsersRound size={11} className="accent-tile-icon" />
                        <span className="font-mono-dm text-[11px] accent-tile-icon tracking-[0.06em] tabular-nums">
                            {stats.total}
                        </span>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void reload()}
                    >
                        <RefreshCw size={14} />
                        <span>Refresh</span>
                    </Button>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
                <div className="relative">
                    <Search
                        size={13}
                        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50"
                    />
                    <Input
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder="Search users…"
                        spellCheck={false}
                        className="h-[28px] w-[190px] pl-7 pr-7 text-xs"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => setQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                            title="Clear search"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>

                <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="h-[28px] w-[128px] text-xs bg-muted/50 border-border rounded-md font-normal">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {ROLE_FILTERS.map(({ label, value }) => (
                            <SelectItem key={value} value={value} className="text-xs">
                                {label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                    <UserCheck size={13} className="text-emerald-500" />
                    {isFiltered && filteredUsers ? (
                        <>
                            <span className="tabular-nums">{filteredUsers.length}</span>
                            <span>of</span>
                            <span className="tabular-nums">{listTotal}</span>
                            <span>users</span>
                        </>
                    ) : (
                        <>
                            <span className="tabular-nums">{stats.online}</span>
                            <span>online</span>
                            <span className="text-muted-foreground/30">·</span>
                            <span className="tabular-nums">{stats.total}</span>
                            <span>users</span>
                        </>
                    )}
                </div>

                {isFiltered && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-[26px] px-2 text-xs text-muted-foreground/70 hover:text-foreground"
                        onClick={clearFilters}
                    >
                        Clear filters
                    </Button>
                )}

                {error && (
                    <span className="text-xs text-destructive">{error}</span>
                )}
            </div>

            {/* HOST — pinned above the table (bootstrap-only account) */}
            {hostUsers.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.05] divide-y divide-amber-500/15">
                    {hostUsers.map(host => (
                        <div key={host.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold border bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300">
                                    {initials(host)}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 font-mono text-xs text-foreground">
                                        <span className="truncate max-w-[160px]">{host.display_name ?? "—"}</span>
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-medium uppercase tracking-wide bg-amber-500/15 text-amber-700 border border-amber-500/30 dark:text-amber-300">
                                            Host
                                        </span>
                                        {host.id === me?.id && (
                                            <span className="text-[9px] uppercase tracking-wide text-muted-foreground/50">you</span>
                                        )}
                                    </div>
                                    <div className="font-mono text-[10px] text-muted-foreground/40 truncate max-w-[220px]">{host.id}</div>
                                </div>
                            </div>

                            <div className="ml-auto flex items-center gap-1.5">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-[26px] px-2 py-0.5 text-xs gap-1.5"
                                    onClick={() => setPermUser(host)}
                                >
                                    <KeyRound size={11} />
                                    {host.permissions.length}
                                </Button>
                                <UserActionsMenu user={host} onChanged={() => void reload()} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Users — cards on mobile */}
            <div className="md:hidden space-y-2">
                {!filteredUsers ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
                    ))
                ) : filteredUsers.length === 0 ? (
                    <div className="rounded-xl border border-border py-16 text-center text-sm text-muted-foreground/40 italic">
                        {isFiltered ? "No users match your filters" : "No other users yet"}
                    </div>
                ) : (
                    <div className="rounded-xl border border-border divide-y divide-border/40">
                        {filteredUsers.map(user => (
                            <div key={user.id} className="flex items-center gap-3 px-3.5 py-3">
                                <div className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold border ${user.is_online
                                    ? "accent-tile accent-tile-icon"
                                    : "bg-muted/60 text-muted-foreground/60 border-border"
                                    }`}>
                                    {initials(user)}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="font-mono text-xs text-foreground truncate">
                                            {user.display_name ?? "—"}
                                        </span>
                                        {user.is_ephemeral && (
                                            <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground/50">guest</span>
                                        )}
                                        {!user.is_active && (
                                            <span className="shrink-0 text-[9px] uppercase tracking-wide text-red-500/80">inactive</span>
                                        )}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <RoleSelect user={user} onChanged={() => void reload()} />
                                        <span className="flex items-center gap-1.5 text-[10px] whitespace-nowrap">
                                            <OnlineDot online={user.is_online} />
                                            <span className={user.is_online ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/50"}>
                                                {user.is_online ? "Online" : "Offline"}
                                            </span>
                                        </span>
                                    </div>
                                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/40 truncate">{user.id}</div>
                                </div>

                                <div className="flex shrink-0 flex-col items-end gap-1.5">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-[26px] px-2 py-0.5 text-xs gap-1.5"
                                        onClick={() => setPermUser(user)}
                                    >
                                        <KeyRound size={11} />
                                        {user.permissions.length}
                                    </Button>
                                    <UserActionsMenu user={user} onChanged={() => void reload()} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Users — table on md+ */}
            <div className="hidden md:block rounded-xl border border-border overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border bg-muted/40">
                            {["User", "Role", "Status", "Created", "Last login", "Permissions", "Actions"].map(h => (
                                <th key={h} className="py-2.5 px-3 first:pl-4 last:pr-4 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 whitespace-nowrap">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {!filteredUsers ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <tr key={i}>
                                    <td colSpan={7} className="py-2 px-4">
                                        <Skeleton className="h-8 w-full" />
                                    </td>
                                </tr>
                            ))
                        ) : filteredUsers.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="py-16 text-center text-sm text-muted-foreground/40 italic">
                                    {isFiltered ? "No users match your filters" : "No other users yet"}
                                </td>
                            </tr>
                        ) : (
                            filteredUsers.map(user => (
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
                                                    {user.is_ephemeral && (
                                                        <span className="ml-1.5 text-[9px] uppercase tracking-wide text-muted-foreground/50">guest</span>
                                                    )}
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
                                    <td className="py-2.5 pl-3 pr-4 text-right">
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
                                        <UserActionsMenu user={user} onChanged={() => void reload()} />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <p className="text-[11px] text-muted-foreground/40">
                Status refreshes automatically every 15 s. Deleting a user revokes their magic links and signs them out.
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
