import { useState } from "react";
import {
    Link2,
    MoreHorizontal,
    Pencil,
    Power,
    PowerOff,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAppSelector } from "@/store/hooks";
import type { AdminUser } from "@/types/admin.types";
import { Role } from "@/types";
import { Button } from "@pes/ui/components/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@pes/ui/components/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@pes/ui/components/dialog";
import { Input } from "@pes/ui/components/input";
import { ConfirmDeleteDialog } from "@/components/common/dialogs/confirm-delete-dialog";

const API_URL = import.meta.env.VITE_API_URL;

interface UserActionsMenuProps {
    user: AdminUser;
    /** Called after any successful mutation so the listing can reload */
    onChanged: () => void;
}

export function UserActionsMenu({ user, onChanged }: UserActionsMenuProps) {
    const token = useAppSelector(state => state.auth.token);
    const me = useAppSelector(state => state.auth.user);

    const [magicLoading, setMagicLoading] = useState(false);
    const [renameOpen, setRenameOpen] = useState(false);
    const [renameValue, setRenameValue] = useState(user.display_name ?? "");
    const [renaming, setRenaming] = useState(false);
    const [activeBusy, setActiveBusy] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const label = user.display_name ?? user.id;

    // Guardrails mirrored from the API: ephemeral guests aren't persisted,
    // HOST is bootstrap-only, and you can't destroy your own account.
    const isSelf = user.id === me?.id;
    const isHost = user.role === Role.HOST;
    const isEphemeral = user.is_ephemeral;

    const canRename = !isEphemeral && !isHost;
    const canToggleActive = !isEphemeral && !isHost && !isSelf;
    const canDelete = !isEphemeral && !isHost && !isSelf;
    const canGenerateLink = !isEphemeral;

    async function request(path: string, init: RequestInit): Promise<Response> {
        if (!token) throw new Error("Not authenticated");
        const response = await fetch(`${API_URL}${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(init.headers ?? {}),
            },
        });
        if (!response.ok) {
            throw new Error(`Failed (${response.status}): ${await response.text()}`);
        }
        return response;
    }

    async function generateMagicLink() {
        setMagicLoading(true);
        try {
            const response = await request(`/admin/users/${user.id}/magic-link`, {
                method: "POST",
            });
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
            setMagicLoading(false);
        }
    }

    async function saveDisplayName() {
        const name = renameValue.trim();
        if (!name || name.length > 32) {
            toast.error("Invalid display name", {
                description: "It must be between 1 and 32 characters",
                position: "top-right",
            });
            return;
        }

        setRenaming(true);
        try {
            await request(`/admin/users/${user.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ display_name: name }),
            });
            toast.success("Display name updated", {
                description: `${label} is now ${name}`,
                position: "bottom-right",
            });
            setRenameOpen(false);
            onChanged();
        } catch (err) {
            toast.error("Can't update display name", {
                description: err instanceof Error ? err.message : "Network error",
                position: "top-right",
            });
        } finally {
            setRenaming(false);
        }
    }

    async function toggleActive() {
        const nextActive = !user.is_active;
        setActiveBusy(true);
        try {
            await request(`/admin/users/${user.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: nextActive }),
            });
            toast.success(nextActive ? "User activated" : "User deactivated", {
                description: nextActive
                    ? `${label} can log in again`
                    : `${label} was signed out and can no longer log in`,
                position: "bottom-right",
            });
            onChanged();
        } catch (err) {
            toast.error("Can't update status", {
                description: err instanceof Error ? err.message : "Network error",
                position: "top-right",
            });
        } finally {
            setActiveBusy(false);
        }
    }

    async function confirmDelete() {
        setDeleting(true);
        try {
            await request(`/admin/users/${user.id}`, { method: "DELETE" });
            toast.success(`User '${label}' deleted`, {
                description: "Their magic links were revoked",
                position: "bottom-right",
            });
            setDeleteOpen(false);
            onChanged();
        } catch (err) {
            toast.error("Can't delete user", {
                description: err instanceof Error ? err.message : "Network error",
                position: "top-right",
            });
        } finally {
            setDeleting(false);
        }
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-[26px] w-[26px] text-muted-foreground/70 hover:text-foreground"
                        title="User actions"
                    >
                        <MoreHorizontal size={14} />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem
                        disabled={!canGenerateLink || magicLoading}
                        onClick={() => void generateMagicLink()}
                    >
                        {magicLoading ? (
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                            <Link2 />
                        )}
                        Generate magic link
                    </DropdownMenuItem>
                    {canRename && (
                        <DropdownMenuItem
                            onClick={() => {
                                setRenameValue(user.display_name ?? "");
                                setRenameOpen(true);
                            }}
                        >
                            <Pencil />
                            Edit display name
                        </DropdownMenuItem>
                    )}
                    {canToggleActive && (
                        <DropdownMenuItem
                            disabled={activeBusy}
                            onClick={() => void toggleActive()}
                        >
                            {user.is_active ? <PowerOff /> : <Power />}
                            {user.is_active ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                    )}
                    {canDelete && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setDeleteOpen(true)}
                            >
                                <Trash2 />
                                Delete user
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={renameOpen} onOpenChange={open => !renaming && setRenameOpen(open)}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Edit display name</DialogTitle>
                        <DialogDescription>
                            Rename <span className="font-mono">{label}</span>. The user sees the new name right away.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        id="form-rename-user"
                        className="py-1"
                        onSubmit={event => {
                            event.preventDefault();
                            void saveDisplayName();
                        }}
                    >
                        <Input
                            value={renameValue}
                            onChange={event => setRenameValue(event.target.value)}
                            maxLength={32}
                            placeholder="Display name"
                            autoComplete="off"
                            autoFocus
                        />
                    </form>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setRenameOpen(false)}
                            disabled={renaming}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" form="form-rename-user" disabled={renaming}>
                            {renaming && (
                                <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            )}
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDeleteDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title={`Delete user '${label}'?`}
                description="The account and its magic links are permanently removed. This cannot be undone."
                warning={
                    user.is_online
                        ? "This user is currently online and will be signed out immediately."
                        : null
                }
                actionLabel="Delete user"
                busy={deleting}
                onConfirm={() => void confirmDelete()}
            />
        </>
    );
}
