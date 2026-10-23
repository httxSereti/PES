import { useMemo, useState } from "react";
import {
    ArrowRight,
    Minus,
    Pause,
    Play,
    Plus,
    Square,
    type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Button } from "@pes/ui/components/button";
import { cn } from "@pes/ui/lib/utils";

import { UNIT_IDS } from "@/components/common/ramps/ramp.constants";
import {
    shapeAreaPath,
    shapeLinePath,
} from "@/components/common/profiles/profile-shape";
import { useUnitStop } from "@/hooks/useUnitStop";
import { useWebSocket } from "@/hooks/useWebSocket";
import { hasPermission } from "@/lib/permissions";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { rampsSelectors } from "@/store/slices/rampsSlice";
import {
    channelSet,
    selectUnitChannel,
    undoPushed,
    type UnitChannel,
} from "@/store/slices/unitsUiSlice";
import { unitsSelectors } from "@/store/slices/unitsSlice";
import { selectUnitHistory } from "@/store/slices/unitsHistorySlice";
import { Permission, type Ramp, type RampTarget } from "@/types";

const CHANNEL_TONES = {
    channelA: {
        active: "border-violet-500/40 bg-violet-500/15 text-violet-600 dark:text-violet-300",
        idle: "border-border/50 bg-background/30 text-muted-foreground",
        value: "text-violet-500 dark:text-violet-400",
    },
    channelB: {
        active: "border-blue-500/40 bg-blue-500/15 text-blue-600 dark:text-blue-300",
        idle: "border-border/50 bg-background/30 text-muted-foreground",
        value: "text-blue-500 dark:text-blue-400",
    },
} as const;

type ChannelLevelButtonProps = {
    channel: UnitChannel;
    label: string;
    value: number | undefined;
    selected: boolean;
    onSelect: () => void;
};

function ChannelLevelButton({
    channel,
    label,
    value,
    selected,
    onSelect,
}: ChannelLevelButtonProps) {
    const tone = CHANNEL_TONES[channel];

    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onSelect}
            title={`Select channel ${label}`}
            className={cn(
                "flex h-9 min-w-[58px] cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2 font-mono text-[10px] transition-colors",
                selected ? tone.active : tone.idle,
            )}
        >
            <span>{label}</span>
            <span
                className={cn(
                    "text-sm font-semibold tabular-nums",
                    selected ? tone.value : "text-foreground/70",
                )}
            >
                {value ?? "—"}
            </span>
        </button>
    );
}

function HomeUnitGraph({
    unitId,
    className,
}: {
    unitId: string;
    className?: string;
}) {
    const history = useAppSelector(selectUnitHistory(unitId));

    const areaA = useMemo(
        () =>
            shapeAreaPath(
                history.ch_A.length ? history.ch_A : [0, 0],
                200,
                48,
                3,
            ),
        [history.ch_A],
    );
    const lineA = useMemo(
        () =>
            shapeLinePath(
                history.ch_A.length ? history.ch_A : [0, 0],
                200,
                48,
                3,
            ),
        [history.ch_A],
    );
    const areaB = useMemo(
        () =>
            shapeAreaPath(
                history.ch_B.length ? history.ch_B : [0, 0],
                200,
                48,
                3,
            ),
        [history.ch_B],
    );
    const lineB = useMemo(
        () =>
            shapeLinePath(
                history.ch_B.length ? history.ch_B : [0, 0],
                200,
                48,
                3,
            ),
        [history.ch_B],
    );

    return (
        <div
            className={cn(
                "relative h-14 min-w-0 overflow-hidden rounded-lg border border-border/40 bg-muted/10 px-2 py-1",
                className,
            )}
        >
            <svg
                viewBox="0 0 200 48"
                preserveAspectRatio="none"
                className="h-full w-full"
                aria-hidden="true"
            >
                {[10, 22, 34, 46].map((y) => (
                    <line
                        key={y}
                        x1="0"
                        x2="200"
                        y1={y}
                        y2={y}
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeDasharray="2 5"
                        className="text-border/40"
                    />
                ))}
                <path
                    d={areaA}
                    fill="currentColor"
                    className="text-violet-500/10"
                />
                <path
                    d={areaB}
                    fill="currentColor"
                    className="text-blue-500/8"
                />
                <path
                    d={lineA}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    className="text-violet-500 dark:text-violet-400"
                />
                <path
                    d={lineB}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    className="text-blue-500 dark:text-blue-400"
                />
            </svg>
        </div>
    );
}

