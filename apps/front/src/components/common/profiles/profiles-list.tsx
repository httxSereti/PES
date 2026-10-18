import { useEffect, useState, type KeyboardEvent } from "react";
import { Play } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { cn } from "@pes/ui/lib/utils";

import { formatDateTime } from "@/lib/format-date";
import type { ProfileSummary } from "@/types";

import { ApplyProfileDialog } from "./apply-profile-dialog";
import { ProfileInspector } from "./profile-inspector";
import { ProfileMonogram } from "./profile-badges";
import { sparklineBars } from "./profile-shape";

type ProfilesListProps = {
    profiles: ProfileSummary[];
    canApply: boolean;
    canWrite: boolean;
    canDelete: boolean;
    onExport: (name: string) => void;
};

/** Intensity envelope of the profile's real ramps, sampled over one program window. */
function ShapeSparkline({
    profile,
    active,
    className,
}: {
    profile: ProfileSummary;
    active: boolean;
    className?: string;
}) {
    const bars = sparklineBars(profile);
    return (
        <div
            className={cn(
                "flex h-6 w-[88px] shrink-0 items-end gap-[2px]",
                className,
            )}
        >
            {bars.map((height, index) => (
                <span
                    key={index}
                    style={{
                        height: `${height}%`,
                        opacity: active
                            ? 1
                            : 0.45 +
                              (0.45 * index) / Math.max(bars.length - 1, 1),
                    }}
                    className={cn(
                        "min-w-0 flex-1 rounded-[2px]",
                        active ? "bg-purple-500" : "bg-slate-500",
                    )}
                />
            ))}
        </div>
    );
}

/**
 * Pill-shaped apply button that opens the apply dialog. Shared by the desktop
 * row and the mobile card; the surrounding row keeps its own click handling.
 */
function ProfileApplyButton({
    profile,
    canApply,
    className,
}: {
    profile: ProfileSummary;
    canApply: boolean;
    className?: string;
}) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button
                variant="secondary"
                size="icon-sm"
                className={cn("shrink-0 rounded-lg", className)}
                disabled={!canApply}
                title={
                    canApply
                        ? "Apply profile"
                        : "Requires permission to control units"
                }
                onClick={(event) => {
                    event.stopPropagation();
                    setOpen(true);
                }}
            >
                <Play className="size-3" />
            </Button>
            <ApplyProfileDialog
                profile={profile}
                open={open}
                onOpenChange={setOpen}
            />
        </>
    );
}

type ProfileRowProps = {
    profile: ProfileSummary;
    selected: boolean;
    canApply: boolean;
    onSelect: () => void;
};

/** Selection/keyboard props shared by the desktop and mobile rows. */
function rowInteractionProps(selected: boolean, onSelect: () => void) {
    return {
        role: "button" as const,
        tabIndex: 0,
        "aria-pressed": selected,
        onClick: onSelect,
        onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect();
            }
        },
    };
}

/** Desktop table row (lg and up, where the columns fit next to the sidebar). */
function ProfileListRow({
    profile,
    selected,
    canApply,
    onSelect,
}: ProfileRowProps) {
    const interaction = rowInteractionProps(selected, onSelect);

    return (
        <div
            {...interaction}
            className={cn(
                "flex h-12 cursor-pointer items-center gap-4 border-l-2 px-4 transition",
                selected
                    ? "border-l-purple-500 bg-muted/40"
                    : "border-l-transparent hover:bg-muted/20",
            )}
        >
            <ProfileMonogram
                name={profile.name}
                legacy={profile.legacy}
                className="h-[26px] w-[26px] rounded-[7px] text-[11px]"
            />

            <span className="flex min-w-0 flex-1 flex-col justify-center">
                <span className="truncate text-[13px] font-medium">
                    {profile.name}
                </span>
                {profile.description && (
                    <span className="truncate text-[11px] text-muted-foreground">
                        {profile.description}
                    </span>
                )}
            </span>

            <ShapeSparkline profile={profile} active={selected} />

            <span className="w-[60px] shrink-0 text-[11px] text-muted-foreground">
                {profile.unit_count} unit
                {profile.unit_count === 1 ? "" : "s"}
            </span>
            <span className="w-[60px] shrink-0 text-[11px] text-muted-foreground">
                {profile.ramp_count} ramp
                {profile.ramp_count === 1 ? "" : "s"}
            </span>
            <span className="w-[98px] shrink-0 font-mono text-[10px] text-muted-foreground">
                {formatDateTime(profile.modified_at)}
            </span>

            <ProfileApplyButton
                profile={profile}
                canApply={canApply}
                className={cn(
                    "h-7 w-7",
                    selected &&
                        "bg-purple-500 text-white hover:bg-purple-500/90",
                )}
            />
        </div>
    );
}

