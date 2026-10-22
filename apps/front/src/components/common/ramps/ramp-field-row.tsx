import { useState } from "react";
import { Pause, Play, SlidersHorizontal, Square } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { cn } from "@pes/ui/lib/utils";

import { useRampControl } from "@/hooks/useRampControl";
import { useRampDefaults, type RampDefaults } from "@/hooks/useRampDefaults";
import { useRampElapsed } from "@/hooks/useRampElapsed";
import { useAppSelector } from "@/store/hooks";
import { rampsSelectors } from "@/store/slices/rampsSlice";
import { unitsSelectors } from "@/store/slices/unitsSlice";
import { RampMode, type Ramp, type RampStartPayload } from "@/types";

import { FIELD_LABELS } from "./ramp.constants";
import {
    describeRampEndShort,
    formatDuration,
    formatSeconds,
    summarizeValue,
} from "./ramp-format";
import { RampStartDialog } from "./ramp-start-dialog";
import {
    RAMP_LANE_STYLES,
    RampModeGlyph,
    modeLabelOf,
} from "./ramp-studio-parts";

type RampFieldRowProps = {
    unitId: string;
    field: RampStartPayload["field"];
};

type RampUnit = RampStartPayload["unit"];
type RampField = RampStartPayload["field"];

export function RampFieldRow({ unitId, field }: RampFieldRowProps) {
    const [open, setOpen] = useState(false);
    // the UI only renders the 3 known units
    const unit = unitId as RampUnit;
    const unitState = useAppSelector((state) =>
        unitsSelectors.selectById(state, unitId),
    );
    const ramp = useAppSelector((state) =>
        rampsSelectors.selectById(state, `${unitId}.${field}`),
    );

    const value = unitState?.[field];

    return (
        <>
            {ramp ? (
                <RunningRampRow
                    unit={unit}
                    field={field}
                    ramp={ramp}
                    value={value}
                />
            ) : (
                <IdleRampRow
                    unit={unit}
                    field={field}
                    value={value}
                    onOpen={() => setOpen(true)}
                />
            )}

            <RampStartDialog
                unitId={unit}
                field={field}
                currentValue={value}
                open={open}
                onOpenChange={setOpen}
            />
        </>
    );
}

