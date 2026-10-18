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

import { Button } from "@pes/ui/components/button";
import { Card } from "@pes/ui/components/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@pes/ui/components/dropdown-menu";

import { ConfirmDeleteDialog } from "@/components/common/dialogs/confirm-delete-dialog";
import { formatDateTime } from "@/lib/format-date";
import { useAppDispatch } from "@/store/hooks";
import { openProfileEdit } from "@/store/slices/profilesSlice";
import type { ProfileSummary } from "@/types";

import { ApplyProfileDialog } from "./apply-profile-dialog";
import { DuplicateProfileDialog } from "./duplicate-profile-dialog";
import { ProfileMonogram, ProfileTypeBadge } from "./profile-badges";
import { useProfileDelete } from "./use-profile-delete";

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
    const dispatch = useAppDispatch();
    const [applyOpen, setApplyOpen] = useState(false);
    const [duplicateOpen, setDuplicateOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const { deleting, warning, requestDelete, reset } = useProfileDelete(
        profile,
        setDeleteOpen,
    );

    return (
        <Card className="flex min-h-[170px] flex-col gap-2.5 p-4">
            <div className="flex items-center gap-2.5">
                <ProfileMonogram
                    name={profile.name}
                    legacy={profile.legacy}
                    className="h-7 w-7 rounded-lg text-[13px]"
                />

                <span className="line-clamp-2 min-w-0 text-[13px] font-medium">
                    {profile.name}
                </span>

                <ProfileTypeBadge legacy={profile.legacy} />

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
                            <DropdownMenuItem
                                onClick={() =>
                                    dispatch(openProfileEdit(profile.name))
                                }
                            >
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
            <DuplicateProfileDialog
                profile={profile}
                open={duplicateOpen}
                onOpenChange={setDuplicateOpen}
            />
            <ConfirmDeleteDialog
                open={deleteOpen}
                onOpenChange={(value) => {
                    setDeleteOpen(value);
                    if (!value) reset();
                }}
                title={`Delete profile "${profile.name}"?`}
                description="The profile file is removed from the server. This cannot be undone."
                warning={warning}
                actionLabel={warning ? "Delete anyway" : undefined}
                busy={deleting}
                onConfirm={() => requestDelete(warning != null)}
            />
        </Card>
    );
}