type QuickActionProps = {
    label: string;
    icon: LucideIcon;
    tone: string;
    disabled?: boolean;
    pending?: boolean;
    title?: string;
    onClick: () => void;
};

function QuickAction({
    label,
    icon: Icon,
    tone,
    disabled,
    pending,
    title,
    onClick,
}: QuickActionProps) {
    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || pending}
            title={title}
            className={cn(
                "h-10 cursor-pointer flex-col gap-0.5 px-1 font-mono text-[8px] font-medium",
                tone,
            )}
            onClick={onClick}
        >
            <Icon className="size-3.5" />
            {pending ? "…" : label}
        </Button>
    );
}

type UnitConsoleRowProps = {
    unitId: string;
    ramps: Ramp[];
    canWrite: boolean;
};

function UnitConsoleRow({ unitId, ramps, canWrite }: UnitConsoleRowProps) {
    const dispatch = useAppDispatch();
    const { sendCommand } = useWebSocket();
    const unit = useAppSelector((state) =>
        unitsSelectors.selectById(state, unitId),
    );
    const enabled = useAppSelector((state) => state.hardware[unitId] ?? true);
    const channel = useAppSelector((state) => selectUnitChannel(state, unitId));
    const { stop, stopping } = useUnitStop(unitId);
    const [rampPending, setRampPending] = useState(false);
    const [levelPending, setLevelPending] = useState(false);

    const allPaused = ramps.length > 0 && ramps.every((ramp) => ramp.paused);
    const runningRamps = ramps.filter((ramp) => !ramp.paused);
    const pauseTargets = allPaused ? ramps : runningRamps;
    const pauseLabel = allPaused ? "Resume" : "Pause";
    const pauseIcon = allPaused ? Play : Pause;

    const dotColor = !enabled
        ? "bg-gray-400"
        : unit?.cnx_ok
          ? "bg-emerald-500"
          : "bg-red-500";

    const modeLabel =
        ramps.length === 0
            ? "idle"
            : ramps.length === 1
              ? (ramps[0]?.mode.toUpperCase() ?? "ramp")
              : `${ramps.length} ramps`;

    const toggleRamps = async () => {
        if (!canWrite || pauseTargets.length === 0 || rampPending) return;
        setRampPending(true);
        try {
            const resume = allPaused;
            const results = await Promise.allSettled(
                pauseTargets.map((ramp) => {
                    const unitTarget = ramp.unit as RampTarget["unit"];
                    const field = ramp.field as RampTarget["field"];
                    return resume
                        ? sendCommand("ramps:resume", {
                              unit: unitTarget,
                              field,
                          })
                        : sendCommand("ramps:pause", {
                              unit: unitTarget,
                              field,
                          });
                }),
            );
            const failed = results.filter(
                (result) =>
                    result.status === "rejected" ||
                    (result.status === "fulfilled" &&
                        result.value.status === "error"),
            ).length;

            if (failed > 0) {
                toast.error(
                    `${failed} ramp${failed > 1 ? "s" : ""} could not be updated`,
                    { position: "bottom-right" },
                );
            } else {
                toast.success(
                    `${unitId} ramp${pauseTargets.length > 1 ? "s" : ""} ${
                        resume ? "resumed" : "paused"
                    }`,
                    { position: "bottom-right" },
                );
            }
        } catch (error) {
            toast.error("Ramp command failed", {
                description:
                    error instanceof Error ? error.message : "Unknown error",
                position: "bottom-right",
            });
        } finally {
            setRampPending(false);
        }
    };

    const adjustLevel = async (operator: "-5" | "+5") => {
        if (!unit || !canWrite || levelPending) return;
        const isA = channel === "channelA";
        const field = isA ? "ch_A" : "ch_B";
        const previous = isA ? unit.ch_A : unit.ch_B;

        setLevelPending(true);
        try {
            dispatch(
                undoPushed({
                    unitId,
                    channel,
                    previous,
                }),
            );

            const result = await sendCommand("units:update_level", {
                [unitId]: { [field]: operator },
            });

            if (result.status !== "ok") {
                throw new Error(result.message ?? "Command failed");
            }
        } catch (error) {
            toast.error(`Failed to adjust ${unitId}`, {
                description:
                    error instanceof Error ? error.message : "Unknown error",
                position: "bottom-right",
            });
        } finally {
            setLevelPending(false);
        }
    };

    return (
        <div
            className={cn(
                "grid grid-cols-2 items-center gap-3 rounded-xl border border-border/50 bg-muted/10 p-3 sm:grid-cols-[100px_auto_minmax(0,1fr)_148px]",
                !enabled && "opacity-60",
            )}
        >
            <div className="flex min-w-0 items-center gap-2">
                <span
                    className={cn("size-1.5 shrink-0 rounded-full", dotColor)}
                />
                <div className="min-w-0">
                    <div className="font-mono text-[11px] font-semibold">
                        {unitId}
                    </div>
                    <div className="truncate font-mono text-[8px] tracking-[0.08em] text-muted-foreground uppercase">
                        {modeLabel}
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-end gap-1.5 sm:justify-start">
                <ChannelLevelButton
                    channel="channelA"
                    label="A"
                    value={unit?.ch_A}
                    selected={channel === "channelA"}
                    onSelect={() =>
                        dispatch(
                            channelSet({
                                unitIds: [unitId],
                                channel: "channelA",
                            }),
                        )
                    }
                />
                <ChannelLevelButton
                    channel="channelB"
                    label="B"
                    value={unit?.ch_B}
                    selected={channel === "channelB"}
                    onSelect={() =>
                        dispatch(
                            channelSet({
                                unitIds: [unitId],
                                channel: "channelB",
                            }),
                        )
                    }
                />
            </div>

            <HomeUnitGraph
                unitId={unitId}
                className="col-span-2 sm:col-span-1"
            />

            <div className="col-span-2 grid grid-cols-4 gap-1.5 sm:col-span-1">
                <QuickAction
                    label={pauseLabel}
                    icon={pauseIcon}
                    tone="text-amber-600 hover:text-amber-600 dark:text-amber-400"
                    disabled={!canWrite || ramps.length === 0}
                    pending={rampPending}
                    title={
                        ramps.length === 0
                            ? "No ramp running on this unit"
                            : allPaused
                              ? "Resume every ramp on this unit"
                              : "Pause every running ramp on this unit"
                    }
                    onClick={() => void toggleRamps()}
                />
                <QuickAction
                    label="Stop"
                    icon={Square}
                    tone="text-red-600 hover:text-red-600 dark:text-red-400"
                    disabled={!canWrite}
                    pending={stopping}
                    title="Cancel ramps and zero both channels"
                    onClick={() => void stop()}
                />
                <QuickAction
                    label="−5"
                    icon={Minus}
                    tone="text-violet-600 hover:text-violet-600 dark:text-violet-400"
                    disabled={!canWrite || !unit}
                    pending={levelPending}
                    title={`Decrease channel ${channel === "channelA" ? "A" : "B"} by 5`}
                    onClick={() => void adjustLevel("-5")}
                />
                <QuickAction
                    label="+5"
                    icon={Plus}
                    tone="text-emerald-600 hover:text-emerald-600 dark:text-emerald-400"
                    disabled={!canWrite || !unit}
                    pending={levelPending}
                    title={`Increase channel ${channel === "channelA" ? "A" : "B"} by 5`}
                    onClick={() => void adjustLevel("+5")}
                />
            </div>
        </div>
    );
}

