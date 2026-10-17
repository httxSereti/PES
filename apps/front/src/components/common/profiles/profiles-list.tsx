import { useEffect, useState } from "react";
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
}: {
    profile: ProfileSummary;
    active: boolean;
}) {
    const bars = sparklineBars(profile);
    return (
        <div className="flex h-6 w-[88px] shrink-0 items-end gap-[2px]">
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

type ProfileListRowProps = {
    profile: ProfileSummary;
    selected: boolean;
    canApply: boolean;
    onSelect: () => void;
};

function ProfileListRow({
    profile,
    selected,
    canApply,
    onSelect,
}: ProfileListRowProps) {
    const [applyOpen, setApplyOpen] = useState(false);

    return (
        <>
            <div
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={onSelect}
                onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect();
                    }
                }}
                className={cn(
                    "flex h-12 cursor-pointer items-center gap-4 border-l-2 px-4 transition",
                    selected
                        ? "border-l-purple-500 bg-muted/40"
                        : "border-l-transparent hover:bg-muted/20",
                )}
            >
                <ProfileMonogram
                    name={profile.name}
                    builtin={profile.builtin}
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

                <Button
                    variant="secondary"
                    size="icon-sm"
                    className={cn(
                        "h-7 w-7 shrink-0 rounded-lg",
                        selected &&
                            "bg-purple-500 text-white hover:bg-purple-500/90",
                    )}
                    disabled={!canApply}
                    title={
                        canApply
                            ? "Apply profile"
                            : "Requires permission to control units"
                    }
                    onClick={(event) => {
                        event.stopPropagation();
                        setApplyOpen(true);
                    }}
                >
                    <Play className="size-3" />
                </Button>
            </div>

            <ApplyProfileDialog
                profile={profile}
                open={applyOpen}
                onOpenChange={setApplyOpen}
            />
        </>
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
        <div className="flex flex-col gap-4 px-5 pb-5 2xl:flex-row">
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
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
