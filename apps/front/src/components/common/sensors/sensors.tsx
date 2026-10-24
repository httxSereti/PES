import { Sensor } from "@/components/common/sensors/sensor";
import { SENSOR_TRACE_WINDOW_MS } from "@/hooks/useSensorTrace";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import { sensorsSelectors } from "@/store/slices/sensorsSlice";
import type { HardwareSensorId } from "@/types";
import { Button } from "@pes/ui/components/button";
import { cn } from "@pes/ui/lib/utils";
import { Loader2, Power, RefreshCw, Wifi } from "lucide-react";
import { useEffect, useState, type FC } from "react";
import { toast } from "sonner";

type HeaderStatProps = {
    value: number;
    label: string;
    tone?: "default" | "warn" | "ok";
};

const HeaderStat: FC<HeaderStatProps> = ({
    value,
    label,
    tone = "default",
}) => (
    <div className="flex flex-col items-end gap-0.5">
        <span
            className={cn(
                "font-mono text-[11px] leading-none tabular-nums",
                tone === "warn" && "text-orange-500 dark:text-orange-400",
                tone === "ok" && "text-emerald-500 dark:text-emerald-400",
                tone === "default" && "text-foreground/90",
            )}
        >
            {value}
        </span>
        <span className="font-mono text-[7.5px] tracking-[0.12em] text-muted-foreground/40 uppercase">
            {label}
        </span>
    </div>
);

export const Sensors: FC = () => {
    const sensors = useAppSelector((state) =>
        sensorsSelectors.selectAll(state),
    );
    const hardware = useAppSelector((state) => state.hardware);
    const events = useAppSelector((state) => state.events.events);
    const { sendCommand } = useWebSocket();
    const [globalAction, setGlobalAction] = useState<
        "rescan" | "disable" | null
    >(null);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const interval = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(interval);
    }, []);

    const onlineCount = sensors.filter(
        (sensor) => (hardware[sensor.id] ?? true) && sensor.sensor_online,
    ).length;
    const armedCount = sensors.filter(
        (sensor) => (hardware[sensor.id] ?? true) && sensor.alarm_enable,
    ).length;
    const controlsCount = sensors.reduce(
        (total, sensor) => total + (sensor.sensor_type === "sound" ? 3 : 6),
        0,
    );
    const alertCutoff = now - SENSOR_TRACE_WINDOW_MS;
    const alerts5m = events.filter(
        (event) =>
            event.event_type.startsWith("sensor_") &&
            new Date(event.triggered_at).getTime() >= alertCutoff,
    ).length;
    const enabledSensors = sensors.filter(
        (sensor) => hardware[sensor.id] ?? true,
    );

    const rescanAll = async () => {
        const targets = enabledSensors.map(
            (sensor) => sensor.id as HardwareSensorId,
        );
        if (targets.length === 0) return;

        setGlobalAction("rescan");
        try {
            const results = await Promise.allSettled(
                targets.map((id) =>
                    sendCommand("hardware:rescan_bt_sensors", { id }),
                ),
            );
            const failed = results.filter(
                (result) =>
                    result.status === "rejected" ||
                    (result.status === "fulfilled" &&
                        result.value.status !== "ok"),
            ).length;

            if (failed > 0) {
                toast.error("Some sensors could not be rescanned", {
                    description: `${failed} of ${targets.length} failed.`,
                    position: "top-right",
                });
            } else {
                toast.success("Rescan requested", {
                    description: `${targets.length} sensor${targets.length === 1 ? "" : "s"}`,
                    position: "top-right",
                });
            }
        } finally {
            setGlobalAction(null);
        }
    };

    const disableAll = async () => {
        const targets = enabledSensors.map(
            (sensor) => sensor.id as HardwareSensorId,
        );
        if (targets.length === 0) return;

        setGlobalAction("disable");
        try {
            const results = await Promise.allSettled(
                targets.map((id) =>
                    sendCommand("hardware:update_bt_sensors", {
                        id,
                        enabled: false,
                    }),
                ),
            );
            const failed = results.filter(
                (result) =>
                    result.status === "rejected" ||
                    (result.status === "fulfilled" &&
                        result.value.status !== "ok"),
            ).length;

            if (failed > 0) {
                toast.error("Some sensors could not be disabled", {
                    description: `${failed} of ${targets.length} failed.`,
                    position: "top-right",
                });
            } else {
                toast.success("Sensors disabled", {
                    description: `${targets.length} sensor${targets.length === 1 ? "" : "s"}`,
                    position: "top-right",
                });
            }
        } finally {
            setGlobalAction(null);
        }
    };

    const globalBusy = globalAction !== null;

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-4 px-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="font-syne text-xl font-extrabold sm:text-2xl lg:text-[26px]">
                        Sensors
                    </h1>
                    <div className="text-xs text-muted-foreground">
                        Every control, already open
                    </div>
                    <p className="mt-1 max-w-[640px] text-[11px] text-muted-foreground/50">
                        No drawers, no collapsed cards. Thresholds, trigger
                        delays, cooldowns and sensor actions are all editable
                        here.
                    </p>
                </div>

                <div className="hidden items-center gap-3 lg:flex">
                    <HeaderStat value={controlsCount} label="Controls" />
                    <span className="h-5 w-px bg-border" />
                    <HeaderStat
                        value={alerts5m}
                        label="Alerts / 5m"
                        tone={alerts5m > 0 ? "warn" : "default"}
                    />
                    <span className="h-5 w-px bg-border" />
                    <HeaderStat
                        value={armedCount}
                        label="Armed"
                        tone={armedCount > 0 ? "ok" : "default"}
                    />
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 px-5">
                <span className="font-mono text-[9px] tracking-[0.16em] text-muted-foreground/40 uppercase">
                    All sensors · {sensors.length}
                </span>

                <div
                    className={cn(
                        "flex items-center gap-2 rounded-md border px-2.5 py-1.5",
                        onlineCount > 0
                            ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
                            : "border-border/50 bg-muted/20 text-muted-foreground/60",
                    )}
                >
                    <Wifi className="size-3" />
                    <span className="font-mono text-[9px] tracking-[0.08em] tabular-nums">
                        {onlineCount}/{sensors.length} online
                    </span>
                </div>

                <div className="ml-auto flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="xs"
                        onClick={rescanAll}
                        disabled={globalBusy || enabledSensors.length === 0}
                        className="h-7 gap-1.5 border-border/50 bg-muted/20 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                        {globalAction === "rescan" ? (
                            <Loader2 className="size-3 animate-spin" />
                        ) : (
                            <RefreshCw className="size-3" />
                        )}
                        Rescan all
                    </Button>
                    <Button
                        variant="outline"
                        size="xs"
                        onClick={disableAll}
                        disabled={globalBusy || enabledSensors.length === 0}
                        className="h-7 gap-1.5 border-border/50 bg-muted/20 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                        {globalAction === "disable" ? (
                            <Loader2 className="size-3 animate-spin" />
                        ) : (
                            <Power className="size-3" />
                        )}
                        Disable all
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 items-stretch gap-5 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">
                <Sensor sensorId="sound" />
                <Sensor sensorId="motion1" />
                <Sensor sensorId="motion2" />
            </div>
        </div>
    );
};
