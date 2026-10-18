import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Play } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@pes/ui/components/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@pes/ui/components/dialog";
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@pes/ui/components/drawer";
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldGroup,
    FieldLabel,
} from "@pes/ui/components/field";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
} from "@pes/ui/components/input-group";
import { Slider } from "@pes/ui/components/slider";
import { Switch } from "@pes/ui/components/switch";
import { useMediaQuery } from "@pes/ui/hooks/use-media-query";
import { cn } from "@pes/ui/lib/utils";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import { selectActiveProfile } from "@/store/slices/profilesSlice";
import type { ProfileSummary } from "@/types";

import { ProfileMonogram, ProfileTypeBadge } from "./profile-badges";
import { formatClock } from "./profile-shape";

type ApplyProfileDialogProps = {
    profile: ProfileSummary;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

const DURATION_PRESETS: Array<{ label: string; value: number }> = [
    { label: "Until stopped", value: -1 },
    { label: "5m", value: 300 },
    { label: "15m", value: 900 },
    { label: "1h", value: 3600 },
];

/** Purple pill shared by the unit toggles and the duration presets. */
function ToggleChip({
    active,
    className,
    children,
    onClick,
}: {
    active: boolean;
    className?: string;
    children: ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            className={cn(
                "inline-flex h-7 cursor-pointer items-center rounded-lg border px-2.5 text-[11px] font-medium transition-colors",
                active
                    ? "border-purple-500/30 bg-purple-500/15 text-purple-700 dark:text-purple-200"
                    : "border-border bg-muted/40 text-muted-foreground/70 hover:border-muted-foreground/30 hover:text-foreground",
                className,
            )}
        >
            {children}
        </button>
    );
}

/**
 * State for the apply form, owned by the outer component so switching between
 * the dialog and drawer shells mid-edit does not reset the values.
 */
function useApplyProfileForm(
    profile: ProfileSummary,
    open: boolean,
    onApplied: () => void,
) {
    const { sendCommand } = useWebSocket();
    const activeProfile = useAppSelector(selectActiveProfile);
    const [levelPct, setLevelPct] = useState(100);
    const [durationText, setDurationText] = useState("-1");
    const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
    const [replace, setReplace] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Fresh defaults every time the dialog opens; stored profile defaults
    // (see the studio "Apply" tab) prefill level, duration and units.
    const storedDefaults = profile.defaults ?? null;
    useEffect(() => {
        if (!open) return;
        setLevelPct(storedDefaults?.level_pct ?? 100);
        setDurationText(String(storedDefaults?.duration ?? -1));
        const preferredUnits = storedDefaults?.units?.length
            ? profile.units.filter((unit) => storedDefaults.units.includes(unit))
            : profile.units;
        setSelectedUnits(preferredUnits.length > 0 ? preferredUnits : profile.units);
        setReplace(true);
    }, [open, profile.units, storedDefaults]);

    const showUnitPicker = profile.units.length > 1;

    const toggleUnit = (unit: string) => {
        setSelectedUnits((current) =>
            current.includes(unit)
                ? current.filter((item) => item !== unit)
                : [...current, unit],
        );
    };

    // Parsed from the raw input so an emptied field stays invalid instead
    // of silently collapsing to 0 (Number("") === 0).
    const duration =
        durationText.trim() === "" ? Number.NaN : Number(durationText);
    const durationValid =
        Number.isInteger(duration) && (duration === -1 || duration > 0);
    const unitsValid = !showUnitPicker || selectedUnits.length > 0;
    const canSubmit = !submitting && durationValid && unitsValid;

    const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canSubmit) return;
        setSubmitting(true);
        try {
            const result = await sendCommand("profiles:apply", {
                name: profile.name,
                level_pct: levelPct,
                duration,
                units: showUnitPicker ? selectedUnits : null,
                replace,
            });

            if (result.status === "ok") {
                const parts = [
                    `Level ${levelPct}%`,
                    duration === -1
                        ? "runs until stopped"
                        : `reverts after ${formatClock(duration)}`,
                ];
                if (activeProfile) {
                    parts.push(
                        replace
                            ? `replaces "${activeProfile.name}"`
                            : `starts when "${activeProfile.name}" ends`,
                    );
                }
                toast.success(`Profile "${profile.name}" queued`, {
                    description: parts.join(" · "),
                    position: "bottom-right",
                });
                onApplied();
                return;
            }

            toast.error("Failed to apply profile", {
                description: result.message ?? undefined,
                position: "bottom-right",
            });
        } catch (error) {
            toast.error("Failed to apply profile", {
                description: error instanceof Error ? error.message : undefined,
                position: "bottom-right",
            });
        } finally {
            setSubmitting(false);
        }
    };

    return {
        activeProfile,
        canSubmit,
        duration,
        durationText,
        durationValid,
        levelPct,
        onSubmit,
        replace,
        selectedUnits,
        setDurationText,
        setLevelPct,
        setReplace,
        showUnitPicker,
        submitting,
        toggleUnit,
    };
}

type ApplyProfileFormState = ReturnType<typeof useApplyProfileForm>;