export function UnitsConsole() {
    const user = useAppSelector((state) => state.auth.user);
    const units = useAppSelector(unitsSelectors.selectAll);
    const ramps = useAppSelector(rampsSelectors.selectAll);
    const { sendCommand } = useWebSocket();
    const [bulkPending, setBulkPending] = useState(false);

    const canWrite = hasPermission(user, Permission.WRITE_UNITS);
    const online = units.filter((unit) => unit.cnx_ok).length;
    const allPaused = ramps.length > 0 && ramps.every((ramp) => ramp.paused);

    const rampsByUnit = useMemo(() => {
        const byUnit = new Map<string, Ramp[]>();
        for (const ramp of ramps) {
            const list = byUnit.get(ramp.unit);
            if (list) list.push(ramp);
            else byUnit.set(ramp.unit, [ramp]);
        }
        return byUnit;
    }, [ramps]);

    const toggleAll = async () => {
        if (!canWrite || ramps.length === 0 || bulkPending) return;
        const resume = allPaused;
        const targets = resume ? ramps : ramps.filter((ramp) => !ramp.paused);
        if (targets.length === 0) return;

        setBulkPending(true);
        try {
            const results = await Promise.allSettled(
                targets.map((ramp) => {
                    const unitTarget = ramp.unit as RampTarget["unit"];
                    const field = ramp.field as RampTarget["field"];
                    return resume
                        ? sendCommand("ramps:resume", {
                              unit: unitTarget,
                              field,
                          })
                        : sendCommand("ramps:pause", {
                              unit: unitTarget,
                              field,
                          });
                }),
            );
            const failed = results.filter(
                (result) =>
                    result.status === "rejected" ||
                    (result.status === "fulfilled" &&
                        result.value.status === "error"),
            ).length;

            if (failed > 0) {
                toast.error(
                    `${failed} ramp${failed > 1 ? "s" : ""} could not be updated`,
                    { position: "bottom-right" },
                );
            } else {
                toast.success(`All ramps ${resume ? "resumed" : "paused"}`, {
                    position: "bottom-right",
                });
            }
        } catch (error) {
            toast.error("Ramp command failed", {
                description:
                    error instanceof Error ? error.message : "Unknown error",
                position: "bottom-right",
            });
        } finally {
            setBulkPending(false);
        }
    };

    return (
        <section className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-syne text-sm font-bold">Units</h2>
                <span className="font-mono text-[9px] text-emerald-500">
                    {online}/{UNIT_IDS.length} online
                </span>
                <span className="font-mono text-[9px] text-muted-foreground">
                    · {ramps.length} ramp{ramps.length === 1 ? "" : "s"}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                    {canWrite && ramps.length > 0 && (
                        <Button
                            variant="outline"
                            size="xs"
                            className="cursor-pointer font-mono text-[9px]"
                            disabled={bulkPending}
                            onClick={() => void toggleAll()}
                        >
                            {allPaused ? (
                                <Play className="size-3" />
                            ) : (
                                <Pause className="size-3" />
                            )}
                            {bulkPending
                                ? "…"
                                : allPaused
                                  ? "Resume all"
                                  : "Pause all"}
                        </Button>
                    )}
                    <Button
                        asChild
                        variant="ghost"
                        size="xs"
                        className="cursor-pointer font-mono text-[9px]"
                    >
                        <Link to="/app/units">
                            Open units
                            <ArrowRight className="size-3" />
                        </Link>
                    </Button>
                </div>
            </div>

            <div className="flex flex-1 flex-col gap-2">
                {UNIT_IDS.map((unitId) => (
                    <UnitConsoleRow
                        key={unitId}
                        unitId={unitId}
                        ramps={rampsByUnit.get(unitId) ?? []}
                        canWrite={canWrite}
                    />
                ))}
            </div>
        </section>
    );
}
