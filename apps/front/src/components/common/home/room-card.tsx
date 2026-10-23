import { useMemo } from "react";
import { Radar } from "lucide-react";
import { Link } from "react-router";

import { cn } from "@pes/ui/lib/utils";

import { isSensorAlert, sensorReading } from "@/lib/sensor-alert";
import { useAppSelector } from "@/store/hooks";
import { sensorsSelectors } from "@/store/slices/sensorsSlice";
import type { Sensor } from "@/types";

const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 29;

const SENSOR_META = [
    {
        id: "motion1",
        label: "Motion 1",
        ring: "text-violet-500 dark:text-violet-400",
    },
    {
        id: "motion2",
        label: "Motion 2",
        ring: "text-blue-500 dark:text-blue-400",
    },
    {
        id: "sound",
        label: "Sound",
        ring: "text-amber-500 dark:text-amber-400",
    },
] as const;

function SensorGauge({
    sensor,
    label,
    ringClassName,
}: {
    sensor: Sensor | undefined;
    label: string;
    ringClassName: string;
}) {
    const reading = sensor ? sensorReading(sensor) : null;
    const alarming = sensor ? isSensorAlert(sensor) : false;
    const pct =
        reading && reading.threshold > 0
            ? Math.min(
                  100,
                  Math.max(
                      0,
                      Math.round((reading.value / reading.threshold) * 100),
                  ),
              )
            : 0;
    const dash = (GAUGE_CIRCUMFERENCE * pct) / 100;

    return (
        <div
            className="flex min-w-0 flex-col items-center gap-1.5"
            title={
                reading
                    ? `${label}: ${Math.round(reading.value)}${reading.unit} · alarm at ${reading.threshold}${reading.unit}`
                    : `${label}: unavailable`
            }
        >
            <div className="relative size-16">
                <svg
                    viewBox="0 0 68 68"
                    className="size-16 -rotate-90"
                    aria-hidden="true"
                >
                    <circle
                        cx="34"
                        cy="34"
                        r="29"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="5"
                        className="text-muted/40"
                    />
                    <circle
                        cx="34"
                        cy="34"
                        r="29"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={`${dash} ${GAUGE_CIRCUMFERENCE}`}
                        className={cn(
                            "transition-[stroke-dasharray] duration-500",
                            alarming ? "text-rose-500" : ringClassName,
                        )}
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span
                        className={cn(
                            "font-mono text-sm leading-none font-semibold tabular-nums",
                            alarming ? "text-rose-500" : "text-foreground",
                        )}
                    >
                        {reading ? Math.round(reading.value) : "—"}
                    </span>
                    <span className="mt-0.5 font-mono text-[7px] text-muted-foreground">
                        {sensor
                            ? sensor.sensor_type === "motion"
                                ? "mov"
                                : "%"
                            : "—"}
                    </span>
                </div>
            </div>
            <span className="truncate text-[10px] font-medium text-foreground">
                {label}
            </span>
            <span className="flex items-center gap-1 font-mono text-[7px] text-muted-foreground/70">
                <span
                    className={cn(
                        "size-1 rounded-full",
                        sensor?.sensor_online
                            ? "bg-emerald-500"
                            : "bg-muted-foreground/30",
                    )}
                />
                {sensor?.sensor_online ? "online" : "offline"}
            </span>
        </div>
    );
}

export function RoomCard() {
    const sensors = useAppSelector(sensorsSelectors.selectAll);
    const sensorById = useMemo(
        () => new Map(sensors.map((sensor) => [sensor.id, sensor])),
        [sensors],
    );

    const alerts = sensors.filter(isSensorAlert).length;
    const online = sensors.filter((sensor) => sensor.sensor_online).length;

    return (
        <section className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2">
                <span className="accent-tile grid size-8 place-items-center rounded-lg">
                    <Radar className="accent-tile-icon size-4" />
                </span>
                <div>
                    <h2 className="font-syne text-sm font-bold">Room</h2>
                    <p className="font-mono text-[8px] tracking-[0.12em] text-muted-foreground/60 uppercase">
                        Sensors
                    </p>
                </div>
                <span
                    className={cn(
                        "ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[8px]",
                        alerts > 0
                            ? "border-rose-500/30 bg-rose-500/10 text-rose-500"
                            : "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                    )}
                >
                    <span
                        className={cn(
                            "size-1 rounded-full",
                            alerts > 0 ? "bg-rose-500" : "bg-emerald-500",
                        )}
                    />
                    {alerts > 0
                        ? `${alerts} alarm${alerts > 1 ? "s" : ""}`
                        : "0 alarms"}
                </span>
                <Link
                    to="/app/sensors"
                    className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                >
                    Open →
                </Link>
            </div>

            <div className="grid flex-1 grid-cols-3 items-center gap-2">
                {SENSOR_META.map((meta) => (
                    <SensorGauge
                        key={meta.id}
                        sensor={sensorById.get(meta.id)}
                        label={meta.label}
                        ringClassName={meta.ring}
                    />
                ))}
            </div>

            <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-2.5 text-[9px] text-muted-foreground">
                <span className="font-mono">
                    {online}/{sensors.length} online
                </span>
                <Link
                    to="/app/sensors"
                    className="transition-colors hover:text-foreground"
                >
                    Sensor detail →
                </Link>
            </div>
        </section>
    );
}
