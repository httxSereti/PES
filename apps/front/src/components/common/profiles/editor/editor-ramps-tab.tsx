import { useState } from "react";
import { ChevronDown, ClipboardCopy, Plus, Trash2 } from "lucide-react";

import { Badge } from "@pes/ui/components/badge";
import { Button } from "@pes/ui/components/button";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@pes/ui/components/collapsible";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@pes/ui/components/dropdown-menu";
import { Input } from "@pes/ui/components/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@pes/ui/components/select";
import { cn } from "@pes/ui/lib/utils";

import { useRampPresets } from "@/hooks/useRampPresets";
import { RampMode } from "@/types";

import { buildRampCurve, type RampCurveInput } from "../profile-shape";
import { ToggleChip } from "./editor-controls";
import {
    DURATION_PRESETS,
    RAMP_FIELD_LABELS,
    RAMP_RANGE_RE,
    RAMPABLE_FIELDS,
    type RampDraft,
    type RampField,
    type RampTargetDraft,
    type UnitDraft,
} from "./profile-document";
import type { LiveRampLike, ProfileEditorActions } from "./use-profile-editor";

const MODE_OPTIONS: Array<{ value: RampMode; label: string; hint: string }> = [
    {
        value: RampMode.RESET,
        label: "Reset",
        hint: "Climbs to the max, then restarts",
    },
    {
        value: RampMode.WAVE,
        label: "Wave",
        hint: "Climbs to the max then back down",
    },
    {
        value: RampMode.ASCEND,
        label: "Ascend",
        hint: "Climbs to the max and holds",
    },
];

function midpoint(range: string): number | null {
    const match = RAMP_RANGE_RE.exec(range.trim());
    if (!match) return null;
    return Math.round((Number(match[1]) + Number(match[2])) / 2);
}

function resolveTarget(target: RampTargetDraft, fallback: number): number {
    if (target.mode === "fixed") return target.value;
    if (target.mode === "range") return midpoint(target.range) ?? fallback;
    return fallback;
}

function fieldLevelOf(unit: UnitDraft, field: RampField): number {
    return unit[field];
}

/** Compact curve preview of one ramp inside the editor. */
function RampSparkline({
    curveInput,
    className,
}: {
    curveInput: RampCurveInput;
    className?: string;
}) {
    const curve = buildRampCurve(curveInput);
    const spanSeconds = curve.periodSeconds;
    const samples = 14;
    const bars =
        spanSeconds <= 0
            ? [33]
            : Array.from({ length: samples }, (_, index) =>
                  curve.levelAt((spanSeconds * index) / (samples - 1)),
              );

    return (
        <div className={cn("flex h-8 items-end gap-[2px]", className)}>
            {bars.map((height, index) => (
                <span
                    key={index}
                    style={{ height: `${Math.max(4, height)}%` }}
                    className="min-w-0 flex-1 rounded-[2px] bg-purple-500/70"
                />
            ))}
        </div>
    );
}

function TargetField({
    label,
    target,
    hint,
    onChange,
}: {
    label: string;
    target: RampTargetDraft;
    hint: string;
    onChange: (target: RampTargetDraft) => void;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                {label}
            </span>
            <div className="flex items-center gap-2">
                <Select
                    value={target.mode}
                    onValueChange={(mode) =>
                        onChange({
                            ...target,
                            mode: mode as RampTargetDraft["mode"],
                        })
                    }
                >
                    <SelectTrigger size="sm" className="h-8 w-36 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                        <SelectItem value="live">Live at apply</SelectItem>
                        <SelectItem value="fixed">Fixed value</SelectItem>
                        <SelectItem value="range">Range</SelectItem>
                    </SelectContent>
                </Select>

                {target.mode === "fixed" && (
                    <Input
                        type="number"
                        min={0}
                        max={100}
                        value={target.value}
                        aria-label={`${label} value`}
                        onChange={(event) =>
                            onChange({
                                ...target,
                                value: Math.min(
                                    100,
                                    Math.max(
                                        0,
                                        Number(event.target.value) || 0,
                                    ),
                                ),
                            })
                        }
                        className="h-8 w-20 text-center font-mono text-xs"
                    />
                )}
                {target.mode === "range" && (
                    <Input
                        type="text"
                        value={target.range}
                        placeholder="[25-35]"
                        aria-label={`${label} range`}
                        onChange={(event) =>
                            onChange({ ...target, range: event.target.value })
                        }
                        className="h-8 w-24 text-center font-mono text-xs"
                    />
                )}
            </div>
            <span className="text-[10px] leading-snug text-muted-foreground/70">
                {hint}
            </span>
        </div>
    );
}

