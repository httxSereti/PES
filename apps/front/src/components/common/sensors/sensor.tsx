import { SensorMotion } from "@/components/common/sensors/motion/sensor-motion";
import { SensorSound } from "@/components/common/sensors/sound/sensor-sound";
import { useWebSocket } from "@/hooks/useWebSocket";
import { isSensorAlert } from "@/lib/sensor-alert";
import { getSensorTheme } from "@/lib/sensor-theme";
import { useAppSelector } from "@/store/hooks";
import { sensorsSelectors } from "@/store/slices/sensorsSlice";
import type {
    HardwareSensorId,
    MotionSensor,
    Sensor as SensorModel,
    SoundSensor,
} from "@/types";
import { Button } from "@pes/ui/components/button";
import { Card } from "@pes/ui/components/card";
import { Skeleton } from "@pes/ui/components/skeleton";
import { cn } from "@pes/ui/lib/utils";
import { Bell, BellOff, RefreshCw, Wifi, WifiOff } from "lucide-react";
import type { FC } from "react";
import { toast } from "sonner";

type SensorProps = {
    sensorId: HardwareSensorId;
};

type SensorState = {
    label: string;
    dotClassName: string;
    chipClassName: string;
};

function getSensorState(
    sensor: SensorModel,
    enabled: boolean,
    alerting: boolean,
): SensorState {
    if (!enabled) {
        return {
            label: "Disabled",
            dotClassName: "bg-zinc-500",
            chipClassName:
                "border-zinc-500/20 bg-zinc-500/10 text-zinc-500 dark:text-zinc-400",
        };
    }

    if (!sensor.sensor_online) {
        return {
            label: "Offline",
            dotClassName: "bg-red-500",
            chipClassName:
                "border-red-500/20 bg-red-500/10 text-red-500 dark:text-red-400",
        };
    }

    if (alerting) {
        return {
            label: "Alert",
            dotClassName: "bg-orange-500",
            chipClassName:
                "border-orange-500/25 bg-orange-500/10 text-orange-500 dark:text-orange-400",
        };
    }

    if (sensor.alarm_enable) {
        return {
            label: "Armed",
            dotClassName: "bg-emerald-500",
            chipClassName:
                "border-emerald-500/20 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400",
        };
    }

    return {
        label: "Disarmed",
        dotClassName: "bg-zinc-500",
        chipClassName: "border-border/60 bg-muted/30 text-muted-foreground",
    };
}

export const Sensor: FC<SensorProps> = ({ sensorId }) => {
    const sensor = useAppSelector((state) =>
        sensorsSelectors.selectById(state, sensorId),
    );
    const enabled = useAppSelector((state) => state.hardware[sensorId] ?? true);
    const { sendCommand } = useWebSocket();

    if (!sensor) {
        return <Skeleton className="h-[560px] w-full rounded-xl" />;
    }

    const alerting = enabled && sensor.sensor_online && isSensorAlert(sensor);
    const state = getSensorState(sensor, enabled, alerting);
    const theme = getSensorTheme(sensorId, alerting);
    const Icon = theme.icon;

    const toggleStatus = async () => {
        try {
            const result = await sendCommand("sensors:update", {
                [sensorId]: {
                    alarm_enable: !sensor.alarm_enable,
                },
            });
            if (result.status !== "ok") {
                throw new Error(result.message ?? "Command failed");
            }
        } catch (err: unknown) {
            const error = err as Error;

            toast.error("Can't update sensor", {
                description: error.message,
                position: "top-right",
            });

            console.error("Failed to update sensor:", error);
        }
    };

    const toggleConnection = async () => {
        try {
            const result = await sendCommand("hardware:update_bt_sensors", {
                id: sensorId,
                enabled: !enabled,
            });
            if (result.status !== "ok") {
                throw new Error(result.message ?? "Command failed");
            }
        } catch (err: unknown) {
            const error = err as Error;

            toast.error("Can't update sensor connection", {
                description: error.message,
                position: "top-right",
            });
        }
    };

    const rescan = async () => {
        try {
            const result = await sendCommand("hardware:rescan_bt_sensors", {
                id: sensorId,
            });
            if (result.status !== "ok") {
                throw new Error(result.message ?? "Command failed");
            }
        } catch (err: unknown) {
            const error = err as Error;

            toast.error("Can't rescan sensor", {
                description: error.message,
                position: "top-right",
            });
        }
    };

    return (
        <Card className="flex h-full flex-col gap-0 overflow-hidden rounded-xl border py-0 shadow-sm">
            <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <span
                            className={cn(
                                "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                                theme.tileClassName,
                            )}
                        >
                            <Icon className="size-4" />
                        </span>
                        <div className="min-w-0">
                            <div className="truncate text-[13px] leading-none font-medium">
                                {theme.name}
                            </div>
                            <div className="mt-1 font-mono text-[8.5px] tracking-[0.14em] text-muted-foreground/50 uppercase">
                                {sensor.id} · BLE
                            </div>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                        <span
                            className={cn(
                                "size-1.5 rounded-full",
                                state.dotClassName,
                            )}
                        />
                        <span
                            className={cn(
                                "rounded border px-1.5 py-0.5 font-mono text-[8px] tracking-[0.12em] uppercase",
                                state.chipClassName,
                            )}
                        >
                            {state.label}
                        </span>
                    </div>
                </div>

                {sensor.sensor_type === "motion" ? (
                    <SensorMotion
                        sensorId={sensorId}
                        sensor={sensor as MotionSensor}
                        theme={theme}
                    />
                ) : (
                    <SensorSound
                        sensorId={sensorId}
                        sensor={sensor as SoundSensor}
                        theme={theme}
                    />
                )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 px-4 py-3">
                <Button
                    variant="outline"
                    size="xs"
                    onClick={rescan}
                    disabled={!enabled}
                    title={
                        enabled
                            ? "Rescan Bluetooth sensor"
                            : "Enable the sensor to rescan"
                    }
                    className="h-7 gap-1.5 border-border/50 bg-muted/20 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                >
                    <RefreshCw className="size-3" />
                    Rescan
                </Button>

                <Button
                    variant="outline"
                    size="xs"
                    onClick={toggleConnection}
                    className="h-7 gap-1.5 border-border/50 bg-muted/20 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                >
                    {enabled ? (
                        <WifiOff className="size-3" />
                    ) : (
                        <Wifi className="size-3" />
                    )}
                    {enabled ? "Disable" : "Enable"}
                </Button>

                <button
                    type="button"
                    onClick={toggleStatus}
                    aria-pressed={sensor.alarm_enable}
                    aria-label={
                        sensor.alarm_enable ? "Disable alarm" : "Enable alarm"
                    }
                    className={cn(
                        "ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 font-mono text-[9px] tracking-[0.08em] uppercase transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                        sensor.alarm_enable
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400"
                            : "border-border/50 bg-muted/20 text-muted-foreground/60 hover:text-foreground",
                    )}
                >
                    {sensor.alarm_enable ? (
                        <Bell className="size-3" />
                    ) : (
                        <BellOff className="size-3" />
                    )}
                    {sensor.alarm_enable ? "Alarm on" : "Alarm off"}
                </button>
            </div>
        </Card>
    );
};
