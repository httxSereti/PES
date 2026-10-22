import { useEffect, useMemo, useState } from "react";
import { BookmarkPlus, Loader2, Play } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@pes/ui/components/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@pes/ui/components/dialog";
import { Input } from "@pes/ui/components/input";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useRampDefaults, type RampDefaults } from "@/hooks/useRampDefaults";
import { useRampPresets } from "@/hooks/useRampPresets";
import { RampEndAction, RampMode, type RampStartPayload } from "@/types";
import {
    normalizeRampEndAction,
    normalizeRampEndValue,
} from "@/lib/ramp-end";

import { buildRampCurve, formatClock } from "../profiles/profile-shape";
import {
    clampLevel,
    rampTargetIsValid,
    type RampDraft,
    type RampTargetDraft,
} from "../profiles/editor/profile-document";
import { FIELD_LABELS } from "./ramp.constants";
import { describeDefaults, describeRampEnd } from "./ramp-format";
import {
    RAMP_LANE_STYLES,
    RampCurveChart,
    RampInspector,
    TimelineRuler,
    TimelineToolbar,
    climbSecondsOf,
    laneLevelAt,
    modeLabelOf,
    rampCurveInput,
    resolveRampTarget,
    sampleCurve,
    type RampStudioLane,
} from "./ramp-studio-parts";

const DEFAULT_DRAFT: RampDraft = {
    timer: 1,
    step: 1,
    stepUnit: "percent",
    mode: RampMode.RESET,
    dwell: 0,
    release: 4,
    duration: -1,
    start: { mode: "live", value: 50, range: "" },
    max: { mode: "live", value: 50, range: "" },
    endAction: RampEndAction.HOLD_PEAK,
    endValue: 0,
    raw: {},
};

function targetFromValue(
    value: number | string | null | undefined,
): RampTargetDraft {
    if (typeof value === "number") {
        return { mode: "fixed", value: clampLevel(value), range: "" };
    }
    if (typeof value === "string") {
        return { mode: "range", value: 50, range: value };
    }
    return { mode: "live", value: 50, range: "" };
}

function draftFromDefaults(defaults: RampDefaults): RampDraft {
    const endAction = normalizeRampEndAction(defaults.end_action);
    return {
        timer: defaults.timer,
        step: defaults.step,
        stepUnit: defaults.step_unit === "absolute" ? "absolute" : "percent",
        mode: defaults.mode,
        dwell: defaults.dwell ?? 0,
        release: defaults.release ?? 4,
        duration: defaults.duration,
        start: targetFromValue(defaults.start_value),
        max: targetFromValue(defaults.max_value),
        endAction,
        endValue: normalizeRampEndValue(defaults.end_value, endAction),
        raw: {},
    };
}

function defaultsFromDraft(draft: RampDraft): RampDefaults {
    const serialize = (target: RampTargetDraft): number | string | null => {
        if (target.mode === "fixed") return clampLevel(target.value);
        if (target.mode === "range") return target.range.trim();
        return null;
    };

    return {
        timer: draft.timer,
        step: draft.step,
        step_unit: draft.stepUnit,
        mode: draft.mode,
        dwell: draft.dwell,
        release: draft.release,
        duration: draft.duration,
        start_value: serialize(draft.start),
        max_value: serialize(draft.max),
        end_action: draft.endAction,
        end_value:
            draft.endAction === RampEndAction.SET_LEVEL
                ? clampLevel(draft.endValue)
                : null,
    };
}

/** First blocking issue, or null when the ramp can start. */
function validateDraft(draft: RampDraft): string | null {
    if (!Number.isFinite(draft.timer) || draft.timer <= 0) {
        return "Timer must be greater than 0.";
    }
    if (!Number.isFinite(draft.step) || draft.step <= 0) {
        return "Step must be greater than 0.";
    }
    if (!Number.isFinite(draft.dwell) || draft.dwell < 0) {
        return "Hold must be 0 or greater.";
    }
    if (!Number.isFinite(draft.release) || draft.release <= 0) {
        return "Release must be greater than 0.";
    }
    if (
        draft.duration !== -1 &&
        (!Number.isFinite(draft.duration) || draft.duration <= 0)
    ) {
        return "Pick a duration, or ∞ to run until stopped.";
    }
    if (!rampTargetIsValid(draft.start)) {
        return "Fix the start value: use 0–100 or a range like [25-35].";
    }
    if (!rampTargetIsValid(draft.max)) {
        return "Fix the peak value: use 0–100 or a range like [25-35].";
    }
    if (
        draft.endAction === RampEndAction.SET_LEVEL &&
        (!Number.isFinite(draft.endValue) ||
            draft.endValue < 0 ||
            draft.endValue > 100)
    ) {
        return "Fix the end level: use a value between 0 and 100.";
    }
    return null;
}

