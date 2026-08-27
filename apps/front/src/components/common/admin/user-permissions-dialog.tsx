import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useAppSelector } from "@/store/hooks";
import type { AdminUser, RolePermissionMap } from "@/types/admin.types";
import { Permission } from "@/types";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@pes/ui/components/dialog";
import { Switch } from "@pes/ui/components/switch";
import { Separator } from "@pes/ui/components/separator";

const API_URL = import.meta.env.VITE_API_URL;

/** Permission groups for display (prefix-based). */
const PERM_GROUPS: Array<{ label: string; match: (p: string) => boolean }> = [
    { label: "Read", match: p => p.startsWith("read_") },
    { label: "Write", match: p => p.startsWith("write_") },
    { label: "Manage", match: p => p.startsWith("manage_") },
    { label: "Special", match: () => true },
];

const ALL_PERMISSIONS = Object.values(Permission);

interface UserPermissionsDialogProps {
    user: AdminUser | null;
    rolePermissions: RolePermissionMap | null;
    onClose: () => void;
    /** Receives the updated user returned by the API */
    onUpdated: (user: AdminUser) => void;
}

export function UserPermissionsDialog({
    user,
    rolePermissions,
    onClose,
    onUpdated,
}: UserPermissionsDialogProps) {
    const token = useAppSelector(state => state.auth.token);
    const [saving, setSaving] = useState<Set<string>>(new Set());

    if (!user) return null;

    const isRootTarget = user.role === "root";

    async function toggle(permission: Permission, granted: boolean) {
        if (!user || !token) return;

        setSaving(prev => new Set(prev).add(permission));
        try {
            const response = await fetch(
                `${API_URL}/admin/users/${user.id}/permissions`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(
                        granted
                            ? { grant: [permission] }
                            : { revoke: [permission] }
                    ),
                }
            );

            if (!response.ok) {
                throw new Error(`Failed (${response.status}): ${await response.text()}`);
            }

            onUpdated(await response.json());
        } catch (err) {
            toast.error("Can't update permissions", {
                description: err instanceof Error ? err.message : "Network error",
                position: "top-right",
            });
        } finally {
            setSaving(prev => {
                const next = new Set(prev);
                next.delete(permission);
                return next;
            });
        }
    }

    return (
        <Dialog open={!!user} onOpenChange={open => !open && onClose()}>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <KeyRound size={14} className="accent-tile-icon" />
                        Permissions — <span className="font-mono">{user.display_name ?? user.id}</span>
                    </DialogTitle>
                    <DialogDescription>
                        Effective permissions = role bundle + custom grants. Custom grants are per-user and survive role changes.
                    </DialogDescription>
                </DialogHeader>

                <Separator />

                {isRootTarget && (
                    <p className="text-xs text-muted-foreground/70">
                        ROOT bypasses every permission check — the toggles below have no effect.
                    </p>
                )}

                <div className="space-y-4">
                    {PERM_GROUPS.map(({ label, match }) => {
                        const perms = ALL_PERMISSIONS.filter(p => match(p));
                        if (perms.length === 0) return null;
                        return (
                            <div key={label} className="space-y-1">
                                <div className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold">
                                    {label}
                                </div>
                                {perms.map(permission => {
                                    const viaRole = rolePermissions?.[user.role]?.includes(permission) ?? false;
                                    const effective = user.permissions.includes(permission);
                                    const isSaving = saving.has(permission);

                                    return (
                                        <div
                                            key={permission}
                                            className="flex items-center gap-2 py-1 border-b border-border/40 last:border-b-0"
                                        >
                                            <code className="font-mono text-[11px] text-foreground/80">{permission}</code>
                                            {viaRole && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-violet-500/10 border border-violet-500/25 text-violet-700 dark:text-violet-300 uppercase tracking-wide">
                                                    <ShieldCheck size={9} />
                                                    via role
                                                </span>
                                            )}
                                            {!viaRole && user.custom_permissions.includes(permission) && (
                                                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
                                                    custom
                                                </span>
                                            )}
                                            <div className="ml-auto">
                                                <Switch
                                                    checked={effective}
                                                    disabled={viaRole || isSaving || isRootTarget}
                                                    onCheckedChange={checked => void toggle(permission, checked)}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </DialogContent>
        </Dialog>
    );
}
