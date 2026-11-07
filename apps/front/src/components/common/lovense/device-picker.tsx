import { Battery, BatteryLow, Check, Plus, Vibrate } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { cn } from "@pes/ui/lib/utils";
import type { LovenseDeviceInfo } from "@/types";

interface DevicePickerProps {
    devices: LovenseDeviceInfo[];
    selectedDeviceIds: string[];
    activeDeviceId: string | null;
    onToggle: (deviceId: string) => void;
    onActivate: (deviceId: string) => void;
    onSelectOnly: (deviceId: string) => void;
    onManage: () => void;
    compact?: boolean;
}

export function DevicePicker({
    devices,
    selectedDeviceIds,
    activeDeviceId,
    onToggle,
    onActivate,
    onSelectOnly,
    onManage,
    compact = false,
}: DevicePickerProps) {
    return (
        <section aria-label="Toy selection" className="space-y-2.5">
            <div className="flex min-h-7 items-center gap-2">
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">
                        {selectedDeviceIds.length > 0
                            ? `${selectedDeviceIds.length} ${selectedDeviceIds.length === 1 ? "toy" : "toys"} selected`
                            : "Select a toy to start"}
                    </p>
                </div>
                {selectedDeviceIds.length > 1 && activeDeviceId && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2.5 text-xs"
                        onClick={() => onSelectOnly(activeDeviceId)}
                    >
                        Solo
                    </Button>
                )}
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                    onClick={onManage}
                >
                    <Plus className="size-3.5" />
                    Manage
                </Button>
            </div>

            {devices.length === 0 ? (
                <button
                    type="button"
                    onClick={onManage}
                    className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-violet-500/30 bg-violet-500/[0.04] p-4 text-left transition-colors hover:bg-violet-500/[0.08]"
                >
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-500">
                        <Vibrate className="size-5" />
                    </span>
                    <span>
                        <span className="block text-sm font-semibold">
                            Connect your first toy
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                            Start Intiface and scan for nearby devices.
                        </span>
                    </span>
                </button>
            ) : (
                <div className="scrollbar-none -mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1">
                    {devices.map((device) => {
                        const selected = selectedDeviceIds.includes(device.id);
                        const active = activeDeviceId === device.id;
                        const BatteryIcon =
                            device.battery_pct != null &&
                            device.battery_pct <= 15
                                ? BatteryLow
                                : Battery;
                        return (
                            <div
                                key={device.id}
                                className={cn(
                                    "relative min-w-[190px] flex-1 snap-start rounded-2xl border bg-card/80 transition-all sm:min-w-[210px]",
                                    active && selected
                                        ? "border-violet-500/60 shadow-[0_0_24px_rgba(139,92,246,0.12)]"
                                        : selected
                                          ? "border-violet-500/30"
                                          : "border-border/70",
                                    !device.online && "opacity-55",
                                )}
                            >
                                <button
                                    type="button"
                                    className="flex w-full items-center gap-3 rounded-2xl p-3 pr-11 text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                                    onClick={() => onActivate(device.id)}
                                    aria-label={`Focus ${device.display_name}`}
                                >
                                    <span
                                        className={cn(
                                            "relative grid size-10 shrink-0 place-items-center rounded-xl",
                                            selected
                                                ? "bg-violet-500/15 text-violet-500"
                                                : "bg-muted text-muted-foreground",
                                        )}
                                    >
                                        <Vibrate
                                            className={cn(
                                                "size-5",
                                                selected &&
                                                    device.online &&
                                                    "animate-pulse",
                                            )}
                                        />
                                        <span
                                            className={cn(
                                                "absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-card",
                                                device.online
                                                    ? "bg-emerald-500"
                                                    : "bg-muted-foreground/50",
                                            )}
                                        />
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-semibold">
                                            {device.display_name}
                                        </span>
                                        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                            <BatteryIcon
                                                className={cn(
                                                    "size-3.5",
                                                    device.battery_pct !=
                                                        null &&
                                                        device.battery_pct <=
                                                            15 &&
                                                        "text-red-500",
                                                )}
                                            />
                                            {device.battery_pct != null
                                                ? `${device.battery_pct}%`
                                                : "Battery —"}
                                            <span>·</span>
                                            {device.online
                                                ? "Online"
                                                : "Offline"}
                                        </span>
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    aria-label={`${selected ? "Remove" : "Add"} ${device.display_name} ${selected ? "from" : "to"} group`}
                                    aria-pressed={selected}
                                    onClick={() => onToggle(device.id)}
                                    className={cn(
                                        "absolute right-3 top-3 grid size-7 place-items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
                                        selected
                                            ? "border-violet-500 bg-violet-500 text-white"
                                            : "border-muted-foreground/30 bg-background/70 text-transparent hover:border-violet-500/60",
                                    )}
                                >
                                    <Check className="size-4" strokeWidth={3} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
            {!compact && selectedDeviceIds.length > 1 && (
                <p className="px-1 text-[11px] text-muted-foreground">
                    Tap a name to view its motors. Use the check button to build
                    a group.
                </p>
            )}
        </section>
    );
}
