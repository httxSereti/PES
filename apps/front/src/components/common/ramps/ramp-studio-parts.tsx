import { useEffect, useState, type ReactNode } from "react";
import { Minus, Plus, Trash2, Wand2 } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
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

import { useRampPresets, type RampPreset } from "@/hooks/useRampPresets";
import { RampEndAction, RampMode } from "@/types";
import {
    normalizeRampEndAction,
    normalizeRampEndValue,
    resolveRampEndLevel,
} from "@/lib/ramp-end";

import {
    buildRampCurve,
    formatClock,
    shapeAreaPath,
    shapeLinePath,
    type RampCurveInput,
} from "../profiles/profile-shape";
import { ToggleChip } from "../profiles/editor/editor-controls";
import {
    clampLevel,
    DURATION_PRESETS,
    RAMP_FIELD_LABELS,
    RAMP_RANGE_RE,
    rampTargetIsValid,
    type RampDraft,
    type RampField,
    type RampTargetDraft,
} from "../profiles/editor/profile-document";
import { describeDefaults, describeRampEnd } from "./ramp-format";

export const PREVIEW_SAMPLES = 96;
export const PLOT_WIDTH = 100;
export const PLOT_HEIGHT = 100;
export const PLOT_PADDING = 6;
export const GRID_LEVELS = [0, 25, 50, 75, 100] as const;

export const RAMP_MODE_OPTIONS: Array<{
    value: RampMode;
    label: string;
    hint: string;
}> = [
    {
        value: RampMode.RESET,
        label: "Reset",
        hint: "Climbs to the peak, then starts over from the floor.",
    },
    {
        value: RampMode.WAVE,
        label: "Wave",
        hint: "Climbs to the peak, then eases back to the floor.",
    },
    {
        value: RampMode.ASCEND,
        label: "Ascend",
        hint: "Climbs once and holds at the peak.",
    },
    {
        value: RampMode.SQUARE,
        label: "Square",
        hint: "Jumps between the floor and the peak, on and off.",
    },
    {
        value: RampMode.DRIFT,
        label: "Drift",
        hint: "Wanders randomly between the floor and the peak.",
    },
    {
        value: RampMode.SURGE,
        label: "Surge",
        hint: "Builds slowly, then releases quickly.",
    },
    {
        value: RampMode.DWELL,
        label: "Dwell",
        hint: "A wave with a pause at the peak and at the floor.",
    },
];

const GLYPH_PATHS: Record<RampMode, string> = {
    [RampMode.RESET]: "M0 10 L7 2 L7 10 L14 2 L14 10 L21 2 L21 10 L28 2",
    [RampMode.WAVE]: "M0 10 L7 2 L14 10 L21 2 L28 10",
    [RampMode.ASCEND]: "M0 10 L10 2 L28 2",
    [RampMode.SQUARE]: "M0 10 L0 2 L7 2 L7 10 L14 10 L14 2 L21 2 L21 10 L28 10",
    [RampMode.DRIFT]: "M0 8 L4 4 L7 9 L11 6 L14 10 L18 3 L21 7 L24 5 L28 9",
    [RampMode.SURGE]: "M0 10 L19 2 L28 10",
    [RampMode.DWELL]: "M0 9 L4 2 L7 2 L11 9 L15 9 L19 2 L22 2 L26 9",
};

export const RAMP_END_OPTIONS: Array<{
    value: RampEndAction;
    label: string;
    hint: string;
}> = [
    {
        value: RampEndAction.HOLD_PEAK,
        label: "Hold peak",
        hint: "Keeps the ramp's peak when it finishes.",
    },
    {
        value: RampEndAction.HOLD_CURRENT,
        label: "Keep current",
        hint: "Holds the level the ramp reached when it finishes.",
    },
    {
        value: RampEndAction.RESTORE_START,
        label: "Back to start",
        hint: "Returns the field to the ramp's start level.",
    },
    {
        value: RampEndAction.SET_LEVEL,
        label: "Go to level",
        hint: "Goes to the chosen level when the ramp finishes.",
    },
];

export const RAMP_SCALE_OPTIONS: Array<{
    label: string;
    value: number | "fit";
}> = [
    { label: "30s", value: 30 },
    { label: "1m", value: 60 },
    { label: "3m", value: 180 },
    { label: "Fit", value: "fit" },
];

export const RAMP_LANE_STYLES: Record<
    RampField,
    {
        short: string;
        label: string;
        text: string;
        /** Solid fill used for the live level / progress accents. */
        bar: string;
    }
> = {
    ch_A: {
        short: "A",
        label: "Channel A",
        text: "text-violet-600 dark:text-violet-400",
        bar: "bg-violet-500",
    },
    ch_B: {
        short: "B",
        label: "Channel B",
        text: "text-blue-600 dark:text-blue-400",
        bar: "bg-blue-500",
    },
    adj_1: {
        short: "Adj 1",
        label: "Adj 1",
        text: "text-amber-600 dark:text-amber-400",
        bar: "bg-amber-500",
    },
    adj_2: {
        short: "Adj 2",
        label: "Adj 2",
        text: "text-emerald-600 dark:text-emerald-400",
        bar: "bg-emerald-500",
    },
};