function RunningRampRow({
    unit,
    field,
    ramp,
    value,
}: {
    unit: RampUnit;
    field: RampField;
    ramp: Ramp;
    value: number | undefined;
}) {
    const { control, pending } = useRampControl();
    const elapsed = useRampElapsed(ramp);
    const style = RAMP_LANE_STYLES[field];

    // `units:update` keeps the field level fresh; `ramp.value` only changes on
    // lifecycle events, so it is only the fallback.
    const liveValue = value ?? ramp.value;
    const paused = ramp.paused;
    const total = ramp.duration > 0 ? ramp.duration : null;
    const elapsedSeconds = total ? Math.min(elapsed, total) : elapsed;
    const timePct = total
        ? Math.min(100, Math.max(0, (elapsedSeconds / total) * 100))
        : null;

    const stepText = describeStep(ramp);
    const modeLabel = modeLabelOf(ramp.mode);
    const endText = describeRampEndShort(ramp.end_action, ramp.end_value);
    const targetText = `${ramp.start_value} → ${ramp.max_value}%${endText ? ` · ${endText}` : ""}`;

    return (
        <div className="flex flex-col gap-2 py-2 first:pt-1.5 last:pb-0">
            <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span
                        className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            paused ? "bg-amber-500" : style.bar,
                        )}
                    />
                    <span className="truncate text-[11px] font-medium text-foreground/90">
                        {FIELD_LABELS[field]}
                    </span>
                    <StatusBadge status={paused ? "paused" : "running"} />
                </div>

                <div className="flex shrink-0 items-center gap-1">
                    <Button
                        variant="outline"
                        size="icon"
                        className={cn(
                            "size-7 cursor-pointer",
                            paused &&
                                "border-amber-500/40 text-amber-600 dark:text-amber-400",
                        )}
                        title={paused ? "Resume ramp" : "Pause ramp"}
                        aria-label={paused ? "Resume ramp" : "Pause ramp"}
                        disabled={pending}
                        onClick={() =>
                            void control(
                                paused ? "ramps:resume" : "ramps:pause",
                                unit,
                                field,
                            )
                        }
                    >
                        {paused ? (
                            <Play className="size-3.5" />
                        ) : (
                            <Pause className="size-3.5" />
                        )}
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        className="size-7 cursor-pointer hover:border-destructive/40 hover:text-destructive"
                        title="Stop ramp"
                        aria-label="Stop ramp"
                        disabled={pending}
                        onClick={() => void control("ramps:stop", unit, field)}
                    >
                        <Square className="size-3.5" />
                    </Button>
                </div>
            </div>

            <div className="flex min-w-0 items-center justify-between gap-2">
                <Level value={liveValue} />
                <div
                    className="flex min-w-0 items-center justify-end gap-1.5 text-[10px] text-muted-foreground"
                    title={`${modeLabel} · start ${ramp.start_value}% · peak ${ramp.max_value}%`}
                >
                    <RampModeGlyph
                        mode={ramp.mode}
                        className={cn("shrink-0", style.text)}
                    />
                    <span className="shrink-0 font-medium text-foreground/80">
                        {modeLabel}
                    </span>
                    <span className="shrink-0 text-muted-foreground/50">·</span>
                    <span className="truncate font-mono tabular-nums">
                        {targetText}
                    </span>
                </div>
            </div>

            <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 font-mono text-[9px] text-muted-foreground/80">
                    <span className="truncate">{stepText}</span>
                    <span className="shrink-0 tabular-nums">
                        {total
                            ? `${formatSeconds(elapsedSeconds)} / ${formatDuration(total)}`
                            : `${formatSeconds(elapsedSeconds)} · until stopped`}
                    </span>
                </div>
                {timePct !== null ? (
                    <div
                        className="h-1 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-label="Run progress"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(timePct)}
                        title={`${Math.round(timePct)}% of the run elapsed`}
                    >
                        <div
                            className={cn(
                                "h-full rounded-full transition-[width] duration-500",
                                paused ? "bg-amber-500" : style.bar,
                            )}
                            style={{ width: `${timePct}%` }}
                        />
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function IdleRampRow({
    unit,
    field,
    value,
    onOpen,
}: {
    unit: RampUnit;
    field: RampField;
    value: number | undefined;
    onOpen: () => void;
}) {
    const { getDefaults } = useRampDefaults();
    // Read once per mount: the row remounts when a ramp starts or stops.
    const [last] = useState<RampDefaults | null>(() =>
        getDefaults(unit, field),
    );
    const style = RAMP_LANE_STYLES[field];
    const lastText = last ? describeLast(last) : null;

    return (
        <div className="flex flex-col gap-1.5 py-2 first:pt-1.5 last:pb-0">
            <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span
                        className={cn(
                            "size-1.5 shrink-0 rounded-full opacity-45",
                            style.bar,
                        )}
                    />
                    <span className="truncate text-[11px] font-medium text-foreground/90">
                        {FIELD_LABELS[field]}
                    </span>
                </div>

                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 cursor-pointer gap-1.5 px-2 text-[10px]"
                    title="Open the ramp studio"
                    onClick={onOpen}
                >
                    <SlidersHorizontal className="size-3" />
                    Set up
                </Button>
            </div>

            <div className="flex min-w-0 items-center justify-between gap-2">
                <Level value={value} />
                <div
                    className="flex min-w-0 items-center justify-end gap-1.5 text-[10px] text-muted-foreground"
                    title={
                        lastText
                            ? `Last saved setup: ${lastText}`
                            : "No ramp saved for this channel"
                    }
                >
                    <RampModeGlyph
                        mode={last?.mode ?? RampMode.WAVE}
                        className={cn(
                            "shrink-0",
                            last
                                ? cn("opacity-50", style.text)
                                : "text-muted-foreground/40",
                        )}
                    />
                    <span className="truncate font-mono text-[9px]">
                        {lastText ? `Last: ${lastText}` : "No ramp set"}
                    </span>
                </div>
            </div>
        </div>
    );
}

function Level({ value }: { value: number | undefined }) {
    return (
        <span className="flex shrink-0 items-baseline gap-0.5">
            <span className="font-mono text-[17px] font-semibold leading-none tabular-nums">
                {value ?? "—"}
            </span>
            {value !== undefined ? (
                <span className="text-[10px] leading-none text-muted-foreground/60">
                    %
                </span>
            ) : null}
        </span>
    );
}

function StatusBadge({ status }: { status: "running" | "paused" }) {
    const badge = {
        running:
            "border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        paused: "border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    }[status];
    const dot = {
        running: "bg-emerald-500",
        paused: "bg-amber-500",
    }[status];

    return (
        <span
            className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px font-mono text-[9px] tracking-wide uppercase",
                badge,
            )}
        >
            <span className={cn("size-1 rounded-full", dot)} />
            {status}
        </span>
    );
}

type RampStepSettings = Pick<
    Ramp,
    "mode" | "step" | "step_unit" | "timer" | "dwell" | "release"
>;

/** "1% / 1s", plus the release/hold detail that changes the shape. */
function describeStep(ramp: RampStepSettings): string {
    const base =
        ramp.mode === RampMode.SQUARE
            ? `every ${ramp.timer}s`
            : `${ramp.step}${ramp.step_unit === "absolute" ? " lv" : "%"} / ${ramp.timer}s`;

    if (ramp.mode === RampMode.SURGE) {
        return `${base} · release ×${ramp.release}`;
    }
    if (ramp.mode === RampMode.DWELL) {
        return `${base} · hold ${ramp.dwell}s`;
    }
    return base;
}

/** "Wave · 20% → 60% · 1% / 1s" — the remembered setup for an idle row. */
function describeLast(defaults: RampDefaults): string {
    const start = describeEndpoint(defaults.start_value, "current");
    const peak = describeEndpoint(defaults.max_value, "current");
    const hasTarget =
        defaults.start_value !== null && defaults.start_value !== undefined
            ? true
            : defaults.max_value !== null && defaults.max_value !== undefined;
    const target = hasTarget ? `${start} → ${peak}` : null;

    return [
        modeLabelOf(defaults.mode),
        target,
        describeStep(defaults),
        describeRampEndShort(defaults.end_action, defaults.end_value),
    ]
        .filter(Boolean)
        .join(" · ");
}

function describeEndpoint(
    value: number | string | null | undefined,
    fallback: string,
): string {
    if (typeof value === "number") return `${value}%`;
    return summarizeValue(value) ?? fallback;
}