function RampCard({
    unit,
    field,
    ramp,
    startExpanded,
    actions,
}: {
    unit: UnitDraft;
    field: RampField;
    ramp: RampDraft;
    startExpanded: boolean;
    actions: ProfileEditorActions;
}) {
    const [expanded, setExpanded] = useState(startExpanded);
    const { presets } = useRampPresets();

    const level = fieldLevelOf(unit, field);
    const resolvedMax = resolveTarget(ramp.max, level);
    const resolvedStart = resolveTarget(ramp.start, level);

    const summary = [
        ramp.mode.toUpperCase(),
        `${ramp.step}${ramp.stepUnit === "absolute" ? "" : "%"}/${ramp.timer}s`,
        ramp.duration === -1 ? "∞" : `${ramp.duration}s`,
    ].join(" · ");

    const applyPreset = (presetId: string) => {
        const preset = presets.find((entry) => entry.id === presetId);
        if (!preset) return;
        const { defaults } = preset;
        const targetFrom = (
            value: number | string | null | undefined,
        ): RampTargetDraft => {
            if (typeof value === "number") {
                return { mode: "fixed", value, range: "" };
            }
            if (typeof value === "string") {
                return { mode: "range", value: 50, range: value };
            }
            return { mode: "live", value: 50, range: "" };
        };
        actions.patchRamp(unit.id, field, {
            timer: defaults.timer,
            step: defaults.step,
            stepUnit:
                defaults.step_unit === "absolute" ? "absolute" : "percent",
            mode: defaults.mode,
            duration: defaults.duration,
            start: targetFrom(defaults.start_value),
            max: targetFrom(defaults.max_value),
        });
    };

    return (
        <Collapsible
            open={expanded}
            onOpenChange={setExpanded}
            className="rounded-xl border bg-card"
        >
            <div className="flex items-center gap-2 px-3 py-2.5">
                <CollapsibleTrigger asChild>
                    <button
                        type="button"
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                    >
                        <ChevronDown
                            className={cn(
                                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                                !expanded && "-rotate-90",
                            )}
                        />
                        <span className="shrink-0 font-mono text-[11px] font-semibold">
                            {RAMP_FIELD_LABELS[field]}
                        </span>
                        <Badge
                            variant="secondary"
                            className="shrink-0 rounded-full font-mono text-[9px]"
                        >
                            {ramp.mode}
                        </Badge>
                        <span className="hidden min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground sm:block">
                            {summary}
                        </span>
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                            level {level}
                        </span>
                    </button>
                </CollapsibleTrigger>

                <RampSparkline
                    className="hidden w-20 shrink-0 lg:flex"
                    curveInput={{
                        mode: ramp.mode,
                        timer: ramp.timer,
                        step: ramp.step,
                        stepUnit: ramp.stepUnit,
                        max: resolvedMax,
                        start: resolvedStart,
                    }}
                />

                {presets.length > 0 && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-[11px]"
                            >
                                Preset
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {presets.map((preset) => (
                                <DropdownMenuItem
                                    key={preset.id}
                                    onClick={() => applyPreset(preset.id)}
                                >
                                    {preset.name}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}

                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${RAMP_FIELD_LABELS[field]} ramp`}
                    title="Remove ramp"
                    className="h-7 w-7 shrink-0 text-muted-foreground/60 hover:text-foreground"
                    onClick={() => actions.removeRamp(unit.id, field)}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>

            <CollapsibleContent className="border-t px-3.5 py-3.5">
                <div className="flex flex-col gap-4">
                    <div className="grid gap-3.5 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                            <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                                Mode
                            </span>
                            <Select
                                value={ramp.mode}
                                onValueChange={(value) =>
                                    actions.patchRamp(unit.id, field, {
                                        mode: value as RampMode,
                                    })
                                }
                            >
                                <SelectTrigger
                                    size="sm"
                                    className="h-8 text-xs"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent position="popper">
                                    {MODE_OPTIONS.map((option) => (
                                        <SelectItem
                                            key={option.value}
                                            value={option.value}
                                        >
                                            {option.label} — {option.hint}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                                Duration
                            </span>
                            <div className="flex items-center gap-1.5">
                                {DURATION_PRESETS.map((preset) => (
                                    <ToggleChip
                                        key={preset.value}
                                        active={ramp.duration === preset.value}
                                        onClick={() =>
                                            actions.patchRamp(unit.id, field, {
                                                duration: preset.value,
                                            })
                                        }
                                    >
                                        {preset.label}
                                    </ToggleChip>
                                ))}
                                <Input
                                    type="number"
                                    value={ramp.duration}
                                    aria-label="Duration in seconds"
                                    onChange={(event) =>
                                        actions.patchRamp(unit.id, field, {
                                            duration: Number(
                                                event.target.value,
                                            ),
                                        })
                                    }
                                    className="h-7 w-20 text-center font-mono text-xs"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <label className="flex flex-col gap-1.5">
                                <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                                    Timer (s)
                                </span>
                                <Input
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    value={ramp.timer}
                                    onChange={(event) =>
                                        actions.patchRamp(unit.id, field, {
                                            timer: Number(event.target.value),
                                        })
                                    }
                                    className="h-8 font-mono text-xs"
                                />
                            </label>
                            <label className="flex flex-col gap-1.5">
                                <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                                    Step
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <Input
                                        type="number"
                                        step="0.1"
                                        min="0.1"
                                        value={ramp.step}
                                        onChange={(event) =>
                                            actions.patchRamp(unit.id, field, {
                                                step: Number(
                                                    event.target.value,
                                                ),
                                            })
                                        }
                                        className="h-8 font-mono text-xs"
                                    />
                                    <Select
                                        value={ramp.stepUnit}
                                        onValueChange={(value) =>
                                            actions.patchRamp(unit.id, field, {
                                                stepUnit:
                                                    value === "absolute"
                                                        ? "absolute"
                                                        : "percent",
                                            })
                                        }
                                    >
                                        <SelectTrigger
                                            size="sm"
                                            className="h-8 w-24 text-xs"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent position="popper">
                                            <SelectItem value="percent">
                                                % of max
                                            </SelectItem>
                                            <SelectItem value="absolute">
                                                value
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </label>
                        </div>

                        <div className="flex items-end">
                            <RampSparkline
                                className="h-12 w-full"
                                curveInput={{
                                    mode: ramp.mode,
                                    timer: ramp.timer,
                                    step: ramp.step,
                                    stepUnit: ramp.stepUnit,
                                    max: resolvedMax,
                                    start: resolvedStart,
                                }}
                            />
                        </div>

                        <TargetField
                            label="Start"
                            target={ramp.start}
                            hint={
                                ramp.start.mode === "live"
                                    ? "Starts where the channel is when applied."
                                    : "Ramp cycle rests at this level."
                            }
                            onChange={(start) =>
                                actions.patchRamp(unit.id, field, { start })
                            }
                        />
                        <TargetField
                            label="Max"
                            target={ramp.max}
                            hint={
                                ramp.max.mode === "live"
                                    ? "Follows the channel level, so it scales with the apply intensity."
                                    : "Ramp climbs to this level (100% of the cycle)."
                            }
                            onChange={(max) =>
                                actions.patchRamp(unit.id, field, { max })
                            }
                        />
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

type EditorRampsTabProps = {
    unit: UnitDraft;
    liveRamps: LiveRampLike[];
    actions: ProfileEditorActions;
};

export function EditorRampsTab({
    unit,
    liveRamps,
    actions,
}: EditorRampsTabProps) {
    const [justAdded, setJustAdded] = useState<RampField | null>(null);
    const unitLiveRamps = liveRamps.filter((ramp) => ramp.unit === unit.id);
    const rampCount = RAMPABLE_FIELDS.filter(
        (field) => unit.ramps[field],
    ).length;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-[10px] tracking-widest uppercase text-primary/40">
                    {unit.id} · {rampCount} ramp{rampCount === 1 ? "" : "s"}
                </p>
                {unitLiveRamps.length > 0 && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() =>
                            actions.copyLiveRamps(unit.id, unitLiveRamps)
                        }
                    >
                        <ClipboardCopy className="h-3.5 w-3.5" /> Copy{" "}
                        {unitLiveRamps.length} live ramp
                        {unitLiveRamps.length === 1 ? "" : "s"}
                    </Button>
                )}
            </div>

            <div className="flex flex-col gap-2.5">
                {RAMPABLE_FIELDS.map((field) => {
                    const ramp = unit.ramps[field];
                    if (!ramp) {
                        return (
                            <button
                                key={field}
                                type="button"
                                onClick={() => {
                                    actions.addRamp(unit.id, field);
                                    setJustAdded(field);
                                }}
                                className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed py-3 font-mono text-[11px] text-muted-foreground transition hover:border-muted-foreground/40 hover:text-foreground"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Add {RAMP_FIELD_LABELS[field]} ramp
                                <span className="text-muted-foreground/50">
                                    · level {fieldLevelOf(unit, field)}
                                </span>
                            </button>
                        );
                    }
                    return (
                        <RampCard
                            key={field}
                            unit={unit}
                            field={field}
                            ramp={ramp}
                            startExpanded={justAdded === field}
                            actions={actions}
                        />
                    );
                })}
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                Ramps stored in a profile start when the profile is applied and
                stop when it is replaced or stopped. “Live at apply” and “follow
                channel level” keep them relative to the intensity you choose.
            </p>
        </div>
    );
}