/** One lane as the studio draws it: resolved ends, curve and live level. */
export type RampStudioLane = {
    field: RampField;
    ramp: RampDraft | null;
    /** Live field level shown in the lane gutter. */
    fieldLevel: number;
    startLevel: number;
    maxLevel: number;
    curve: ReturnType<typeof buildRampCurve> | null;
};

export function midpoint(range: string): number | null {
    const match = RAMP_RANGE_RE.exec(range.trim());
    if (!match) return null;
    return Math.round((Number(match[1]) + Number(match[2])) / 2);
}

export function resolveRampTarget(
    target: RampTargetDraft,
    fallback: number,
): number {
    if (target.mode === "fixed") return target.value;
    if (target.mode === "range") return midpoint(target.range) ?? fallback;
    return fallback;
}

export function rampCurveInput(
    ramp: RampDraft,
    start: number,
    max: number,
): RampCurveInput {
    return {
        mode: ramp.mode,
        timer: ramp.timer,
        step: ramp.step,
        stepUnit: ramp.stepUnit,
        dwell: ramp.dwell,
        release: ramp.release,
        max,
        start,
    };
}

/** Seconds the curve needs to reach the peak (0 for DRIFT / a flat lane). */
export function climbSecondsOf(
    ramp: RampDraft,
    start: number,
    max: number,
): number {
    if (ramp.mode === RampMode.SQUARE) return ramp.timer;
    if (ramp.mode === RampMode.DRIFT) return 0;
    const startPct = max > 0 ? (start * 100) / max : 0;
    const stepPct =
        ramp.stepUnit === "absolute" && max > 0
            ? (ramp.step * 100) / max
            : ramp.step;
    if (stepPct <= 0 || startPct >= 100) return 0;
    return ((100 - startPct) / stepPct) * ramp.timer;
}

/** Field level after a finite ramp stops, mirroring the backend end action. */
export function postRampLevel(
    ramp: Pick<RampDraft, "endAction" | "endValue">,
    curve: ReturnType<typeof buildRampCurve> | null,
    stopAt: number,
    startLevel: number,
    maxLevel: number,
): number {
    return resolveRampEndLevel({
        action: ramp.endAction,
        endValue: ramp.endValue,
        startLevel,
        maxLevel,
        currentLevel: curve ? curve.levelAt(stopAt) : 0,
    });
}

/**
 * Sample one lane across the visible window. After a finite duration the
 * backend applies the ramp's end action, so the tail is the resolved end
 * level (peak by default, or the configured keep/start/set level).
 */
export function sampleCurve(
    ramp: RampDraft,
    curve: ReturnType<typeof buildRampCurve>,
    windowSeconds: number,
    startLevel: number,
    maxLevel: number,
): number[] {
    const stopAt = ramp.duration > 0 ? ramp.duration : null;
    const endLevel =
        stopAt !== null
            ? postRampLevel(ramp, curve, stopAt, startLevel, maxLevel)
            : null;
    return Array.from({ length: PREVIEW_SAMPLES }, (_, index) => {
        const seconds = (windowSeconds * index) / (PREVIEW_SAMPLES - 1);
        if (stopAt !== null && endLevel !== null && seconds >= stopAt) {
            return endLevel;
        }
        return curve.levelAt(seconds);
    });
}

/** Level shown at the playhead, including the post-duration end action. */
export function laneLevelAt(lane: RampStudioLane, seconds: number): number {
    if (!lane.curve) return 0;
    if (lane.ramp && lane.ramp.duration > 0 && seconds >= lane.ramp.duration) {
        return postRampLevel(
            lane.ramp,
            lane.curve,
            lane.ramp.duration,
            lane.startLevel,
            lane.maxLevel,
        );
    }
    return lane.curve.levelAt(seconds);
}

export function gridY(level: number): number {
    return (
        PLOT_PADDING + ((PLOT_HEIGHT - PLOT_PADDING * 2) * (100 - level)) / 100
    );
}

export function modeLabelOf(mode: RampMode): string {
    return (
        RAMP_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? mode
    );
}