/** Stacked card row used below lg, where the table columns do not fit. */
function ProfileMobileRow({
    profile,
    selected,
    canApply,
    onSelect,
}: ProfileRowProps) {
    const interaction = rowInteractionProps(selected, onSelect);

    return (
        <div
            {...interaction}
            className={cn(
                "flex cursor-pointer flex-col gap-2.5 border-l-2 px-4 py-3 transition",
                selected
                    ? "border-l-purple-500 bg-muted/40"
                    : "border-l-transparent hover:bg-muted/20",
            )}
        >
            <div className="flex items-center gap-3">
                <ProfileMonogram
                    name={profile.name}
                    legacy={profile.legacy}
                    className="h-[26px] w-[26px] rounded-[7px] text-[11px]"
                />

                <span className="flex min-w-0 flex-1 flex-col justify-center">
                    <span className="truncate text-[13px] font-medium">
                        {profile.name}
                    </span>
                    {profile.description && (
                        <span className="truncate text-[11px] text-muted-foreground">
                            {profile.description}
                        </span>
                    )}
                </span>

                <ProfileApplyButton
                    profile={profile}
                    canApply={canApply}
                    className={cn(
                        selected &&
                            "bg-purple-500 text-white hover:bg-purple-500/90",
                    )}
                />
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-[38px]">
                <ShapeSparkline
                    profile={profile}
                    active={selected}
                    className="w-16"
                />
                <span className="truncate text-[11px] text-muted-foreground">
                    {profile.unit_count} unit
                    {profile.unit_count === 1 ? "" : "s"} · {profile.ramp_count}{" "}
                    ramp
                    {profile.ramp_count === 1 ? "" : "s"}
                </span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                    {formatDateTime(profile.modified_at)}
                </span>
            </div>
        </div>
    );
}

export function ProfilesList({
    profiles,
    canApply,
    canWrite,
    canDelete,
    onExport,
}: ProfilesListProps) {
    const [first] = profiles;
    const [selectedName, setSelectedName] = useState<string | null>(
        first?.name ?? null,
    );

    // Keep a valid selection when filters change or the profile disappears.
    useEffect(() => {
        if (!profiles.some((profile) => profile.name === selectedName)) {
            setSelectedName(profiles[0]?.name ?? null);
        }
    }, [profiles, selectedName]);

    if (!first) return null;
    const selected =
        profiles.find((profile) => profile.name === selectedName) ?? first;

    return (
        <div className="flex flex-col gap-4 px-4 pb-4 md:px-5 md:pb-5 2xl:flex-row">
            <div className="hidden min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card lg:flex">
                <div className="flex h-[30px] shrink-0 items-center gap-4 border-b px-4 font-mono text-[10px] tracking-[0.5px] text-muted-foreground uppercase">
                    <span className="flex-1">Profile</span>
                    <span className="w-[88px] shrink-0">Shape</span>
                    <span className="w-[60px] shrink-0">Units</span>
                    <span className="w-[60px] shrink-0">Ramps</span>
                    <span className="w-[98px] shrink-0">Updated</span>
                    <span className="w-7 shrink-0" aria-hidden="true" />
                </div>

                <div className="divide-y divide-border/60">
                    {profiles.map((profile) => (
                        <ProfileListRow
                            key={profile.name}
                            profile={profile}
                            selected={profile.name === selected.name}
                            canApply={canApply}
                            onSelect={() => setSelectedName(profile.name)}
                        />
                    ))}
                </div>
            </div>

            <div className="flex flex-col overflow-hidden rounded-xl border bg-card lg:hidden">
                <div className="divide-y divide-border/60">
                    {profiles.map((profile) => (
                        <ProfileMobileRow
                            key={profile.name}
                            profile={profile}
                            selected={profile.name === selected.name}
                            canApply={canApply}
                            onSelect={() => setSelectedName(profile.name)}
                        />
                    ))}
                </div>
            </div>

            <ProfileInspector
                profile={selected}
                canApply={canApply}
                canWrite={canWrite}
                canDelete={canDelete}
                onExport={onExport}
            />
        </div>
    );
}
