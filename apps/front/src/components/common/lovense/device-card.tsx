import { useEffect, useState } from "react";
import {
    Battery,
    BatteryLow,
    Radio,
    RefreshCw,
    ScanLine,
    Settings2,
    Tag,
    Trash2,
    Vibrate,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@pes/ui/components/badge";
import { Button } from "@pes/ui/components/button";
import { Input } from "@pes/ui/components/input";
import { cn } from "@pes/ui/lib/utils";

import { useWebSocket } from "@/hooks/useWebSocket";
import type { LovenseDeviceInfo } from "@/types";
import { deviceOutputs, effectiveCap } from "./player-utils";

interface DeviceCardProps {
    device: LovenseDeviceInfo;
    nodeName?: string;
    globalCap: number;
    onChanged: () => void;
}

export function DeviceCard({
    device,
    nodeName,
    globalCap,
    onChanged,
}: DeviceCardProps) {
    const { sendCommand } = useWebSocket();
    const [alias, setAlias] = useState(device.alias ?? "");
    const [tags, setTags] = useState((device.tags ?? []).join(", "));
    const [cap, setCap] = useState(String(device.max_intensity_pct));
    const [saving, setSaving] = useState(false);
    const entries = deviceOutputs(device, globalCap);
    const outputCap = effectiveCap(device, globalCap);

    useEffect(() => {
        setAlias(device.alias ?? "");
        setTags((device.tags ?? []).join(", "));
        setCap(String(device.max_intensity_pct));
    }, [device.alias, device.max_intensity_pct, device.tags]);

    const save = async () => {
        setSaving(true);
        try {
            const result = await sendCommand("lovense:device_update", {
                device_id: device.id,
                alias: alias.trim(),
                tags: tags
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                max_intensity_pct: Math.max(0, Math.min(100, Number(cap) || 0)),
                control_policy: device.control_policy,
            });
            if (result.status !== "ok") {
                toast.error(result.message ?? "Unable to save toy settings");
                return;
            }
            toast.success("Toy settings saved");
            onChanged();
        } finally {
            setSaving(false);
        }
    };

    const identify = async () => {
        const result = await sendCommand("lovense:identify", {
            device_id: device.id,
        });
        if (result.status !== "ok")
            toast.error(result.message ?? "Identify failed");
    };

    const readBattery = async () => {
        const result = await sendCommand("lovense:battery", {
            device_ids: [device.id],
        });
        if (result.status !== "ok")
            toast.error(result.message ?? "Battery read failed");
    };

    const forget = async () => {
        if (
            !window.confirm(
                `Forget “${device.display_name}”? It can be discovered again.`,
            )
        )
            return;
        const result = await sendCommand("lovense:device_delete", {
            device_id: device.id,
            alias: null,
            tags: null,
            max_intensity_pct: null,
            control_policy: null,
        });
        if (result.status !== "ok") {
            toast.error(result.message ?? "Unable to forget toy");
            return;
        }
        onChanged();
    };

    const BatteryIcon =
        device.battery_pct != null && device.battery_pct <= 15
            ? BatteryLow
            : Battery;

    return (
        <article className="overflow-hidden rounded-[22px] border bg-card/80">
            <div className="p-4">
                <div className="flex items-start gap-3">
                    <span
                        className={cn(
                            "relative grid size-11 shrink-0 place-items-center rounded-xl",
                            device.online
                                ? "bg-violet-500/12 text-violet-500"
                                : "bg-muted text-muted-foreground",
                        )}
                    >
                        <Vibrate className="size-5" />
                        <span
                            className={cn(
                                "absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-card",
                                device.online
                                    ? "bg-emerald-500"
                                    : "bg-muted-foreground/40",
                            )}
                        />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <h3 className="truncate text-sm font-semibold">
                                {device.display_name}
                            </h3>
                            <Badge variant="outline" className="text-[9px]">
                                {device.online ? "ONLINE" : "OFFLINE"}
                            </Badge>
                        </div>
                        <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                            <Radio className="size-3" />
                            {nodeName ?? device.node_id} · {device.name}
                        </p>
                    </div>
                    <Badge
                        variant="outline"
                        className="shrink-0 gap-1.5 text-[10px]"
                    >
                        <BatteryIcon
                            className={cn(
                                "size-3.5",
                                device.battery_pct != null &&
                                    device.battery_pct <= 15
                                    ? "text-red-500"
                                    : "text-emerald-500",
                            )}
                        />
                        {device.battery_pct != null
                            ? `${device.battery_pct}%`
                            : "—"}
                    </Badge>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">
                        Cap {outputCap}%
                    </Badge>
                    {entries.map((entry) => (
                        <Badge
                            key={`${entry.featureIndex}:${entry.output}`}
                            variant="outline"
                            className="text-[9px] font-normal"
                        >
                            {entry.label}
                        </Badge>
                    ))}
                    {device.tags.map((tag) => (
                        <Badge
                            key={tag}
                            variant="secondary"
                            className="gap-1 text-[9px] font-normal"
                        >
                            <Tag className="size-2.5" />
                            {tag}
                        </Badge>
                    ))}
                </div>

                <div className="mt-4 flex gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        className="h-10 flex-1 rounded-xl text-xs"
                        disabled={!device.online}
                        onClick={() => void identify()}
                    >
                        <ScanLine className="size-4" />
                        Identify
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        className="h-10 flex-1 rounded-xl text-xs"
                        disabled={!device.online}
                        onClick={() => void readBattery()}
                    >
                        <RefreshCw className="size-4" />
                        Battery
                    </Button>
                </div>
            </div>

            <details className="group border-t bg-muted/10">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-xs font-medium text-muted-foreground hover:text-foreground">
                    <Settings2 className="size-3.5" />
                    Toy settings
                    <span className="ml-auto text-[10px] group-open:hidden">
                        Alias, tags & safety cap
                    </span>
                </summary>
                <div className="space-y-3 border-t p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1.5">
                            <span className="text-[11px] font-medium">
                                Display name
                            </span>
                            <Input
                                value={alias}
                                placeholder={device.name}
                                onChange={(event) =>
                                    setAlias(event.target.value)
                                }
                            />
                        </label>
                        <label className="space-y-1.5">
                            <span className="text-[11px] font-medium">
                                Safety cap (%)
                            </span>
                            <Input
                                value={cap}
                                type="number"
                                min={0}
                                max={100}
                                onChange={(event) => setCap(event.target.value)}
                            />
                        </label>
                    </div>
                    <label className="block space-y-1.5">
                        <span className="text-[11px] font-medium">
                            Tags, separated by commas
                        </span>
                        <Input
                            value={tags}
                            placeholder="edge2, bedroom"
                            onChange={(event) => setTags(event.target.value)}
                        />
                    </label>
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                        The lower of this cap and the global cap is enforced by
                        the server for manual control and patterns.
                    </p>
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            className="h-10 flex-1 rounded-xl bg-violet-600 text-white"
                            disabled={saving}
                            onClick={() => void save()}
                        >
                            {saving ? "Saving…" : "Save settings"}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="h-10 rounded-xl border-red-500/25 text-red-500 hover:bg-red-500/10"
                            onClick={() => void forget()}
                        >
                            <Trash2 className="size-4" />
                            Forget
                        </Button>
                    </div>
                </div>
            </details>
        </article>
    );
}
