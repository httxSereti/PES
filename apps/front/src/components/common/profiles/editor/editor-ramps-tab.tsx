import { useEffect, useMemo, useState } from "react";
import { ClipboardCopy, Plus } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { cn } from "@pes/ui/lib/utils";

import {
    buildRampCurve,
    formatClock,
    shapeAreaPath,
    shapeLinePath,
} from "../profile-shape";
import {
    RAMPABLE_FIELDS,
    type RampField,
    type UnitDraft,
} from "./profile-document";
import type { LiveRampLike, ProfileEditorActions } from "./use-profile-editor";
import {
    PLOT_HEIGHT,
    PLOT_PADDING,
    PLOT_WIDTH,
    Playhead,
    RAMP_LANE_STYLES,
    RampCurveChart,
    RampInspector,
    TimelineRuler,
    TimelineToolbar,
    gridY,
    laneLevelAt,
    modeLabelOf,
    rampCurveInput,
    resolveRampTarget,
    sampleCurve,
    type RampStudioLane,
} from "../../ramps/ramp-studio-parts";

type LaneModel = RampStudioLane & {
    samples: number[];
};

function StudioHeader({
    unit,
    rampCount,
    liveRampCount,
    onCopyLive,
}: {
    unit: UnitDraft;
    rampCount: number;
    liveRampCount: number;
    onCopyLive: () => void;
}) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
                <p className="font-mono text-[9px] tracking-[0.16em] text-primary/50 uppercase">
                    Ramp studio · {unit.id}
                </p>
                <h3 className="text-[16px] leading-tight font-semibold tracking-tight">
                    Shape how this unit moves.
                </h3>
                <p className="max-w-[460px] text-[11px] leading-snug text-muted-foreground">
                    Pick a lane, choose a shape, then dial in the feel. Ramps
                    start when the profile is applied.
                </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-[9px] text-muted-foreground/60">
                    {rampCount === 0
                        ? "no lanes moving yet"
                        : `${rampCount} of 4 lanes moving`}
                </span>
                {liveRampCount > 0 && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={onCopyLive}
                    >
                        <ClipboardCopy className="h-3 w-3" />
                        Copy {liveRampCount} live
                    </Button>
                )}
            </div>
        </div>
    );
}

