import { useState } from "react";
import {
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
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@pes/ui/components/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@pes/ui/components/dropdown-menu";

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
        <Card className="flex flex-col">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
                <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 font-mono text-base">
                        <span className="truncate">{profile.name}</span>
                        {profile.builtin && (
                            <Badge variant="secondary" className="text-[10px]">
                                built-in
                            </Badge>
                        )}
                    </CardTitle>
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
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
                            <DropdownMenuItem onClick={() => setDuplicateOpen(true)}>
                                <Copy /> Duplicate
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => onExport(profile.name)}>
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
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-4">
                <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                    {profile.description || "No description"}
                </p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        {profile.unit_count} unit{profile.unit_count > 1 ? "s" : ""}
                    </span>
                    <span>
                        {profile.ramp_count} ramp{profile.ramp_count > 1 ? "s" : ""}
                    </span>
                    <span className="ml-auto">
                        {formatDateTime(profile.modified_at)}
                    </span>
                </div>

                <Button
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
            </CardContent>

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
