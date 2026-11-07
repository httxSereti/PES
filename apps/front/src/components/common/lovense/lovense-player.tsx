import { useMemo, useState } from "react";
import {
    Expand,
    Hand,
    Link2,
    Radio,
    SlidersHorizontal,
    Sparkles,
    Square,
    Vibrate,
    Waves,
    Zap,
} from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { Slider } from "@pes/ui/components/slider";
import { Switch } from "@pes/ui/components/switch";
import { cn } from "@pes/ui/lib/utils";
import { DevicePicker } from "./device-picker";
import { TouchPad } from "./touch-pad";
import { TouchRecorderControls, useTouchRecorder } from "./touch-recorder";
import { clampIntensity, outputKey, type PlayerOutput } from "./player-utils";
import type { LovenseController } from "./use-lovense-controller";

interface LovensePlayerProps {
    controller: LovenseController;
    onManage: () => void;
    onOpenKiosk?: () => void;
    immersive?: boolean;
}

export function LovensePlayer({
    controller,
    onManage,
    onOpenKiosk,
    immersive = false,
}: LovensePlayerProps) {
    const [mode, setMode] = useState<"touch" | "sliders">("touch");
    const [releaseToZero, setReleaseToZero] = useState(true);
    const [linkMotors, setLinkMotors] = useState(false);
    const [rampMs, setRampMs] = useState(200);
    const {
        devices,
        outputs,
        values,
        activeDevice,
        selectedDeviceIds,
        activeDeviceId,
        selectedDevices,
        selectedCap,
        manualActive,
        canControl,
        toggleDevice,
        activateDevice,
        selectOnly,
        setOutput,
        setAllFeatures,
        stopTargets,
        pulse,
    } = controller;
    const recorder = useTouchRecorder(outputs, selectedCap);

    const primaryOutput = outputs[0];
    const masterValue = useMemo(() => {
        if (!primaryOutput) return 0;
        const matching = outputs.filter(
            (entry) => entry.output === primaryOutput.output,
        );
        return Math.max(
            0,
            ...matching.map((entry) =>
                clampIntensity(
                    values[
                        outputKey(
                            entry.deviceId,
                            entry.featureIndex,
                            entry.output,
                        )
                    ] ?? 0,
                    selectedCap,
                ),
            ),
        );
    }, [outputs, primaryOutput, selectedCap, values]);

    const changeOutput = (
        entry: PlayerOutput,
        value: number,
        smooth = true,
    ) => {
        if (linkMotors && mode === "sliders") {
            setAllFeatures(entry.output, value, smooth ? rampMs : 0);
        } else {
            setOutput(entry, value, smooth ? rampMs : 0);
        }
    };

    const changeTouchOutput = (entry: PlayerOutput, value: number) => {
        recorder.capture(entry, value);
        setOutput(entry, value, 0);
    };

    const releasePad = (cancelled: boolean) => {
        if (!cancelled && !releaseToZero) return;
        for (const entry of outputs.slice(0, 2)) {
            recorder.capture(entry, 0);
            setOutput(entry, 0, cancelled ? 0 : 250);
        }
    };

    const setMaster = (value: number) => {
        if (primaryOutput) setAllFeatures(primaryOutput.output, value, rampMs);
    };

    return (
        <div
            className={cn(
                "space-y-5",
                immersive && "flex min-h-0 flex-1 flex-col space-y-4",
            )}
        >
            <DevicePicker
                devices={devices}
                selectedDeviceIds={selectedDeviceIds}
                activeDeviceId={activeDeviceId}
                onToggle={toggleDevice}
                onActivate={activateDevice}
                onSelectOnly={selectOnly}
                onManage={onManage}
                compact={immersive}
            />

            <div
                className={cn(
                    "relative overflow-hidden rounded-[26px] border border-violet-500/20 bg-card/75 shadow-[0_18px_70px_rgba(0,0,0,0.14)]",
                    !immersive && "p-4 sm:p-5",
                    immersive &&
                        "flex min-h-0 flex-1 flex-col border-0 bg-transparent p-0 shadow-none",
                )}
            >
                {!immersive && (
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-violet-500/[0.07] to-transparent" />
                )}

                <div className="relative mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex rounded-xl border bg-muted/35 p-1">
                        <button
                            type="button"
                            onClick={() => setMode("touch")}
                            className={cn(
                                "flex h-10 items-center gap-2 rounded-lg px-4 text-xs font-semibold transition-all",
                                mode === "touch"
                                    ? "bg-violet-600 text-white shadow-lg shadow-violet-950/20"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            <Hand className="size-4" />
                            Touch
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                recorder.cancel();
                                setMode("sliders");
                            }}
                            className={cn(
                                "flex h-10 items-center gap-2 rounded-lg px-4 text-xs font-semibold transition-all",
                                mode === "sliders"
                                    ? "bg-violet-600 text-white shadow-lg shadow-violet-950/20"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            <SlidersHorizontal className="size-4" />
                            Sliders
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        {manualActive && (
                            <span className="flex items-center gap-1.5 rounded-full border border-fuchsia-500/25 bg-fuchsia-500/10 px-3 py-1.5 text-[10px] font-bold tracking-wider text-fuchsia-500">
                                <Radio className="size-3.5 animate-pulse" />
                                MANUAL LIVE
                            </span>
                        )}
                        {onOpenKiosk && (
                            <Button
                                type="button"
                                variant="outline"
                                className="h-11 rounded-xl border-violet-500/25 px-4"
                                onClick={onOpenKiosk}
                                disabled={!activeDevice}
                            >
                                <Expand className="size-4" />
                                <span className="hidden sm:inline">
                                    Immersive
                                </span>
                            </Button>
                        )}
                    </div>
                </div>

                {!activeDevice || selectedDevices.length === 0 ? (
                    <div className="grid min-h-[340px] place-items-center rounded-[24px] border border-dashed bg-muted/10 p-8 text-center">
                        <div className="max-w-xs">
                            <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-violet-500/10 text-violet-500">
                                <Vibrate className="size-7" />
                            </span>
                            <h2 className="text-lg font-semibold">
                                Choose your toy
                            </h2>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                Select a connected toy above, or open Manage to
                                start Intiface and scan.
                            </p>
                            <Button
                                type="button"
                                className="mt-5 bg-violet-600 text-white"
                                onClick={onManage}
                            >
                                Connect a toy
                            </Button>
                        </div>
                    </div>
                ) : mode === "touch" ? (
                    <div
                        className={cn(
                            "relative",
                            immersive && "flex min-h-0 flex-1 flex-col",
                        )}
                    >
                        <TouchPad
                            outputs={outputs}
                            values={values}
                            disabled={!canControl}
                            releaseToZero={releaseToZero}
                            onChange={changeTouchOutput}
                            onRelease={releasePad}
                            immersive={immersive}
                        />
                        <div className="mt-3 flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 px-3.5 py-2.5">
                            <div>
                                <p className="text-xs font-medium">
                                    Release to zero
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                    Interruptions always stop the pad.
                                </p>
                            </div>
                            <Switch
                                checked={releaseToZero}
                                onCheckedChange={setReleaseToZero}
                                aria-label="Release touch pad to zero"
                            />
                        </div>
                        <TouchRecorderControls
                            recorder={recorder}
                            disabled={!canControl}
                        />
                    </div>
                ) : (
                    <div className="relative rounded-[24px] border bg-background/45 p-4 sm:p-6">
                        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-semibold">
                                    {activeDevice.display_name}
                                </h2>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {selectedDevices.length > 1
                                        ? `Mirroring to ${selectedDevices.length} selected toys`
                                        : "Independent motor control"}
                                </p>
                            </div>
                            {outputs.length > 1 && (
                                <label className="flex min-h-10 items-center gap-2.5 rounded-xl border bg-muted/25 px-3 text-xs font-medium">
                                    <Link2 className="size-3.5 text-violet-500" />
                                    Link motors
                                    <Switch
                                        checked={linkMotors}
                                        onCheckedChange={setLinkMotors}
                                    />
                                </label>
                            )}
                        </div>

                        <div
                            className={cn(
                                "grid min-h-[320px] gap-3",
                                outputs.length === 1 && "grid-cols-1",
                                outputs.length === 2 && "grid-cols-2",
                                outputs.length >= 3 &&
                                    "grid-cols-2 sm:grid-cols-3",
                            )}
                        >
                            {outputs.map((entry, index) => {
                                const key = outputKey(
                                    entry.deviceId,
                                    entry.featureIndex,
                                    entry.output,
                                );
                                const cap = Math.min(entry.cap, selectedCap);
                                const value = clampIntensity(
                                    values[key] ?? 0,
                                    cap,
                                );
                                return (
                                    <div
                                        key={key}
                                        className="flex min-h-[300px] flex-col items-center rounded-2xl border border-violet-500/10 bg-gradient-to-b from-violet-500/[0.055] to-transparent px-3 py-4"
                                    >
                                        <div className="text-center">
                                            <p className="max-w-28 truncate text-xs font-semibold">
                                                {entry.label}
                                            </p>
                                            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                                                {entry.output}
                                            </p>
                                        </div>
                                        <div className="my-4 flex min-h-0 flex-1 items-center py-2">
                                            <Slider
                                                orientation="vertical"
                                                min={0}
                                                max={Math.max(1, cap)}
                                                step={1}
                                                value={[value]}
                                                disabled={!canControl}
                                                aria-label={`${activeDevice.display_name} ${entry.label}`}
                                                onValueChange={(next) =>
                                                    changeOutput(
                                                        entry,
                                                        next[0] ?? 0,
                                                    )
                                                }
                                                onValueCommit={(next) =>
                                                    changeOutput(
                                                        entry,
                                                        next[0] ?? 0,
                                                    )
                                                }
                                                className="w-12 [&_[data-slot=slider-range]]:bg-gradient-to-t [&_[data-slot=slider-range]]:from-violet-700 [&_[data-slot=slider-range]]:to-fuchsia-400 [&_[data-slot=slider-thumb]]:size-7 [&_[data-slot=slider-thumb]]:border-4 [&_[data-slot=slider-thumb]]:border-violet-500 [&_[data-slot=slider-thumb]]:shadow-[0_0_20px_rgba(168,85,247,0.35)] [&_[data-slot=slider-track]]:w-3"
                                            />
                                        </div>
                                        <div
                                            className={cn(
                                                "min-w-16 rounded-xl border px-3 py-2 text-center font-mono text-xl font-bold tabular-nums",
                                                index === 0
                                                    ? "border-violet-500/25 bg-violet-500/10 text-violet-500"
                                                    : "border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-500",
                                            )}
                                        >
                                            {value}
                                            <span className="ml-0.5 text-xs font-medium">
                                                %
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {activeDevice && selectedDevices.length > 0 && (
                <section
                    className="rounded-[22px] border bg-card/80 p-4 sm:p-5"
                    aria-label="Quick controls"
                >
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="flex items-center gap-2 text-sm font-semibold">
                                <Zap className="size-4 text-violet-500" />
                                Master intensity
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                {primaryOutput?.output ?? "Vibrate"} · all
                                motors · server cap {selectedCap}%
                            </p>
                        </div>
                        <span className="font-mono text-2xl font-bold tabular-nums text-violet-500">
                            {masterValue}%
                        </span>
                    </div>
                    <Slider
                        min={0}
                        max={Math.max(1, selectedCap)}
                        step={1}
                        value={[masterValue]}
                        disabled={!canControl || !primaryOutput}
                        onValueChange={(next) => setMaster(next[0] ?? 0)}
                        onValueCommit={(next) => setMaster(next[0] ?? 0)}
                        className="mt-5 h-6 [&_[data-slot=slider-range]]:bg-gradient-to-r [&_[data-slot=slider-range]]:from-violet-700 [&_[data-slot=slider-range]]:to-fuchsia-400 [&_[data-slot=slider-thumb]]:size-6 [&_[data-slot=slider-thumb]]:border-violet-500 [&_[data-slot=slider-track]]:h-2.5"
                        aria-label="Master intensity"
                    />
                    <div className="mt-3 grid grid-cols-4 gap-2">
                        {[0, 25, 50, 75].map((value) => (
                            <button
                                key={value}
                                type="button"
                                disabled={!canControl || value > selectedCap}
                                onClick={() =>
                                    setMaster(Math.min(value, selectedCap))
                                }
                                className="h-10 rounded-xl border bg-muted/20 text-xs font-semibold transition-colors hover:border-violet-500/40 hover:bg-violet-500/10 disabled:opacity-40"
                            >
                                {value}%
                            </button>
                        ))}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
                        <Button
                            type="button"
                            variant="secondary"
                            className="h-11 flex-1 rounded-xl"
                            disabled={!canControl}
                            onClick={() =>
                                void pulse(Math.min(50, selectedCap))
                            }
                        >
                            <Sparkles className="size-4 text-violet-500" />
                            Pulse
                        </Button>
                        <div className="flex h-11 items-center gap-1 rounded-xl border bg-muted/20 px-1.5">
                            <Waves className="mx-1 size-3.5 text-muted-foreground" />
                            {[
                                [0, "Direct"],
                                [200, "Smooth"],
                                [800, "Slow"],
                            ].map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setRampMs(Number(value))}
                                    className={cn(
                                        "h-8 rounded-lg px-2 text-[10px] font-medium",
                                        rampMs === Number(value)
                                            ? "bg-background text-foreground shadow-sm"
                                            : "text-muted-foreground",
                                    )}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            className="h-11 flex-1 rounded-xl border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-500"
                            disabled={selectedDeviceIds.length === 0}
                            onClick={() =>
                                void stopTargets(selectedDeviceIds, true)
                            }
                        >
                            <Square className="size-4 fill-current" />
                            Stop selected
                        </Button>
                    </div>
                </section>
            )}
        </div>
    );
}