function LaneRow({
    lane,
    selected,
    windowSeconds,
    hoverRatio,
    onSelect,
    onHover,
    onAdd,
}: {
    lane: LaneModel;
    selected: boolean;
    windowSeconds: number;
    hoverRatio: number | null;
    onSelect: () => void;
    onHover: (ratio: number | null) => void;
    onAdd: () => void;
}) {
    const style = RAMP_LANE_STYLES[lane.field];
    const ramp = lane.ramp;
    const stopRatio =
        ramp && ramp.duration > 0 && ramp.duration < windowSeconds
            ? ramp.duration / windowSeconds
            : null;

    return (
        <div
            className={cn(
                "grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors",
                selected
                    ? "border-purple-500/40 bg-purple-500/[0.04]"
                    : "border-border/60 bg-card hover:border-border",
            )}
        >
            <button
                type="button"
                aria-pressed={selected}
                onClick={onSelect}
                className="flex min-w-0 cursor-pointer flex-col items-start gap-0.5 text-left"
            >
                <span className="flex items-baseline gap-1.5">
                    <span
                        className={cn(
                            "font-mono text-[11px] font-semibold uppercase",
                            style.text,
                        )}
                    >
                        {style.short}
                    </span>
                    <span className="font-mono text-[20px] leading-none tabular-nums">
                        {ramp ? lane.fieldLevel : "—"}
                    </span>
                </span>
                <span className="font-mono text-[8px] tracking-[0.06em] text-muted-foreground/65 uppercase">
                    {ramp ? modeLabelOf(ramp.mode) : "empty lane"}
                </span>
                {ramp ? (
                    <span className="max-w-full truncate font-mono text-[8px] text-muted-foreground/55 tabular-nums">
                        start {lane.startLevel} · peak {lane.maxLevel}
                    </span>
                ) : (
                    <span className="font-mono text-[8px] text-muted-foreground/45">
                        level {lane.fieldLevel}
                    </span>
                )}
            </button>

            {ramp && lane.curve ? (
                <RampCurveChart
                    samples={lane.samples}
                    maxLevel={lane.maxLevel}
                    tone={style.text}
                    className={
                        selected ? "border-purple-500/25" : "border-border/50"
                    }
                    stopRatio={stopRatio}
                    hoverRatio={hoverRatio}
                    onHover={onHover}
                    onSelect={onSelect}
                    ariaLabel={`${style.label} ramp shape`}
                />
            ) : (
                <div
                    className={cn(
                        "relative h-[68px] cursor-pointer overflow-hidden rounded-md border bg-muted/15",
                        selected ? "border-purple-500/25" : "border-border/50",
                    )}
                    onClick={onSelect}
                >
                    <svg
                        viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
                        preserveAspectRatio="none"
                        className="h-full w-full text-muted-foreground/30"
                        aria-hidden="true"
                    >
                        <line
                            x1={0}
                            y1={gridY(lane.fieldLevel)}
                            x2={PLOT_WIDTH}
                            y2={gridY(lane.fieldLevel)}
                            stroke="currentColor"
                            strokeWidth={1.25}
                            strokeDasharray="2 3"
                            vectorEffect="non-scaling-stroke"
                        />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                onAdd();
                            }}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 font-mono text-[9px] text-muted-foreground transition-colors hover:border-purple-500/40 hover:text-foreground"
                        >
                            <Plus className="h-3 w-3" />
                            Add {style.label} ramp
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function EnvelopeRow({
    samples,
    hoverRatio,
}: {
    samples: number[];
    hoverRatio: number | null;
}) {
    const peak = samples.length > 0 ? Math.max(...samples) : 0;

    return (
        <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/[0.04] px-2 py-1.5">
            <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-mono text-[10px] font-semibold tracking-[0.06em] text-purple-700 uppercase dark:text-purple-300">
                    A+B
                </span>
                <span className="font-mono text-[18px] leading-none tabular-nums">
                    {samples.length > 0 ? peak : "—"}
                </span>
                <span className="font-mono text-[8px] text-muted-foreground/55">
                    highest
                </span>
            </div>

            <div className="relative h-[44px] overflow-hidden rounded-md border border-purple-500/15 bg-background/40">
                {samples.length > 0 ? (
                    <>
                        <svg
                            viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
                            preserveAspectRatio="none"
                            className="h-full w-full text-purple-600 dark:text-purple-400"
                            aria-hidden="true"
                        >
                            <line
                                x1={0}
                                y1={gridY(0)}
                                x2={PLOT_WIDTH}
                                y2={gridY(0)}
                                stroke="currentColor"
                                strokeOpacity={0.16}
                                strokeWidth={1}
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
                                fillOpacity={0.16}
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
                        <Playhead ratio={hoverRatio} />
                    </>
                ) : (
                    <div className="flex h-full items-center justify-center px-2 text-center font-mono text-[8px] text-muted-foreground/50">
                        Add a channel ramp to see the intensity envelope
                    </div>
                )}
            </div>
        </div>
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
    const [selectedField, setSelectedField] = useState<RampField | null>(null);
    const [scale, setScale] = useState<number | "fit">(180);
    const [hoverRatio, setHoverRatio] = useState<number | null>(null);

    const unitLiveRamps = liveRamps.filter((ramp) => ramp.unit === unit.id);

    // Selecting a lane in another unit should not carry over.
    useEffect(() => {
        setSelectedField(null);
        setHoverRatio(null);
    }, [unit.id]);

    const laneModels = useMemo<LaneModel[]>(() => {
        return RAMPABLE_FIELDS.map((field) => {
            const ramp = unit.ramps[field];
            const fieldLevel = unit[field];

            if (!ramp) {
                return {
                    field,
                    ramp: null,
                    fieldLevel,
                    startLevel: fieldLevel,
                    maxLevel: fieldLevel,
                    curve: null,
                    samples: [],
                };
            }

            const startLevel = resolveRampTarget(ramp.start, fieldLevel);
            const maxLevel = resolveRampTarget(ramp.max, fieldLevel);
            return {
                field,
                ramp,
                fieldLevel,
                startLevel,
                maxLevel,
                curve: buildRampCurve(
                    rampCurveInput(ramp, startLevel, maxLevel),
                ),
                samples: [],
            };
        });
    }, [unit]);

    const programWindow = useMemo(() => {
        let longest = 0;
        for (const lane of laneModels) {
            if (!lane.ramp || !lane.curve) continue;
            const span =
                lane.ramp.duration > 0
                    ? lane.ramp.duration
                    : lane.curve.periodSeconds;
            longest = Math.max(longest, span);
        }
        return longest > 0 ? longest : 60;
    }, [laneModels]);

    const windowSeconds = scale === "fit" ? programWindow : scale;

    const lanes = useMemo<LaneModel[]>(() => {
        return laneModels.map((lane) => {
            if (!lane.ramp || !lane.curve) return lane;
            return {
                ...lane,
                samples: sampleCurve(
                    lane.curve,
                    windowSeconds,
                    lane.ramp.duration,
                    lane.maxLevel,
                ),
            };
        });
    }, [laneModels, windowSeconds]);

    const activeFields = RAMPABLE_FIELDS.filter((field) =>
        Boolean(unit.ramps[field]),
    );
    const activeField = selectedField ?? activeFields[0] ?? "ch_A";
    const selectedLane =
        lanes.find((lane) => lane.field === activeField) ?? lanes[0] ?? null;

    const envelope = useMemo(() => {
        const a = lanes.find((lane) => lane.field === "ch_A")?.samples ?? [];
        const b = lanes.find((lane) => lane.field === "ch_B")?.samples ?? [];
        if (a.length === 0) return b;
        if (b.length === 0) return a;
        return a.map((value, index) => Math.max(value, b[index] ?? 0));
    }, [lanes]);

    const hoverSeconds =
        hoverRatio === null ? null : hoverRatio * windowSeconds;
    const hoverLevel =
        hoverSeconds !== null && selectedLane
            ? laneLevelAt(selectedLane, hoverSeconds)
            : null;

    const highestPeak = lanes.reduce(
        (peak, lane) => (lane.ramp ? Math.max(peak, lane.maxLevel) : peak),
        0,
    );

    const readout =
        hoverSeconds !== null && selectedLane?.ramp && hoverLevel !== null
            ? `at ${formatClock(hoverSeconds)} · ${RAMP_LANE_STYLES[selectedLane.field].short} ${hoverLevel}%`
            : `showing ${formatClock(windowSeconds)}`;

    const addRamp = (field: RampField) => {
        actions.addRamp(unit.id, field);
        setSelectedField(field);
    };

    return (
        <div className="@container flex flex-col gap-3">
            <StudioHeader
                unit={unit}
                rampCount={activeFields.length}
                liveRampCount={unitLiveRamps.length}
                onCopyLive={() => actions.copyLiveRamps(unit.id, unitLiveRamps)}
            />

            <div className="grid items-start gap-3 @min-[820px]:grid-cols-[minmax(0,1fr)_292px]">
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

                        {lanes.map((lane) => (
                            <LaneRow
                                key={lane.field}
                                lane={lane}
                                selected={activeField === lane.field}
                                windowSeconds={windowSeconds}
                                hoverRatio={hoverRatio}
                                onSelect={() => setSelectedField(lane.field)}
                                onHover={setHoverRatio}
                                onAdd={() => addRamp(lane.field)}
                            />
                        ))}

                        <div className="border-t border-border/50 pt-2">
                            <EnvelopeRow
                                samples={envelope}
                                hoverRatio={hoverRatio}
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-[10px] text-muted-foreground/65">
                        <span>
                            Live preview runs while you edit — nothing reaches
                            the unit until the profile is applied.
                        </span>
                        <span className="font-mono text-[9px] tabular-nums">
                            {activeFields.length === 0
                                ? "no ramps yet"
                                : `${activeFields.length} ramp${activeFields.length === 1 ? "" : "s"} · peak ${highestPeak}%`}
                        </span>
                    </div>
                </div>

                {selectedLane && (
                    <RampInspector
                        lane={selectedLane}
                        context="profile"
                        onPatch={(patch) =>
                            actions.patchRamp(
                                unit.id,
                                selectedLane.field,
                                patch,
                            )
                        }
                        onRemove={() =>
                            actions.removeRamp(unit.id, selectedLane.field)
                        }
                        onAdd={() => addRamp(selectedLane.field)}
                    />
                )}
            </div>
        </div>
    );
}