/** Fields and actions shared by the desktop dialog and the mobile drawer. */
function ApplyProfileForm({
    profile,
    form,
    variant,
    onClose,
}: {
    profile: ProfileSummary;
    form: ApplyProfileFormState;
    variant: "dialog" | "drawer";
    onClose: () => void;
}) {
    const {
        activeProfile,
        canSubmit,
        duration,
        durationText,
        durationValid,
        levelPct,
        onSubmit,
        replace,
        selectedUnits,
        setDurationText,
        setLevelPct,
        setReplace,
        showUnitPicker,
        submitting,
        toggleUnit,
    } = form;

    return (
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
            <FieldGroup className="min-h-0 flex-1 gap-5 overflow-y-auto px-5 py-4">
                <Field>
                    <div className="flex items-center justify-between">
                        <FieldLabel>Level</FieldLabel>
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                            {levelPct}%
                        </span>
                    </div>
                    <Slider
                        aria-label="Level percentage"
                        value={[levelPct]}
                        min={0}
                        max={150}
                        step={5}
                        onValueChange={([value]) => setLevelPct(value ?? 0)}
                    />
                    <FieldDescription>
                        Over 100% amplifies the profile, capped by usage limits.
                    </FieldDescription>
                </Field>

                {showUnitPicker && (
                    <Field>
                        <div className="flex items-center justify-between">
                            <FieldLabel>Units</FieldLabel>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                {selectedUnits.length}/{profile.units.length}
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {profile.units.map((unit) => (
                                <ToggleChip
                                    key={unit}
                                    active={selectedUnits.includes(unit)}
                                    className="font-mono"
                                    onClick={() => toggleUnit(unit)}
                                >
                                    {unit}
                                </ToggleChip>
                            ))}
                        </div>
                        <FieldDescription>
                            Only the selected units are changed.
                        </FieldDescription>
                    </Field>
                )}

                <Field>
                    <div className="flex items-center justify-between">
                        <FieldLabel>Duration</FieldLabel>
                        {durationValid && (
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                {duration === -1
                                    ? "until stopped"
                                    : formatClock(duration)}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {DURATION_PRESETS.map((preset) => (
                            <ToggleChip
                                key={preset.value}
                                active={duration === preset.value}
                                onClick={() =>
                                    setDurationText(String(preset.value))
                                }
                            >
                                {preset.label}
                            </ToggleChip>
                        ))}
                    </div>
                    <InputGroup>
                        <InputGroupInput
                            type="number"
                            min={-1}
                            step={1}
                            inputMode="numeric"
                            aria-label="Custom duration in seconds"
                            aria-invalid={!durationValid}
                            placeholder="Custom"
                            value={durationText}
                            onChange={(event) =>
                                setDurationText(event.target.value)
                            }
                        />
                        <InputGroupAddon align="inline-end">
                            seconds
                        </InputGroupAddon>
                    </InputGroup>
                    <FieldDescription>
                        {durationValid
                            ? duration === -1
                                ? "Runs until stopped or replaced."
                                : `Reverts after ${formatClock(duration)}.`
                            : "Enter -1 or a positive number of seconds."}
                    </FieldDescription>
                </Field>

                {activeProfile && (
                    <Field orientation="horizontal">
                        <Switch
                            checked={replace}
                            onCheckedChange={setReplace}
                        />
                        <FieldContent>
                            <FieldLabel>Replace running profile</FieldLabel>
                            <FieldDescription>
                                {`Stops "${activeProfile.name}" and restores its previous state first. Off = wait until it ends.`}
                            </FieldDescription>
                        </FieldContent>
                    </Field>
                )}
            </FieldGroup>

            <div
                className={cn(
                    "flex shrink-0 gap-2 border-t px-5 py-4",
                    variant === "drawer" ? "flex-col" : "flex-row justify-end",
                )}
            >
                <Button type="button" variant="outline" onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    type="submit"
                    className="sm:min-w-28"
                    disabled={!canSubmit}
                >
                    <Play className="size-4" />
                    {submitting ? "Queuing..." : "Apply profile"}
                </Button>
            </div>
        </form>
    );
}

/** Monogram, name and type badge used as the shell heading. */
function ProfileHeading({ profile }: { profile: ProfileSummary }) {
    return (
        <>
            <ProfileMonogram
                name={profile.name}
                legacy={profile.legacy}
                className="h-9 w-9 rounded-[10px] text-sm"
            />
            <span className="min-w-0 flex-1 truncate">{profile.name}</span>
            <ProfileTypeBadge legacy={profile.legacy} />
        </>
    );
}

export function ApplyProfileDialog({
    profile,
    open,
    onOpenChange,
}: ApplyProfileDialogProps) {
    const isDesktop = useMediaQuery("(min-width: 768px)");
    const form = useApplyProfileForm(profile, open, () => onOpenChange(false));

    const meta = [
        `${profile.unit_count} unit${profile.unit_count === 1 ? "" : "s"}`,
        `${profile.ramp_count} ramp${profile.ramp_count === 1 ? "" : "s"}`,
        profile.defaults
            ? "prefilled from this profile's defaults"
            : "previous state is restored when it ends",
    ].join(" · ");

    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
                    <DialogHeader className="shrink-0 gap-1.5 border-b py-4 pr-12 pl-5">
                        <DialogTitle className="flex items-center gap-3">
                            <ProfileHeading profile={profile} />
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            {meta}
                        </DialogDescription>
                    </DialogHeader>
                    <ApplyProfileForm
                        profile={profile}
                        form={form}
                        variant="dialog"
                        onClose={() => onOpenChange(false)}
                    />
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent>
                <DrawerHeader className="shrink-0 gap-1.5 border-b px-5 pt-2 pb-4 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
                    <DrawerTitle className="flex items-center gap-3">
                        <ProfileHeading profile={profile} />
                    </DrawerTitle>
                    <DrawerDescription className="text-xs">
                        {meta}
                    </DrawerDescription>
                </DrawerHeader>
                <ApplyProfileForm
                    profile={profile}
                    form={form}
                    variant="drawer"
                    onClose={() => onOpenChange(false)}
                />
            </DrawerContent>
        </Drawer>
    );
}
