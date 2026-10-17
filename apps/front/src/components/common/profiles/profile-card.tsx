import { useState } from "react";
import {
    Activity,
    Copy,
    Download,
    Layers,
    MoreVertical,
    Pencil,
    Play,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@pes/ui/components/badge";
import { Button } from "@pes/ui/components/button";
import { Card } from "@pes/ui/components/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@pes/ui/components/dropdown-menu";
import { cn } from "@pes/ui/lib/utils";

import { ConfirmDeleteDialog } from "@/components/common/dialogs/confirm-delete-dialog";
import { useWebSocket } from "@/hooks/useWebSocket";
import { formatDateTime } from "@/lib/format-date";
import type { ProfileSummary } from "@/types";

import { ApplyProfileDialog } from "./apply-profile-dialog";
import { DuplicateProfileDialog } from "./duplicate-profile-dialog";
import { EditProfileDialog } from "./edit-profile-dialog";

type ProfileCardProps = {
    profile: ProfileSummary;
    canApply: boolean;
    canWrite: boolean;
    canDelete: boolean;
    onExport: (name: string) => void;
};

export function ProfileCard({
    profile,
    canApply,
    canWrite,
    canDelete,
    onExport,
}: ProfileCardProps) {
    const { sendCommand } = useWebSocket();
    const [applyOpen, setApplyOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [duplicateOpen, setDuplicateOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const handleDelete = async () => {
        setDeleting(true);
        try {
            const result = await sendCommand("profiles:delete", {
                name: profile.name,
            });
            if (result.status === "ok") {
                toast.success(`Profile "${profile.name}" deleted`, {
                    position: "bottom-right",
                });
                setDeleteOpen(false);
                return;
            }
            toast.error("Failed to delete profile", {
                description: result.message ?? undefined,
                position: "bottom-right",
            });
        } catch (error) {
            toast.error("Failed to delete profile", {
                description: error instanceof Error ? error.message : undefined,
                position: "bottom-right",
            });
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Card className="flex min-h-[170px] flex-col gap-2.5 p-4">
            <div className="flex items-center gap-2.5">
                <span
                    className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-[13px] font-semibold",
                        profile.builtin
                            ? "bg-muted text-foreground/80"
                            : "bg-purple-500/15 text-purple-700 dark:text-purple-200",
                    )}
                >
                    {profile.name.charAt(0).toUpperCase()}
                </span>

                <span className="line-clamp-2 min-w-0 text-[13px] font-medium">
                    {profile.name}
                </span>

                <Badge
                    variant="secondary"
                    className={cn(
                        "shrink-0 rounded-full border px-2 py-[3px] font-mono text-[10px] font-medium",
                        profile.builtin
                            ? "border-slate-500/30 bg-slate-500/15 text-slate-700 dark:text-slate-300"
                            : "border-purple-500/30 bg-purple-500/15 text-purple-700 dark:text-purple-200",
                    )}
                >
                    {profile.builtin ? "built-in" : "custom"}
                </Badge>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="ml-auto h-7 w-7 shrink-0"
                        >
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {canWrite && (
                            <DropdownMenuItem onClick={() => setEditOpen(true)}>
                                <Pencil /> Edit
                            </DropdownMenuItem>
                        )}
                        {canWrite && (
                            <DropdownMenuItem
                                onClick={() => setDuplicateOpen(true)}
                            >
                                <Copy /> Duplicate
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                            onClick={() => onExport(profile.name)}
                        >
                            <Download /> Export JSON
                        </DropdownMenuItem>
                        {canDelete && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => setDeleteOpen(true)}
                                >
                                    <Trash2 /> Delete
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {profile.description && (
                <p className="line-clamp-1 text-[11px] text-muted-foreground">
                    {profile.description}
                </p>
            )}

            <div className="flex items-center gap-x-3.5 gap-y-1 font-mono text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                    <Layers className="h-3 w-3 shrink-0" />
                    {profile.unit_count} unit
                    {profile.unit_count === 1 ? "" : "s"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <Activity className="h-3 w-3 shrink-0" />
                    {profile.ramp_count} ramp
                    {profile.ramp_count === 1 ? "" : "s"}
                </span>
                <span className="ml-auto whitespace-nowrap">
                    {formatDateTime(profile.modified_at)}
                </span>
            </div>

            <Button
                variant="outline"
                className="mt-auto w-full"
                disabled={!canApply}
                title={
                    canApply
                        ? undefined
                        : "Requires permission to control units"
                }
                onClick={() => setApplyOpen(true)}
            >
                <Play className="h-4 w-4" /> Apply
            </Button>

            <ApplyProfileDialog
                profile={profile}
                open={applyOpen}
                onOpenChange={setApplyOpen}
            />
            <EditProfileDialog
                profile={profile}
                open={editOpen}
                onOpenChange={setEditOpen}
            />
            <DuplicateProfileDialog
                profile={profile}
                open={duplicateOpen}
                onOpenChange={setDuplicateOpen}
            />
            <ConfirmDeleteDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title={`Delete profile "${profile.name}"?`}
                description="The profile file is removed from the server. This cannot be undone."
                busy={deleting}
                onConfirm={handleDelete}
            />
        </Card>
    );
}
