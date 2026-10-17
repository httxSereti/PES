import { useState } from "react";
import {
    Copy,
    Download,
    MoreVertical,
    Pencil,
    Play,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@pes/ui/components/button";
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
import { ProfileMonogram, ProfileTypeBadge } from "./profile-badges";
import {
    descriptionTags,
    formatClock,
    profileDurationSeconds,
    shapeBars,
} from "./profile-shape";

type ProfileInspectorProps = {
    profile: ProfileSummary;
    canApply: boolean;
    canWrite: boolean;
    canDelete: boolean;
    onExport: (name: string) => void;
};

/** Lane A/B are purple, lane C slate — mirrors the design export. */
const SHAPE_LANES = [
    { label: "A", start: 17, end: 90, bar: "bg-purple-500" },
    { label: "B", start: 13, end: 72, bar: "bg-purple-400" },
    { label: "C", start: 10, end: 54, bar: "bg-slate-500" },
] as const;

const AXIS_TICKS = 5;

function MetaCell({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-1 flex-col gap-[3px]">
            <span className="font-mono text-[9px] tracking-[0.5px] text-muted-foreground uppercase">
                {label}
            </span>
            <span className="text-[13px]">{value}</span>
        </div>
    );
}

export function ProfileInspector({
    profile,
    canApply,
    canWrite,
    canDelete,
    onExport,
}: ProfileInspectorProps) {
    const { sendCommand } = useWebSocket();
    const [applyOpen, setApplyOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [duplicateOpen, setDuplicateOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const tags = descriptionTags(profile.description);
    const durationSeconds = profileDurationSeconds(profile.ramp_count);

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
        <div className="flex w-full flex-col gap-[18px] rounded-xl border bg-card p-5 2xl:w-[580px] 2xl:shrink-0">
            <div className="flex items-start gap-3">
                <ProfileMonogram
                    name={profile.name}
                    builtin={profile.builtin}
                    className="h-11 w-11 rounded-[10px] text-base"
                />

                <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-[15px] leading-5 font-semibold">
                        {profile.name}
                    </div>
                    {profile.description && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                            {profile.description}
                        </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <ProfileTypeBadge builtin={profile.builtin} />
                        <span className="font-mono text-[10px] text-muted-foreground">
                            Updated {formatDateTime(profile.modified_at)}
                        </span>
                    </div>
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
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

            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.5px] text-muted-foreground">
                    <span className="uppercase">Program shape</span>
                    <span>
                        {profile.ramp_count} ramp
                        {profile.ramp_count === 1 ? "" : "s"}
                        {durationSeconds > 0 &&
                            ` · ${formatClock(durationSeconds)}`}
                    </span>
                </div>

                <div className="flex flex-col gap-2 rounded-[10px] border border-border/60 bg-muted/20 p-4">
                    {SHAPE_LANES.map((lane) => (
                        <div key={lane.label} className="flex items-end gap-2">
                            <span className="w-2.5 pb-0.5 text-center font-mono text-[10px] text-muted-foreground">
                                {lane.label}
                            </span>
                            <div className="flex h-[120px] flex-1 items-end gap-[3px] rounded-lg bg-muted/40 px-2">
                                {shapeBars(
                                    `${profile.name}#${lane.label}`,
                                    profile.ramp_count,
                                    lane.start,
                                    lane.end,
                                ).map((height, index) => (
                                    <span
                                        key={index}
                                        style={{ height: `${height}%` }}
                                        className={cn(
                                            "min-w-0 flex-1 rounded-[3px]",
                                            lane.bar,
                                        )}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}

                    {durationSeconds > 0 && (
                        <div className="flex items-start pl-5 pr-0.5">
                            {Array.from({ length: AXIS_TICKS }, (_, index) => (
                                <span
                                    key={index}
                                    className="flex-1 text-center font-mono text-[9px] text-muted-foreground/70"
                                >
                                    {formatClock(
                                        (durationSeconds * index) /
                                            (AXIS_TICKS - 1),
                                    )}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                        <span
                            key={tag}
                            className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground"
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            )}

            <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                    <MetaCell
                        label="Units"
                        value={`${profile.unit_count} unit${profile.unit_count === 1 ? "" : "s"}`}
                    />
                    <MetaCell
                        label="Ramps"
                        value={`${profile.ramp_count} ramp${profile.ramp_count === 1 ? "" : "s"}`}
                    />
                </div>
                <div className="flex gap-3">
                    <MetaCell
                        label="Type"
                        value={profile.builtin ? "Built-in" : "Custom"}
                    />
                    <MetaCell
                        label="Updated"
                        value={formatDateTime(profile.modified_at)}
                    />
                </div>
            </div>

            <div className="mt-auto flex items-center gap-2.5 pt-1">
                <Button
                    variant="outline"
                    size="icon-lg"
                    disabled={!canWrite}
                    title={
                        canWrite
                            ? "Duplicate profile"
                            : "Requires profile write permission"
                    }
                    onClick={() => setDuplicateOpen(true)}
                >
                    <Copy />
                </Button>
                <Button
                    variant="outline"
                    size="icon-lg"
                    disabled={!canWrite}
                    title={
                        canWrite
                            ? "Edit profile"
                            : "Requires profile write permission"
                    }
                    onClick={() => setEditOpen(true)}
                >
                    <Pencil />
                </Button>
                <Button
                    className="h-10 flex-1 bg-purple-500 text-white hover:bg-purple-500/90"
                    disabled={!canApply}
                    title={
                        canApply
                            ? undefined
                            : "Requires permission to control units"
                    }
                    onClick={() => setApplyOpen(true)}
                >
                    <Play className="h-4 w-4" /> Apply to all units
                </Button>
            </div>

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
        </div>
    );
}
