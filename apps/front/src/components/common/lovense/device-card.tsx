import { useEffect, useMemo, useRef, useState } from "react";
import {
    Battery,
    BatteryLow,
    Hand,
    Pause,
    Play,
    Radio,
    RefreshCw,
    Square,
    Tag,
    Trash2,
    Vibrate,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@pes/ui/components/badge";
import { Button } from "@pes/ui/components/button";
import { Input } from "@pes/ui/components/input";
import { Slider } from "@pes/ui/components/slider";

import { useWebSocket } from "@/hooks/useWebSocket";
import type { LovenseDeviceInfo } from "@/types";

function batteryTone(pct: number | null | undefined) {
    if (pct == null) return "text-muted-foreground";
    if (pct <= 15) return "text-red-500";
    if (pct <= 35) return "text-amber-500";
    return "text-emerald-500";
}

function featureOutputs(device: LovenseDeviceInfo) {
    const entries: {
        featureIndex: number;
        output: string;
        label: string;
        max: number;
    }[] = [];
    for (const feature of device.features ?? []) {
        for (const [output, spec] of Object.entries(feature.outputs ?? {})) {
            entries.push({
                featureIndex: feature.index,
                output,
                label:
                    feature.description ||
                    (output === "Vibrate"
                        ? `Motor ${feature.index + 1}`
                        : `${output} ${feature.index + 1}`),
                max: Math.max(1, spec.max ?? 1),
            });
        }
    }
    return entries;
}

export function DeviceCard({
    device,
    nodeName,
    globalCap,
    onChanged,
}: {
    device: LovenseDeviceInfo;
    nodeName?: string;
    globalCap: number;
    onChanged: () => void;
}) {
    const { sendCommand } = useWebSocket();
    const entries = useMemo(() => featureOutputs(device), [device]);
    const [values, setValues] = useState<Record<string, number>>({});
    const [holding, setHolding] = useState(false);
    const [alias, setAlias] = useState(device.alias ?? "");
    const [tags, setTags] = useState((device.tags ?? []).join(", "));
    const [cap, setCap] = useState(String(device.max_intensity_pct));
    const holdValues = useRef<Record<string, number>>({});
    const lastSentRef = useRef(0);

    const keyOf = (featureIndex: number, output: string) =>
        `${featureIndex}:${output}`;

    useEffect(() => {
        if (Date.now() - lastSentRef.current < 500) return;
        const next: Record<string, number> = {};
        for (const entry of entries) {
            const found = (device.outputs ?? []).find(
                item =>
                    item.feature_index === entry.featureIndex &&
                    item.output === entry.output
            );
            next[keyOf(entry.featureIndex, entry.output)] = found?.value ?? 0;
        }
        if (holding) {
            const changedExternally = Object.entries(holdValues.current).some(
                ([key, sent]) => sent > 0 && Math.abs((next[key] ?? 0) - sent) > 1
            );
            if (changedExternally) {
                setHolding(false);
                holdValues.current = {};
            }
        }
        setValues(next);
    }, [device, entries, holding]);

    useEffect(() => {
        setAlias(device.alias ?? "");
        setTags((device.tags ?? []).join(", "));
        setCap(String(device.max_intensity_pct));
    }, [device.alias, device.tags, device.max_intensity_pct]);

    const outputCap = Math.max(0, Math.min(globalCap, device.max_intensity_pct));

    const command = async (
        type:
            | "lovense:set"
            | "lovense:stop"
            | "lovense:pulse"
            | "lovense:identify"
            | "lovense:device_update"
            | "lovense:device_delete",
        payload: Record<string, unknown>
    ) => {
        const send = sendCommand as unknown as (
            type: string,
            payload?: Record<string, unknown>
        ) => Promise<{ status: string; message?: string | null }>;
        const result = await send(type, payload);
        if (result.status !== "ok") {
            toast.error(result.message ?? "Lovense command failed");
        }
        return result;
    };

    const setOutput = async (
        featureIndex: number,
        output: string,
        value: number
    ) => {
        await command("lovense:set", {
            targets: { device_ids: [device.id] },
            output,
            feature: featureIndex,
            value,
            mode: "absolute",
        });
    };

    const stopAllOutputs = async () => {
        setHolding(false);
        holdValues.current = {};
        await command("lovense:stop", {
            targets: { device_ids: [device.id] },
        });
        setValues(current =>
            Object.fromEntries(Object.keys(current).map(key => [key, 0]))
        );
    };

    // Dead-man refresh: only while the user explicitly holds the device.
    useEffect(() => {
        if (!holding) return;
        const interval = window.setInterval(() => {
            for (const [key, value] of Object.entries(holdValues.current)) {
                if (value <= 0) continue;
                const [featureIndex, output] = key.split(":");
                void command("lovense:set", {
                    targets: { device_ids: [device.id] },
                    output,
                    feature: Number(featureIndex),
                    value,
                    mode: "absolute",
                });
            }
        }, 15000);
        return () => window.clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [holding, device.id]);

    const toggleHold = async () => {
        if (holding) {
            setHolding(false);
            holdValues.current = {};
            await stopAllOutputs();
            return;
        }
        const valuesToHold: Record<string, number> = {};
        for (const entry of entries) {
            const key = keyOf(entry.featureIndex, entry.output);
            const value = values[key] ?? 0;
            valuesToHold[key] = value > 0 ? value : Math.min(30, outputCap);
        }
        holdValues.current = valuesToHold;
        setHolding(true);
        for (const [key, value] of Object.entries(valuesToHold)) {
            const [featureIndex, output] = key.split(":");
            if (!output) continue;
            await setOutput(Number(featureIndex), output, value);
        }
        setValues(current => ({ ...current, ...valuesToHold }));
    };

    const saveAlias = async () => {
        await command("lovense:device_update", {
            device_id: device.id,
            alias: alias.trim(),
        });
        onChanged();
    };

    const saveTags = async () => {
        const next = tags
            .split(",")
            .map(tag => tag.trim())
            .filter(Boolean);
        await command("lovense:device_update", {
            device_id: device.id,
            tags: next,
        });
        onChanged();
    };

    const saveCap = async () => {
        const value = Math.max(0, Math.min(100, Number(cap) || 0));
        await command("lovense:device_update", {
            device_id: device.id,
            max_intensity_pct: value,
        });
        onChanged();
    };

    return (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div className="flex items-start gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-violet-500/25 bg-violet-500/10">
                    <Vibrate className="size-[18px] text-violet-500 dark:text-violet-400" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">
                            {device.display_name}
                        </span>
                        <span
                            className={`inline-block size-1.5 rounded-full ${
                                device.online ? "bg-emerald-500" : "bg-muted-foreground/40"
                            }`}
                        />
                    </div>
                    <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground">
                        <Radio className="size-3" />
                        <span className="truncate">{nodeName ?? device.node_id}</span>
                        <span>·</span>
                        <span className="truncate">{device.name}</span>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline" className="gap-1 text-[9px]">
                        {device.battery_pct != null ? (
                            device.battery_pct <= 15 ? (
                                <BatteryLow className={`size-3 ${batteryTone(device.battery_pct)}`} />
                            ) : (
                                <Battery className={`size-3 ${batteryTone(device.battery_pct)}`} />
                            )
                        ) : (
                            <Battery className="size-3 text-muted-foreground/50" />
                        )}
                        {device.battery_pct != null ? `${device.battery_pct}%` : "—"}
                    </Badge>
                    {device.tags.length > 0 && (
                        <div className="flex max-w-32 flex-wrap justify-end gap-1">
                            {device.tags.slice(0, 3).map(tag => (
                                <Badge
                                    key={tag}
                                    variant="secondary"
                                    className="gap-0.5 px-1 py-0 text-[9px]"
                                >
                                    <Tag className="size-2.5" />
                                    {tag}
                                </Badge>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-3">
                {entries.length === 0 && (
                    <p className="text-xs italic text-muted-foreground/60">
                        No controllable output reported by Buttplug.
                    </p>
                )}
                {entries.map(entry => {
                    const key = keyOf(entry.featureIndex, entry.output);
                    const value = Math.min(values[key] ?? 0, outputCap);
                    return (
                        <div key={key} className="space-y-1.5">
                            <div className="flex items-center justify-between text-[11px]">
                                <span className="font-medium text-muted-foreground">
                                    {entry.label}
                                </span>
                                <span className="font-mono tabular-nums text-muted-foreground">
                                    {value}%
                                </span>
                            </div>
                            <Slider
                                value={[value]}
                                min={0}
                                max={Math.max(1, outputCap)}
                                step={1}
                                disabled={!device.online}
                                onValueChange={next =>
                                    {
                                        const nextValue = next[0] ?? 0;
                                        setValues(current => ({
                                            ...current,
                                            [key]: nextValue,
                                        }));
                                        const now = Date.now();
                                        if (now - lastSentRef.current > 120) {
                                            lastSentRef.current = now;
                                            if (holding) holdValues.current[key] = nextValue;
                                            void setOutput(
                                                entry.featureIndex,
                                                entry.output,
                                                nextValue
                                            );
                                        }
                                    }
                                }
                                onValueCommit={next => {
                                    const nextValue = next[0] ?? 0;
                                    if (holding) holdValues.current[key] = nextValue;
                                    void setOutput(
                                        entry.featureIndex,
                                        entry.output,
                                        nextValue
                                    );
                                }}
                            />
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                <Button
                    type="button"
                    size="sm"
                    variant={holding ? "default" : "secondary"}
                    className="h-7 px-2 text-[11px]"
                    disabled={!device.online}
                    onClick={() => void toggleHold()}
                >
                    {holding ? <Pause className="size-3" /> : <Hand className="size-3" />}
                    {holding ? "Release" : "Hold"}
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2 text-[11px]"
                    disabled={!device.online}
                    onClick={() =>
                        void command("lovense:pulse", {
                            targets: { device_ids: [device.id] },
                            output: "Vibrate",
                            value: Math.min(50, outputCap),
                            attack_ms: 200,
                            hold_ms: 800,
                            release_ms: 300,
                        })
                    }
                >
                    <Play className="size-3" />
                    Pulse
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2 text-[11px]"
                    disabled={!device.online}
                    onClick={() =>
                        void command("lovense:identify", { device_id: device.id })
                    }
                >
                    <RefreshCw className="size-3" />
                    Test
                </Button>
                <div className="flex-1" />
                <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="h-7 px-2 text-[11px]"
                    disabled={!device.online}
                    onClick={() => void stopAllOutputs()}
                >
                    <Square className="size-3" />
                    Stop
                </Button>
            </div>

            <details className="group rounded-lg border bg-muted/20 p-2.5">
                <summary className="cursor-pointer text-[10.5px] font-medium text-muted-foreground">
                    Device settings
                </summary>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <label className="space-y-1">
                        <span className="text-[10px] text-muted-foreground">Alias</span>
                        <Input
                            value={alias}
                            placeholder={device.name}
                            className="h-7 text-[11px]"
                            onChange={event => setAlias(event.target.value)}
                            onBlur={() => void saveAlias()}
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-[10px] text-muted-foreground">Tags</span>
                        <Input
                            value={tags}
                            placeholder="edge2, camille"
                            className="h-7 text-[11px]"
                            onChange={event => setTags(event.target.value)}
                            onBlur={() => void saveTags()}
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-[10px] text-muted-foreground">Cap %</span>
                        <Input
                            value={cap}
                            type="number"
                            min={0}
                            max={100}
                            className="h-7 text-[11px]"
                            onChange={event => setCap(event.target.value)}
                            onBlur={() => void saveCap()}
                        />
                    </label>
                </div>
                <div className="mt-2 flex items-center gap-2">
                    <p className="flex-1 text-[10px] text-muted-foreground/60">
                        Forget removes the PES record; the toy can be discovered again.
                    </p>
                    <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => {
                            if (!window.confirm(`Forget "${device.display_name}"?`)) return;
                            void command("lovense:device_delete", {
                                device_id: device.id,
                            }).then(onChanged);
                        }}
                    >
                        <Trash2 className="size-3" />
                        Forget
                    </Button>
                </div>
            </details>
        </div>
    );
}