type RampStartDialogProps = {
    unitId: RampStartPayload["unit"];
    field: RampStartPayload["field"];
    currentValue: number | undefined;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export function RampStartDialog({
    unitId,
    field,
    currentValue,
    open,
    onOpenChange,
}: RampStartDialogProps) {
    const { sendCommand } = useWebSocket();
    const { getDefaults, saveDefaults } = useRampDefaults();
    const { savePreset } = useRampPresets();

    const [draft, setDraft] = useState<RampDraft>(DEFAULT_DRAFT);
    const [scale, setScale] = useState<number | "fit">(180);
    const [hoverRatio, setHoverRatio] = useState<number | null>(null);
    const [starting, setStarting] = useState(false);
    const [presetOpen, setPresetOpen] = useState(false);
    const [presetName, setPresetName] = useState("");

    const style = RAMP_LANE_STYLES[field];

    // Prefill with the user's remembered settings for this channel.
    useEffect(() => {
        if (!open) return;
        setPresetOpen(false);
        setPresetName("");
        setScale(180);
        setHoverRatio(null);
        const stored = getDefaults(unitId, field);
        setDraft(stored ? draftFromDefaults(stored) : DEFAULT_DRAFT);
    }, [open, unitId, field, getDefaults]);

    const fieldLevel = currentValue ?? 0;
    const startLevel = resolveRampTarget(draft.start, fieldLevel);
    const maxLevel = resolveRampTarget(draft.max, fieldLevel);

    const curve = useMemo(
        () => buildRampCurve(rampCurveInput(draft, startLevel, maxLevel)),
        [draft, startLevel, maxLevel],
    );

    // Leave a short visible tail after a finite ramp so the configured end
    // behavior (hold/keep/start/set level) is visible in the fit view.
    const endTailSeconds =
        draft.duration > 0
            ? Math.min(30, Math.max(3, draft.duration * 0.15))
            : 0;
    const programWindow =
        draft.duration > 0
            ? draft.duration + endTailSeconds
            : curve.periodSeconds > 0
              ? curve.periodSeconds
              : 60;
    const windowSeconds = scale === "fit" ? programWindow : scale;
    const stopRatio =
        draft.duration > 0 && draft.duration < windowSeconds
            ? draft.duration / windowSeconds
            : null;

    const samples = useMemo(
        () => sampleCurve(draft, curve, windowSeconds, startLevel, maxLevel),
        [draft, curve, windowSeconds, startLevel, maxLevel],
    );

    const lane = useMemo<RampStudioLane>(
        () => ({
            field,
            ramp: draft,
            fieldLevel,
            startLevel,
            maxLevel,
            curve,
        }),
        [field, draft, fieldLevel, startLevel, maxLevel, curve],
    );

    const hoverSeconds =
        hoverRatio === null ? null : hoverRatio * windowSeconds;
    const hoverLevel =
        hoverSeconds === null ? null : laneLevelAt(lane, hoverSeconds);
    const readout =
        hoverSeconds !== null && hoverLevel !== null
            ? `at ${formatClock(hoverSeconds)} · ${style.short} ${hoverLevel}%`
            : `showing ${formatClock(windowSeconds)}`;

    const climbSeconds = climbSecondsOf(draft, startLevel, maxLevel);
    const issue = validateDraft(draft);
    const usesRange =
        draft.start.mode === "range" || draft.max.mode === "range";
    const flat = startLevel >= maxLevel && currentValue !== undefined;
    const canStart = issue === null && !starting;

    const stopRamp = async () => {
        try {
            const result = await sendCommand("ramps:stop", {
                unit: unitId,
                field,
            });
            if (result.status === "error") {
                toast.error(result.message ?? "Failed to stop ramp");
            }
        } catch (error) {
            console.error("Failed to stop ramp:", error);
            toast.error("Failed to stop ramp");
        }
    };

    const handleSavePreset = () => {
        if (issue) {
            toast.error(issue);
            return;
        }
        const saved = savePreset(presetName, defaultsFromDraft(draft));
        if (!saved) return;
        toast.success(`Preset "${saved.name}" saved`);
        setPresetName("");
        setPresetOpen(false);
    };

    const handleStart = async () => {
        if (issue) {
            toast.error(issue);
            return;
        }

        const defaults = defaultsFromDraft(draft);
        setStarting(true);
        try {
            const result = await sendCommand("ramps:start", {
                unit: unitId,
                field,
                ...defaults,
            });
            if (result.status === "error") {
                toast.error(result.message ?? "Failed to start ramp");
                return;
            }
            saveDefaults(unitId, field, defaults);
            toast.success(`Ramp started on ${FIELD_LABELS[field]}`, {
                description: `${unitId} — ${describeDefaults(defaults)}`,
                action: { label: "Stop", onClick: () => void stopRamp() },
                closeButton: true,
            });
            onOpenChange(false);
        } catch (error) {
            console.error("Failed to start ramp:", error);
            toast.error("Failed to start ramp");
        } finally {
            setStarting(false);
        }
    };

    const climbLabel =
        draft.mode === RampMode.DRIFT
            ? "wander"
            : climbSeconds > 0
              ? formatClock(climbSeconds)
              : "—";
    const cycleLabel =
        draft.mode === RampMode.ASCEND
            ? "hold"
            : curve.periodSeconds > 0
              ? formatClock(curve.periodSeconds)
              : "static";

    const stats = [
        { label: "Climb", value: climbLabel },
        { label: "Cycle", value: cycleLabel },
        { label: "Peak", value: `${maxLevel}%` },
        {
            label: "Run",
            value: draft.duration === -1 ? "∞" : formatClock(draft.duration),
        },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton
                className="flex h-dvh max-h-none w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[min(82dvh,780px)] sm:w-[min(900px,calc(100vw-3rem))] sm:max-w-[900px] sm:rounded-xl"
            >
                <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4 pr-14">
                    <div className="flex min-w-0 flex-col gap-1">
                        <p className="font-mono text-[9px] tracking-[0.16em] text-primary/50 uppercase">
                            Ramp studio · {unitId}
                        </p>
                        <DialogTitle className="text-[20px] leading-tight font-semibold tracking-tight">
                            Shape the {FIELD_LABELS[field]} ramp.
                        </DialogTitle>
                        <DialogDescription className="max-w-[560px] text-[11px] leading-snug">
                            Preview the motion and tune the feel. Nothing
                            reaches the unit until you press Start.
                        </DialogDescription>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="font-mono text-[8px] tracking-[0.12em] text-muted-foreground/55 uppercase">
                            Current level
                        </span>
                        <span className="font-mono text-[26px] leading-none tabular-nums">
                            {currentValue ?? "—"}
                            <span className="ml-0.5 text-[13px] text-muted-foreground/60">
                                %
                            </span>
                        </span>
                        <span className="flex items-center gap-1 font-mono text-[8px] text-muted-foreground/55">
                            <span
                                className={
                                    currentValue !== undefined
                                        ? "size-1.5 rounded-full bg-emerald-500"
                                        : "size-1.5 rounded-full bg-muted-foreground/40"
                                }
                            />
                            {currentValue !== undefined
                                ? "live from unit"
                                : "level unknown"}
                        </span>
                    </div>
                </header>

                <div className="@container min-h-0 flex-1 overflow-y-auto">
                    <div className="grid gap-3 p-4 @min-[760px]:grid-cols-[minmax(0,1fr)_300px]">
                        <div className="flex min-w-0 flex-col gap-3">
                            <TimelineToolbar
                                scale={scale}
                                onScaleChange={setScale}
                                readout={readout}
                            />

                            <div
                                className="flex flex-col gap-2 rounded-xl border bg-card/60 p-2.5"
                                onPointerLeave={() => setHoverRatio(null)}
                            >
                                <TimelineRuler windowSeconds={windowSeconds} />

                                <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2 rounded-lg border border-purple-500/40 bg-purple-500/[0.04] px-2 py-1.5">
                                    <div className="flex min-w-0 flex-col gap-0.5">
                                        <span className="flex items-baseline gap-1.5">
                                            <span
                                                className={`font-mono text-[11px] font-semibold uppercase ${style.text}`}
                                            >
                                                {style.short}
                                            </span>
                                            <span className="font-mono text-[24px] leading-none tabular-nums">
                                                {fieldLevel}
                                            </span>
                                        </span>
                                        <span className="font-mono text-[8px] tracking-[0.06em] text-muted-foreground/65 uppercase">
                                            {modeLabelOf(draft.mode)}
                                        </span>
                                        <span className="max-w-full truncate font-mono text-[8px] text-muted-foreground/55 tabular-nums">
                                            start {startLevel} · peak {maxLevel}
                                        </span>
                                    </div>

                                    <RampCurveChart
                                        samples={samples}
                                        maxLevel={maxLevel}
                                        tone={style.text}
                                        heightClassName="h-[188px]"
                                        stopRatio={stopRatio}
                                        hoverRatio={hoverRatio}
                                        onHover={setHoverRatio}
                                        ariaLabel={`${style.label} ramp preview`}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-1">
                                {stats.map((stat) => (
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
                                {draft.duration === -1
                                    ? `Runs until you stop it, then ${describeRampEnd(draft.endAction, draft.endValue, startLevel, maxLevel)}. The chart shows one cycle.`
                                    : `Stops after ${formatClock(draft.duration)} and ${describeRampEnd(draft.endAction, draft.endValue, startLevel, maxLevel)}.`}
                                {usesRange
                                    ? " Preview uses range midpoints; values are rolled when the ramp starts."
                                    : ""}
                                {currentValue === undefined
                                    ? " The unit level is unknown, so the preview assumes 0%; current-level targets resolve when the ramp starts."
                                    : ""}
                                {flat
                                    ? " Both ends resolve to the same level, so the lane will hold still."
                                    : ""}
                            </p>
                        </div>

                        <RampInspector
                            lane={lane}
                            context="live"
                            onPatch={(patch) =>
                                setDraft((current) => ({
                                    ...current,
                                    ...patch,
                                }))
                            }
                        />
                    </div>
                </div>

                <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
                    <div className="flex min-w-0 flex-col gap-1.5">
                        {presetOpen ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                                <Input
                                    type="text"
                                    placeholder="Preset name"
                                    className="h-8 w-44"
                                    value={presetName}
                                    autoFocus
                                    onChange={(event) =>
                                        setPresetName(event.target.value)
                                    }
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.preventDefault();
                                            handleSavePreset();
                                        }
                                        if (event.key === "Escape") {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            setPresetOpen(false);
                                            setPresetName("");
                                        }
                                    }}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8"
                                    disabled={!presetName.trim()}
                                    onClick={handleSavePreset}
                                >
                                    Save
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8"
                                    onClick={() => {
                                        setPresetOpen(false);
                                        setPresetName("");
                                    }}
                                >
                                    Cancel
                                </Button>
                            </div>
                        ) : (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="-ml-2 h-7 self-start text-[10px] text-muted-foreground"
                                onClick={() => setPresetOpen(true)}
                            >
                                <BookmarkPlus className="h-3.5 w-3.5" />
                                Save as preset
                            </Button>
                        )}
                        <p className="max-w-[420px] text-[10px] leading-snug text-muted-foreground/60">
                            Starting remembers these settings for {unitId} ·{" "}
                            {FIELD_LABELS[field]}.
                        </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                        {issue && (
                            <p className="max-w-[320px] text-right text-[9px] leading-snug text-amber-600 dark:text-amber-300">
                                {issue}
                            </p>
                        )}
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => onOpenChange(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                disabled={!canStart}
                                onClick={() => void handleStart()}
                            >
                                {starting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Play className="h-4 w-4" />
                                )}
                                Start ramp
                            </Button>
                        </div>
                    </div>
                </footer>
            </DialogContent>
        </Dialog>
    );
}
