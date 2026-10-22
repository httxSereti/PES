import { useMemo, useState } from "react";
import {
    Copy,
    Download,
    MoreVertical,
    Pencil,
    Play,
    Trash2,
} from "lucide-react";

import { Button } from "@pes/ui/components/button";
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
import {
    buildProfilePreview,
    descriptionTags,
    formatClock,
    shapeAreaPath,
    shapeLinePath,
} from "./profile-shape";
import { useProfileDelete } from "./use-profile-delete";

type ProfileInspectorProps = {
    profile: ProfileSummary;
    canApply: boolean;
    canWrite: boolean;
    canDelete: boolean;
    onExport: (name: string) => void;
};

/** A/B are the stim channels (violet/blue), C is the adjuster lane (slate). */
const LANE_COLORS: Record<string, string> = {
    A: "text-purple-500 dark:text-purple-400",
    B: "text-blue-500 dark:text-blue-400",
    C: "text-slate-500",
};

const AXIS_TICKS = 5;
const CHART_WIDTH = 100;
const CHART_HEIGHT = 100;
const CHART_PADDING = 8;
const GRID_LEVELS = [0, 25, 50, 75, 100] as const;

function gridY(level: number): number {
    return (
        CHART_PADDING +
        ((CHART_HEIGHT - CHART_PADDING * 2) * (100 - level)) / 100
    );
}

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
    const dispatch = useAppDispatch();
    const [applyOpen, setApplyOpen] = useState(false);
    const [duplicateOpen, setDuplicateOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const { deleting, warning, requestDelete, reset } = useProfileDelete(
        profile,
        setDeleteOpen,
    );

    const preview = useMemo(() => buildProfilePreview(profile), [profile]);
    const tags = descriptionTags(profile.description);
    const durationSeconds = preview.durationSeconds;

    return (
        <div className="flex w-full flex-col gap-4 rounded-xl border bg-card p-4 md:gap-[18px] md:p-5 2xl:w-[580px] 2xl:shrink-0">
            <div className="flex items-start gap-3">
                <ProfileMonogram
                    name={profile.name}
                    legacy={profile.legacy}
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
                        <ProfileTypeBadge legacy={profile.legacy} />
                        <span className="font-mono text-[10px] text-muted-foreground">
                            Updated {formatDateTime(profile.modified_at)}
                        </span>
                    </div>
                    {(profile.created_by || profile.updated_by) && (
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 font-mono text-[10px] text-muted-foreground">
                            {profile.created_by && (
                                <span
                                    title={`Created ${formatDateTime(profile.created_at)}`}
                                >
                                    created by {profile.created_by}
                                </span>
                            )}
                            {profile.updated_by && (
                                <span
                                    title={`Last edit ${formatDateTime(profile.updated_at)}`}
                                >
                                    updated by {profile.updated_by}
                                </span>
                            )}
                        </div>
                    )}
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

                <div className="flex flex-col gap-2 rounded-[10px] border border-border/60 bg-muted/20 p-3 md:p-4">
                    {preview.lanes.map((lane) => (
                        <div key={lane.label} className="flex items-end gap-2">
                            <span className="w-2.5 pb-0.5 text-center font-mono text-[10px] text-muted-foreground">
                                {lane.label}
                            </span>
                            <div className="relative h-20 flex-1 overflow-hidden rounded-lg bg-muted/40 px-2 md:h-[120px]">
                                <svg
                                    viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                                    preserveAspectRatio="none"
                                    className={`h-full w-full ${
                                        LANE_COLORS[lane.label] ??
                                        "text-slate-500"
                                    }`}
                                    aria-hidden="true"
                                >
                                    {GRID_LEVELS.map((level) => (
                                        <line
                                            key={level}
                                            x1={0}
                                            y1={gridY(level)}
                                            x2={CHART_WIDTH}
                                            y2={gridY(level)}
                                            stroke="currentColor"
                                            strokeOpacity={0.08}
                                            strokeWidth={1}
                                            vectorEffect="non-scaling-stroke"
                                        />
                                    ))}

                                    {lane.samples.length > 0 ? (
                                        <>
                                            <path
                                                d={shapeAreaPath(
                                                    lane.samples,
                                                    CHART_WIDTH,
                                                    CHART_HEIGHT,
                                                    CHART_PADDING,
                                                )}
                                                fill="currentColor"
                                                fillOpacity={0.12}
                                            />
                                            <path
                                                d={shapeLinePath(
                                                    lane.samples,
                                                    CHART_WIDTH,
                                                    CHART_HEIGHT,
                                                    CHART_PADDING,
                                                )}
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth={2}
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                vectorEffect="non-scaling-stroke"
                                            />
                                        </>
                                    ) : (
                                        <line
                                            x1={0}
                                            y1={gridY(0)}
                                            x2={CHART_WIDTH}
                                            y2={gridY(0)}
                                            stroke="currentColor"
                                            strokeWidth={1.5}
                                            strokeDasharray="2 3"
                                            strokeLinecap="round"
                                            strokeOpacity={0.5}
                                            vectorEffect="non-scaling-stroke"
                                        />
                                    )}
                                </svg>
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
                        value={profile.legacy ? "Legacy" : "Custom"}
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
                    onClick={() => dispatch(openProfileEdit(profile.name))}
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
        </div>
    );
}