export function RampModeGlyph({
    mode,
    className,
}: {
    mode: RampMode;
    className?: string;
}) {
    return (
        <svg
            viewBox="0 0 28 12"
            className={cn("h-2.5 w-6", className)}
            aria-hidden="true"
        >
            <path
                d={GLYPH_PATHS[mode]}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
}

export function SectionLabel({ children }: { children: ReactNode }) {
    return (
        <p className="font-mono text-[8px] tracking-[0.14em] text-muted-foreground/60 uppercase">
            {children}
        </p>
    );
}

/**
 * Numeric field with a local draft string, so typing "1." or clearing the
 * box does not immediately collapse to 0. The parent still receives every
 * finite value; the blur handler clamps to the allowed range.
 */
export function RampNumberField({
    value,
    onChange,
    min,
    max,
    step = 1,
    ariaLabel,
    className,
    disabled,
}: {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    ariaLabel: string;
    className?: string;
    disabled?: boolean;
}) {
    const [text, setText] = useState(() => String(value));
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        if (!focused) setText(String(value));
    }, [value, focused]);

    const clamp = (raw: number) => {
        let next = raw;
        if (min !== undefined) next = Math.max(min, next);
        if (max !== undefined) next = Math.min(max, next);
        return next;
    };

    return (
        <Input
            type="number"
            inputMode="decimal"
            step={step}
            min={min}
            max={max}
            disabled={disabled}
            value={text}
            aria-label={ariaLabel}
            onChange={(event) => {
                const next = event.target.value;
                setText(next);
                if (next.trim() === "") return;
                const parsed = Number(next);
                if (Number.isFinite(parsed)) onChange(parsed);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
                setFocused(false);
                const parsed = Number(text);
                if (text.trim() === "" || !Number.isFinite(parsed)) {
                    setText(String(value));
                    return;
                }
                const bounded = clamp(parsed);
                setText(String(bounded));
                if (bounded !== value) onChange(bounded);
            }}
            className={className}
        />
    );
}

export function TargetRow({
    label,
    target,
    fallback,
    hint,
    liveLabel = "Live at apply",
    liveBadge = "at apply",
    onChange,
}: {
    label: string;
    target: RampTargetDraft;
    fallback: number;
    hint: string;
    liveLabel?: string;
    liveBadge?: string;
    onChange: (target: RampTargetDraft) => void;
}) {
    const resolved = resolveRampTarget(target, fallback);

    const changeMode = (mode: RampTargetDraft["mode"]) => {
        if (mode === target.mode) return;
        if (mode === "fixed") {
            onChange({
                ...target,
                mode,
                value: clampLevel(resolved),
            });
            return;
        }
        if (mode === "range") {
            const low = clampLevel(Math.max(0, resolved - 5));
            const high = clampLevel(Math.min(100, resolved + 5));
            onChange({
                ...target,
                mode,
                range: target.range.trim() || `[${low}-${high}]`,
            });
            return;
        }
        onChange({ ...target, mode });
    };

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium">{label}</span>
                <span className="font-mono text-[9px] text-muted-foreground/60 tabular-nums">
                    {resolved}%
                </span>
            </div>

            <div className="flex items-center gap-1.5">
                <Select
                    value={target.mode}
                    onValueChange={(value) =>
                        changeMode(value as RampTargetDraft["mode"])
                    }
                >
                    <SelectTrigger
                        size="sm"
                        className="h-7 min-w-0 flex-1 text-[10px]"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                        <SelectItem value="live">{liveLabel}</SelectItem>
                        <SelectItem value="fixed">Fixed value</SelectItem>
                        <SelectItem value="range">Range</SelectItem>
                    </SelectContent>
                </Select>

                {target.mode === "fixed" && (
                    <RampNumberField
                        value={target.value}
                        min={0}
                        max={100}
                        ariaLabel={`${label} value`}
                        onChange={(value) =>
                            onChange({
                                ...target,
                                value: clampLevel(value),
                            })
                        }
                        className="h-7 w-[68px] shrink-0 text-center font-mono text-[11px]"
                    />
                )}

                {target.mode === "range" && (
                    <Input
                        type="text"
                        value={target.range}
                        placeholder="[25-35]"
                        aria-label={`${label} range`}
                        aria-invalid={!rampTargetIsValid(target)}
                        onChange={(event) =>
                            onChange({
                                ...target,
                                range: event.target.value,
                            })
                        }
                        className="h-7 w-[84px] shrink-0 text-center font-mono text-[11px] aria-invalid:border-amber-500/60"
                    />
                )}

                {target.mode === "live" && (
                    <span className="flex h-7 w-[68px] shrink-0 items-center justify-center rounded-md border border-dashed border-border/70 font-mono text-[9px] text-muted-foreground/70">
                        {liveBadge}
                    </span>
                )}
            </div>

            <span className="text-[9px] leading-snug text-muted-foreground/65">
                {hint}
            </span>
        </div>
    );
}

export function RangeBar({ start, max }: { start: number; max: number }) {
    const low = Math.min(start, max);
    const high = Math.max(start, max);
    const inverted = start > max;
    const dotLeft = (value: number) => `${Math.min(98, Math.max(2, value))}%`;

    return (
        <div className="flex flex-col gap-1">
            <div className="relative h-1.5 rounded-full bg-muted">
                <div
                    className={cn(
                        "absolute inset-y-0 rounded-full",
                        inverted ? "bg-amber-500/60" : "bg-purple-500/55",
                    )}
                    style={{
                        left: `${low}%`,
                        width: `${Math.max(1, high - low)}%`,
                    }}
                />
                <span
                    className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-violet-500"
                    style={{ left: dotLeft(start) }}
                    title={`Start ${start}%`}
                />
                <span
                    className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-purple-600"
                    style={{ left: dotLeft(max) }}
                    title={`Peak ${max}%`}
                />
            </div>
            <div className="flex justify-between font-mono text-[8px] text-muted-foreground/55 tabular-nums">
                <span>0</span>
                <span>50</span>
                <span>100</span>
            </div>
        </div>
    );
}

