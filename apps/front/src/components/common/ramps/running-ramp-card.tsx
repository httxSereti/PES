import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    Pause,
    Play,
    Square,
} from "lucide-react";
import { Button } from "@pes/ui/components/button";
import { Card, CardContent } from "@pes/ui/components/card";
import { cn } from "@pes/ui/lib/utils";
import { useAppSelector } from "@/store/hooks";
import { unitsSelectors } from "@/store/slices/unitsSlice";
import { useRampControl } from "@/hooks/useRampControl";
import { useRampElapsed } from "@/hooks/useRampElapsed";
import { RampMode, type Ramp, type RampTarget } from "@/types";
import { FIELD_LABELS } from "./ramp.constants";
import {
    describeRampSettings,
    formatDuration,
    formatSeconds,
} from "./ramp-format";

type RunningRampCardProps = {
    ramp: Ramp;
};

export function RunningRampCard({ ramp }: RunningRampCardProps) {
    const { control, pending } = useRampControl();
    const unitId = ramp.unit as RampTarget["unit"];
    const field = ramp.field as RampTarget["field"];
    const unitState = useAppSelector((state) =>
        unitsSelectors.selectById(state, ramp.unit),
    );
    const hardwareEnabled = useAppSelector(
        (state) => state.hardware[unitId] ?? true,
    );
    const elapsed = useRampElapsed(ramp);

    // Informational only: ramps keep running in software when the unit can't
    // receive them (offline or turned off in hardware settings).
    const offlineNote = !hardwareEnabled
        ? "disabled"
        : unitState && !unitState.cnx_ok
          ? "offline"
          : null;

    const paused = ramp.paused;
    // The live field level comes from `units:update`; `ramp.value` is only
    // refreshed on lifecycle events, so it's just the fallback.
    const liveValue = unitState?.[field] ?? ramp.value;

    // Progress is derived from the live value: `ramp.progress` freezes
    // between lifecycle events (see useRampElapsed).
    const pct =
        ramp.max_value > 0
            ? Math.min(100, Math.max(0, Math.round((liveValue / ramp.max_value) * 100)))
            : Math.min(100, Math.max(0, Math.round(ramp.progress)));

    const oscillating =
        ramp.mode === RampMode.WAVE ||
        ramp.mode === RampMode.SQUARE ||
        ramp.mode === RampMode.DRIFT ||
        ramp.mode === RampMode.SURGE ||
        ramp.mode === RampMode.DWELL;
    const DirectionIcon = oscillating
        ? ArrowUpDown
        : ramp.max_value >= ramp.start_value
          ? ArrowUp
          : ArrowDown;

    const viaProfile = (ramp.owner ?? "").startsWith("profile:");

    return (
        <Card className={cn("gap-4 py-4", paused && "border-amber-500/40")}>
            <CardContent className="flex flex-col gap-3 px-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <div className="font-mono text-xs text-primary/60">
                            {unitId} · {FIELD_LABELS[field]}
                            {offlineNote && (
                                <span
                                    className="text-amber-500"
                                    title="Software only — the unit is not receiving it right now"
                                >
                                    {" "}
                                    · {offlineNote}
                                </span>
                            )}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                            <span className="text-sm font-bold">
                                {ramp.mode.toUpperCase()}
                            </span>
                            <DirectionIcon className="size-3.5 text-primary/50" />
                            <span className="font-mono text-sm text-muted-foreground tabular-nums">
                                {liveValue} → {ramp.max_value}
                            </span>
                        </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                        {paused ? (
                            <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase text-amber-500">
                                paused
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] uppercase text-emerald-600 dark:text-emerald-400">
                                <span className="relative flex size-1.5">
                                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                                </span>
                                live
                            </span>
                        )}
                        <span className="font-mono text-[10px] uppercase text-primary/40">
                            {viaProfile ? "via profile" : "manual"}
                        </span>
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
                        <div
                            className={cn(
                                "h-full rounded-full transition-all duration-500",
                                paused ? "bg-amber-500" : "bg-emerald-500",
                            )}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                        <span className="tabular-nums">{pct} %</span>
                        <span className="tabular-nums">
                            {formatSeconds(elapsed)} / {formatDuration(ramp.duration)}
                        </span>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[10px] uppercase text-primary/40">
                        {describeRampSettings(
                            ramp.step,
                            ramp.step_unit,
                            ramp.timer,
                            ramp.mode,
                            ramp.dwell,
                            ramp.release,
                        )}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 cursor-pointer"
                            disabled={pending}
                            onClick={() =>
                                void control(
                                    paused ? "ramps:resume" : "ramps:pause",
                                    unitId,
                                    field,
                                )
                            }
                        >
                            {paused ? <Play /> : <Pause />}
                            {paused ? "Resume" : "Pause"}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 cursor-pointer text-destructive hover:text-destructive"
                            disabled={pending}
                            onClick={() => void control("ramps:stop", unitId, field)}
                        >
                            <Square />
                            Stop
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