export function ModePalette({
    mode,
    onSelect,
}: {
    mode: RampMode;
    onSelect: (mode: RampMode) => void;
}) {
    return (
        <div className="grid grid-cols-4 gap-1">
            {RAMP_MODE_OPTIONS.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    aria-pressed={mode === option.value}
                    title={option.hint}
                    onClick={() => onSelect(option.value)}
                    className={cn(
                        "flex cursor-pointer flex-col items-center gap-1 rounded-lg border px-0.5 py-1.5 text-[9px] font-medium transition-colors",
                        mode === option.value
                            ? "border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-200"
                            : "border-border/60 bg-muted/20 text-muted-foreground/75 hover:border-muted-foreground/30 hover:text-foreground",
                    )}
                >
                    <RampModeGlyph mode={option.value} />
                    {option.label}
                </button>
            ))}
        </div>
    );
}

function PresetMenu({ onApply }: { onApply: (preset: RampPreset) => void }) {
    const { presets, refresh } = useRampPresets();

    if (presets.length === 0) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[10px]"
                    onClick={() => refresh()}
                >
                    <Wand2 className="h-3 w-3" />
                    Presets
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-mono text-[9px] tracking-wide text-muted-foreground uppercase">
                    Apply to this lane
                </DropdownMenuLabel>
                {presets.map((preset) => (
                    <DropdownMenuItem
                        key={preset.id}
                        onSelect={() => onApply(preset)}
                    >
                        <div className="flex min-w-0 flex-col">
                            <span className="truncate text-xs font-medium">
                                {preset.name}
                            </span>
                            <span className="truncate font-mono text-[9px] text-muted-foreground/60 uppercase">
                                {describeDefaults(preset.defaults)}
                            </span>
                        </div>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function TimelineToolbar({
    scale,
    onScaleChange,
    readout,
}: {
    scale: number | "fit";
    onScaleChange: (value: number | "fit") => void;
    readout: string;
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-2 py-1.5">
            <div className="flex items-center gap-1.5">
                <span className="font-mono text-[8px] tracking-[0.1em] text-muted-foreground/55 uppercase">
                    Window
                </span>
                {RAMP_SCALE_OPTIONS.map((option) => (
                    <ToggleChip
                        key={String(option.value)}
                        active={scale === option.value}
                        onClick={() => onScaleChange(option.value)}
                        className="h-6 px-2 text-[10px]"
                    >
                        {option.label}
                    </ToggleChip>
                ))}
            </div>
            <span className="font-mono text-[9px] text-muted-foreground/70 tabular-nums">
                {readout}
            </span>
        </div>
    );
}

export function TimelineRuler({ windowSeconds }: { windowSeconds: number }) {
    return (
        <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2 px-2">
            <span className="font-mono text-[8px] tracking-[0.1em] text-muted-foreground/45 uppercase">
                Time
            </span>
            <div className="flex justify-between font-mono text-[8px] text-muted-foreground/55 tabular-nums">
                {[0, 1, 2, 3, 4].map((index) => (
                    <span key={index}>
                        {formatClock((windowSeconds * index) / 4)}
                    </span>
                ))}
            </div>
        </div>
    );
}

export function Playhead({ ratio }: { ratio: number | null }) {
    if (ratio === null) return null;
    return (
        <>
            <span
                className="pointer-events-none absolute inset-y-0 w-px bg-foreground/40"
                style={{ left: `${ratio * 100}%` }}
            />
            <span
                className="pointer-events-none absolute top-0 size-1 -translate-x-1/2 rounded-full bg-foreground/60"
                style={{ left: `${ratio * 100}%` }}
            />
        </>
    );
}

/** Shared curve chart: grid, peak guide, filled trace, stop marker, playhead. */
export function RampCurveChart({
    samples,
    maxLevel,
    tone,
    className,
    heightClassName = "h-[68px]",
    stopRatio = null,
    hoverRatio = null,
    onHover,
    onSelect,
    onLeave,
    ariaLabel,
}: {
    samples: number[];
    maxLevel: number;
    tone?: string;
    className?: string;
    heightClassName?: string;
    stopRatio?: number | null;
    hoverRatio?: number | null;
    onHover?: (ratio: number) => void;
    onSelect?: () => void;
    onLeave?: () => void;
    ariaLabel?: string;
}) {
    return (
        <div
            className={cn(
                "relative overflow-hidden rounded-md border bg-muted/15",
                heightClassName,
                tone,
                className,
                onHover ? "cursor-crosshair" : onSelect ? "cursor-pointer" : "",
            )}
            aria-label={ariaLabel}
            onPointerMove={
                onHover
                    ? (event) => {
                          const rect =
                              event.currentTarget.getBoundingClientRect();
                          const ratio =
                              (event.clientX - rect.left) / rect.width;
                          onHover(Math.min(1, Math.max(0, ratio)));
                      }
                    : undefined
            }
            onPointerLeave={onLeave}
            onClick={onSelect}
        >
            <svg
                viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
                preserveAspectRatio="none"
                className="h-full w-full"
                aria-hidden="true"
            >
                {GRID_LEVELS.map((level) => (
                    <line
                        key={level}
                        x1={0}
                        y1={gridY(level)}
                        x2={PLOT_WIDTH}
                        y2={gridY(level)}
                        stroke="currentColor"
                        strokeOpacity={level === 0 ? 0.16 : 0.07}
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                    />
                ))}

                <line
                    x1={0}
                    y1={gridY(maxLevel)}
                    x2={PLOT_WIDTH}
                    y2={gridY(maxLevel)}
                    stroke="currentColor"
                    strokeOpacity={0.32}
                    strokeWidth={1}
                    strokeDasharray="2 3"
                    vectorEffect="non-scaling-stroke"
                />

                <path
                    d={shapeAreaPath(
                        samples,
                        PLOT_WIDTH,
                        PLOT_HEIGHT,
                        PLOT_PADDING,
                    )}
                    fill="currentColor"
                    fillOpacity={0.1}
                />
                <path
                    d={shapeLinePath(
                        samples,
                        PLOT_WIDTH,
                        PLOT_HEIGHT,
                        PLOT_PADDING,
                    )}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                />
            </svg>

            {stopRatio !== null && (
                <span
                    className="pointer-events-none absolute inset-y-0 border-l border-dashed border-amber-500/60"
                    style={{ left: `${stopRatio * 100}%` }}
                />
            )}
            <Playhead ratio={hoverRatio} />
        </div>
    );
}

function EmptyInspector({
    field,
    onAdd,
}: {
    field: RampField;
    onAdd: () => void;
}) {
    const style = RAMP_LANE_STYLES[field];

    return (
        <aside className="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-dashed bg-card px-4 py-8 text-center">
            <span
                className={cn(
                    "flex size-9 items-center justify-center rounded-full border border-border/60 bg-muted/30",
                    style.text,
                )}
            >
                <RampModeGlyph mode={RampMode.WAVE} className="h-3 w-7" />
            </span>
            <p className="text-[12px] font-medium">No {style.label} ramp yet</p>
            <p className="max-w-[220px] text-[10px] leading-snug text-muted-foreground">
                This lane stays at its fixed level until you give it a shape.
            </p>
            <Button
                type="button"
                size="sm"
                className="mt-1 h-7 text-[10px]"
                onClick={onAdd}
            >
                <Plus className="h-3.5 w-3.5" />
                Add {style.label} ramp
            </Button>
        </aside>
    );
}

type RampInspectorProps = {
    lane: RampStudioLane;
    /** "profile" edits a draft; "live" starts a ramp right away. */
    context: "profile" | "live";
    onPatch: (patch: Partial<RampDraft>) => void;
    onRemove?: () => void;
    onAdd?: () => void;
    className?: string;
};

export function RampInspector({
    lane,
    context,
    onPatch,
    onRemove,
    onAdd,
    className,
}: RampInspectorProps) {
    const field = lane.field;
    const ramp = lane.ramp;
    const style = RAMP_LANE_STYLES[field];

    if (!ramp) {
        return onAdd ? <EmptyInspector field={field} onAdd={onAdd} /> : null;
    }

    const modeHint =
        RAMP_MODE_OPTIONS.find((option) => option.value === ramp.mode)?.hint ??
        "Choose how the lane moves.";
    const climbSeconds = climbSecondsOf(ramp, lane.startLevel, lane.maxLevel);
    const cycleSeconds = lane.curve?.periodSeconds ?? 0;
    const flat = lane.startLevel >= lane.maxLevel;
    const usesRange = ramp.start.mode === "range" || ramp.max.mode === "range";
    const live = context === "live";
    const endOption = RAMP_END_OPTIONS.find(
        (option) => option.value === ramp.endAction,
    ) ?? {
        value: RampEndAction.HOLD_PEAK,
        label: "Hold peak",
        hint: "Keeps the ramp's peak when it finishes.",
    };
    const endText = describeRampEnd(
        ramp.endAction,
        ramp.endValue,
        lane.startLevel,
        lane.maxLevel,
    );


    const applyPreset = (preset: RampPreset) => {
        const { defaults } = preset;
        const targetFrom = (
            value: number | string | null | undefined,
        ): RampTargetDraft => {
            if (typeof value === "number") {
                return {
                    mode: "fixed",
                    value: clampLevel(value),
                    range: "",
                };
            }
            if (typeof value === "string") {
                return { mode: "range", value: 50, range: value };
            }
            return { mode: "live", value: 50, range: "" };
        };

        const endAction = normalizeRampEndAction(defaults.end_action);
        onPatch({
            timer: defaults.timer,
            step: defaults.step,
            stepUnit:
                defaults.step_unit === "absolute" ? "absolute" : "percent",
            mode: defaults.mode,
            dwell: defaults.dwell ?? 0,
            release: defaults.release ?? 4,
            duration: defaults.duration,
            start: targetFrom(defaults.start_value),
            max: targetFrom(defaults.max_value),
            endAction,
            endValue: normalizeRampEndValue(defaults.end_value, endAction),
        });
    };

    const nudgeTimer = (delta: number) => {
        const next = Math.max(0.1, Math.round((ramp.timer + delta) * 10) / 10);
        onPatch({ timer: next });
    };

    const durationLabel =
        ramp.duration === -1 ? "∞" : formatClock(ramp.duration);
    const climbLabel =
        ramp.mode === RampMode.DRIFT
            ? "wander"
            : climbSeconds > 0
              ? formatClock(climbSeconds)
              : "—";
    const cycleLabel =
        ramp.mode === RampMode.ASCEND
            ? "hold"
            : cycleSeconds > 0
              ? formatClock(cycleSeconds)
              : "static";

    return (
        <aside
            className={cn(
                "flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card",
                className,
            )}
        >
            <header className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
                <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="font-mono text-[8px] tracking-[0.12em] text-muted-foreground/55 uppercase">
                        {live ? "Ramp lane" : "Selected lane"}
                    </p>
                    <div className="flex min-w-0 items-center gap-1.5">
                        {style.short !== RAMP_FIELD_LABELS[field] && (
                            <span
                                className={cn(
                                    "font-mono text-[11px] font-semibold uppercase",
                                    style.text,
                                )}
                            >
                                {style.short}
                            </span>
                        )}
                        <span className="truncate text-[12px] font-medium">
                            {RAMP_FIELD_LABELS[field]}
                        </span>
                        <span className="shrink-0 font-mono text-[8px] text-muted-foreground/55">
                            LIVE {lane.fieldLevel}%
                        </span>
                    </div>
                </div>
                <PresetMenu onApply={applyPreset} />
            </header>

            <div className="divide-y">
                <section className="flex flex-col gap-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                        <SectionLabel>Shape</SectionLabel>
                        <span className="font-mono text-[8px] text-muted-foreground/45">
                            {modeLabelOf(ramp.mode)}
                        </span>
                    </div>
                    <ModePalette
                        mode={ramp.mode}
                        onSelect={(mode) => onPatch({ mode })}
                    />
                    <p className="text-[9px] leading-snug text-muted-foreground/70">
                        {modeHint}
                    </p>
                </section>

                <section className="flex flex-col gap-3 p-3">
                    <SectionLabel>Timing</SectionLabel>

                    <div className="flex flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[11px] font-medium">
                                Timer
                            </span>
                            <span className="font-mono text-[8px] text-muted-foreground/55">
                                seconds between steps
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label="Decrease timer"
                                className="size-7 shrink-0"
                                disabled={ramp.timer <= 0.1}
                                onClick={() => nudgeTimer(-0.1)}
                            >
                                <Minus className="h-3 w-3" />
                            </Button>
                            <RampNumberField
                                value={ramp.timer}
                                min={0.1}
                                step={0.1}
                                ariaLabel="Timer in seconds"
                                onChange={(value) => onPatch({ timer: value })}
                                className="h-7 min-w-0 flex-1 text-center font-mono text-[11px]"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label="Increase timer"
                                className="size-7 shrink-0"
                                onClick={() => nudgeTimer(0.1)}
                            >
                                <Plus className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[11px] font-medium">
                                Step
                            </span>
                            <span className="font-mono text-[8px] text-muted-foreground/55">
                                {ramp.mode === RampMode.SQUARE
                                    ? "ignored by square"
                                    : "size of each move"}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <RampNumberField
                                value={ramp.step}
                                min={0.1}
                                max={
                                    ramp.stepUnit === "percent"
                                        ? 100
                                        : undefined
                                }
                                step={0.1}
                                ariaLabel="Step size"
                                onChange={(value) => onPatch({ step: value })}
                                className="h-7 min-w-0 flex-1 text-center font-mono text-[11px]"
                            />
                            <Select
                                value={ramp.stepUnit}
                                onValueChange={(value) =>
                                    onPatch({
                                        stepUnit:
                                            value === "absolute"
                                                ? "absolute"
                                                : "percent",
                                    })
                                }
                            >
                                <SelectTrigger
                                    size="sm"
                                    className="h-7 w-[88px] shrink-0 text-[10px]"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent position="popper">
                                    <SelectItem value="percent">
                                        % of max
                                    </SelectItem>
                                    <SelectItem value="absolute">
                                        level
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[11px] font-medium">
                                Run for
                            </span>
                            <span className="font-mono text-[8px] text-muted-foreground/55">
                                {durationLabel}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                            {DURATION_PRESETS.map((preset) => (
                                <ToggleChip
                                    key={preset.value}
                                    active={ramp.duration === preset.value}
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() =>
                                        onPatch({ duration: preset.value })
                                    }
                                >
                                    {preset.label}
                                </ToggleChip>
                            ))}
                            <RampNumberField
                                value={ramp.duration}
                                min={-1}
                                ariaLabel="Duration in seconds"
                                onChange={(value) =>
                                    onPatch({
                                        // 0 and negatives are not valid
                                        // durations: only -1 (permanent).
                                        duration: value <= 0 ? -1 : value,
                                    })
                                }
                                className="h-6 w-20 px-1.5 text-center font-mono text-[10px] tabular-nums"
                            />
                            <span className="text-[9px] text-muted-foreground/55">
                                s
                            </span>
                        </div>
                        <p className="text-[9px] leading-snug text-muted-foreground/60">
                            {ramp.duration === -1
                                ? live
                                    ? `Runs until you stop it; then ${endText}.`
                                    : "Runs until the profile is stopped; that restores its snapshot."
                                : `Stops after ${formatClock(ramp.duration)} and ${endText}.`}
                        </p>
                    </div>

                    {ramp.mode === RampMode.DWELL && (
                        <label className="flex items-center justify-between gap-2">
                            <span className="flex flex-col">
                                <span className="text-[11px] font-medium">
                                    Hold
                                </span>
                                <span className="text-[8px] text-muted-foreground/55">
                                    pause at each end
                                </span>
                            </span>
                            <span className="flex items-center gap-1">
                                <RampNumberField
                                    value={ramp.dwell}
                                    min={0}
                                    step={0.1}
                                    ariaLabel="Dwell in seconds"
                                    onChange={(value) =>
                                        onPatch({ dwell: value })
                                    }
                                    className="h-7 w-16 text-center font-mono text-[11px]"
                                />
                                <span className="text-[9px] text-muted-foreground/55">
                                    s
                                </span>
                            </span>
                        </label>
                    )}

                    {ramp.mode === RampMode.SURGE && (
                        <label className="flex items-center justify-between gap-2">
                            <span className="flex flex-col">
                                <span className="text-[11px] font-medium">
                                    Release
                                </span>
                                <span className="text-[8px] text-muted-foreground/55">
                                    higher = faster drop
                                </span>
                            </span>
                            <span className="flex items-center gap-1">
                                <RampNumberField
                                    value={ramp.release}
                                    min={0.1}
                                    step={0.1}
                                    ariaLabel="Release multiplier"
                                    onChange={(value) =>
                                        onPatch({ release: value })
                                    }
                                    className="h-7 w-16 text-center font-mono text-[11px]"
                                />
                                <span className="text-[9px] text-muted-foreground/55">
                                    ×
                                </span>
                            </span>
                        </label>
                    )}

                    {ramp.mode === RampMode.SQUARE && (
                        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[9px] leading-snug text-amber-700 dark:text-amber-200">
                            Square jumps straight to the peak every timer. Keep
                            the peak conservative.
                        </p>
                    )}
                </section>

                <section className="flex flex-col gap-3 p-3">
                    <SectionLabel>Range</SectionLabel>

                    <TargetRow
                        label="Starts at"
                        target={ramp.start}
                        fallback={lane.fieldLevel}
                        liveLabel={live ? "Current level" : "Live at apply"}
                        liveBadge={live ? "current" : "at apply"}
                        hint={
                            ramp.start.mode === "live"
                                ? live
                                    ? "Uses the channel's current level when the ramp starts."
                                    : "Uses the channel level when the profile is applied."
                                : ramp.start.mode === "fixed"
                                  ? "The ramp cycle rests at this level."
                                  : live
                                    ? "A MagicNumber range, rolled when the ramp starts."
                                    : "A MagicNumber range, rolled when applied."
                        }
                        onChange={(start) => onPatch({ start })}
                    />

                    <TargetRow
                        label="Climbs to"
                        target={ramp.max}
                        fallback={lane.fieldLevel}
                        liveLabel={live ? "Current level" : "Live at apply"}
                        liveBadge={live ? "current" : "at apply"}
                        hint={
                            ramp.max.mode === "live"
                                ? live
                                    ? "Scales with the level captured at start, so it follows the channel."
                                    : "Scales with the apply intensity, so it follows the channel."
                                : ramp.max.mode === "fixed"
                                  ? "The ceiling this lane climbs toward."
                                  : live
                                    ? "A MagicNumber range, rolled when the ramp starts."
                                    : "A MagicNumber range, rolled when applied."
                        }
                        onChange={(max) => {
                            const nextMax = resolveRampTarget(
                                max,
                                lane.fieldLevel,
                            );
                            onPatch({
                                max,
                                ...(ramp.endAction ===
                                    RampEndAction.SET_LEVEL &&
                                ramp.endValue > nextMax
                                    ? {
                                          endValue: clampLevel(nextMax),
                                      }
                                    : {}),
                            });
                        }}
                    />

                    <RangeBar start={lane.startLevel} max={lane.maxLevel} />

                    {usesRange && (
                        <p className="text-[9px] leading-snug text-muted-foreground/60">
                            Preview uses the midpoint of each range; the real
                            value is rolled {live ? "at start" : "at apply"}.
                        </p>
                    )}

                    {flat && (
                        <div className="flex flex-col items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[9px] leading-snug text-amber-700 dark:text-amber-200">
                            <p>
                                {lane.maxLevel >= 100
                                    ? "This lane is flat at the top. Lower “Starts at” to give it room to move."
                                    : `This lane is flat: both ends resolve to ${lane.maxLevel}%. Set “Climbs to” to Fixed and raise the ceiling.`}
                            </p>
                            {lane.maxLevel < 100 && (
                                <button
                                    type="button"
                                    className="cursor-pointer rounded-full border border-amber-500/40 bg-background/40 px-2 py-0.5 font-mono text-[9px] transition-colors hover:bg-background/80"
                                    onClick={() =>
                                        onPatch({
                                            max: {
                                                mode: "fixed",
                                                value: clampLevel(
                                                    lane.maxLevel + 10,
                                                ),
                                                range: "",
                                            },
                                        })
                                    }
                                >
                                    Set peak to {clampLevel(lane.maxLevel + 10)}
                                    %
                                </button>
                            )}
                        </div>
                    )}

                    {ramp.mode === RampMode.ASCEND &&
                        lane.startLevel > lane.maxLevel && (
                            <p className="text-[9px] leading-snug text-amber-700 dark:text-amber-200">
                                Ascend will descend from the start to the
                                ceiling.
                            </p>
                        )}
                </section>

                <section className="flex flex-col gap-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                        <SectionLabel>When it ends</SectionLabel>
                        <span className="font-mono text-[8px] text-muted-foreground/45">
                            {endOption.label}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1">
                        {RAMP_END_OPTIONS.map((option) => (
                            <ToggleChip
                                key={option.value}
                                active={ramp.endAction === option.value}
                                title={option.hint}
                                className="h-7 justify-center px-1.5 text-[10px]"
                                onClick={() =>
                                    onPatch({ endAction: option.value })
                                }
                            >
                                {option.label}
                            </ToggleChip>
                        ))}
                    </div>

                    {ramp.endAction === RampEndAction.SET_LEVEL && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <RampNumberField
                                value={ramp.endValue}
                                min={0}
                                max={100}
                                ariaLabel="End level"
                                onChange={(value) =>
                                    onPatch({
                                        endValue: clampLevel(value),
                                    })
                                }
                                className="h-7 w-20 text-center font-mono text-[11px] tabular-nums"
                            />
                            <span className="text-[9px] text-muted-foreground/60">
                                capped at peak level {lane.maxLevel}
                            </span>
                        </div>
                    )}

                    {ramp.endAction === RampEndAction.SET_LEVEL &&
                        ramp.endValue > lane.maxLevel && (
                            <p className="text-[9px] leading-snug text-amber-700 dark:text-amber-200">
                                {clampLevel(ramp.endValue)} is above the peak
                                level; this lane will cap the end level at{" "}
                                {lane.maxLevel}.
                            </p>
                        )}

                    <p className="text-[9px] leading-snug text-muted-foreground/65">
                        {endOption.hint}{" "}
                        {live
                            ? "Applies on natural end and when you press Stop."
                            : "Applies when this ramp ends; stopping the profile restores its snapshot instead."}
                    </p>
                </section>

                <section className="flex flex-col gap-2 p-3">
                    <SectionLabel>Readout</SectionLabel>
                    <div className="grid grid-cols-3 gap-1">
                        {[
                            { label: "Climb", value: climbLabel },
                            { label: "Cycle", value: cycleLabel },
                            { label: "Peak", value: `${lane.maxLevel}%` },
                        ].map((stat) => (
                            <div
                                key={stat.label}
                                className="flex flex-col gap-0.5 rounded-md bg-muted/30 px-1.5 py-1.5"
                            >
                                <span className="font-mono text-[7px] tracking-[0.08em] text-muted-foreground/55 uppercase">
                                    {stat.label}
                                </span>
                                <span className="font-mono text-[11px] leading-none tabular-nums">
                                    {stat.value}
                                </span>
                            </div>
                        ))}
                    </div>
                    <p className="text-[9px] leading-snug text-muted-foreground/60">
                        {ramp.mode === RampMode.ASCEND
                            ? `Climbs to ${lane.maxLevel}% and holds there${
                                  ramp.duration === -1
                                      ? " until stopped."
                                      : ` until it stops after ${formatClock(ramp.duration)}.`
                              }`
                            : cycleSeconds <= 0
                              ? `Both ends resolve to ${lane.maxLevel}%, so this lane holds that level. Raise the ceiling to give it a shape.`
                              : ramp.duration === -1
                                ? `One cycle takes ${cycleLabel}, then repeats until stopped.`
                                : `One cycle takes ${cycleLabel} and the lane stops after ${formatClock(ramp.duration)}.`}
                    </p>
                </section>
            </div>

            {onRemove && (
                <footer className="border-t p-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full justify-center text-[10px] text-muted-foreground hover:text-destructive"
                        onClick={onRemove}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove ramp
                    </Button>
                </footer>
            )}
        </aside>
    );
}
