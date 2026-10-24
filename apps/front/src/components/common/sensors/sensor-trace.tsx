import { cn } from "@pes/ui/lib/utils";
import type { FC } from "react";

import {
    SENSOR_TRACE_WINDOW_MS,
    useSensorTrace,
    type SensorTracePoint,
} from "@/hooks/useSensorTrace";

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 100;
const Y_INSET = 1.5;

type SensorTraceProps = {
    sensorId: string;
    value: number;
    threshold: number;
    unit: "%" | "u";
    maxValue: number;
    color: string;
    valueColor: string;
    label: string;
    eventAt?: number | null;
    online?: boolean;
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function formatValue(value: number, unit: SensorTraceProps["unit"]): string {
    return unit === "%" ? `${Math.round(value)}%` : `${value.toFixed(1)}u`;
}

function xFor(timestamp: number, windowStart: number): number {
    return clamp(
        ((timestamp - windowStart) / SENSOR_TRACE_WINDOW_MS) * VIEW_WIDTH,
        0,
        VIEW_WIDTH,
    );
}

function yFor(value: number, maxValue: number): number {
    const ratio = clamp(value / Math.max(maxValue, 1), 0, 1);
    return Y_INSET + (VIEW_HEIGHT - Y_INSET * 2) * (1 - ratio);
}

function nearestPoint(
    points: SensorTracePoint[],
    timestamp: number,
): SensorTracePoint | null {
    let nearest: SensorTracePoint | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const point of points) {
        const distance = Math.abs(point.t - timestamp);
        if (distance < nearestDistance) {
            nearest = point;
            nearestDistance = distance;
        }
    }

    return nearest;
}

export const SensorTrace: FC<SensorTraceProps> = ({
    sensorId,
    value,
    threshold,
    unit,
    maxValue,
    color,
    valueColor,
    label,
    eventAt = null,
    online = true,
}) => {
    const points = useSensorTrace(sensorId, value);
    const now = Date.now();
    const windowStart = now - SENSOR_TRACE_WINDOW_MS;
    const safeValue = Number.isFinite(value) ? value : 0;
    const safeMaxValue = Number.isFinite(maxValue) ? Math.max(maxValue, 1) : 1;
    const safeThreshold = Number.isFinite(threshold) ? threshold : 0;

    const history = points.filter(
        (point) => point.t >= windowStart && point.t < now - 250,
    );
    const livePoint: SensorTracePoint = { t: now, value: safeValue };
    const chartPoints = [...history, livePoint];
    const hasTrace = history.length >= 2;

    const coords = chartPoints.map((point) => ({
        x: xFor(point.t, windowStart),
        y: yFor(point.value, safeMaxValue),
    }));
    const first = coords[0];
    const last = coords[coords.length - 1];

    const linePath =
        hasTrace && coords.length > 1
            ? coords
                  .map(
                      (point, index) =>
                          `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
                  )
                  .join(" ")
            : `M 0 ${yFor(safeValue, safeMaxValue).toFixed(1)} L ${VIEW_WIDTH} ${yFor(safeValue, safeMaxValue).toFixed(1)}`;

    const areaPath =
        hasTrace && first && last
            ? `${linePath} L ${last.x.toFixed(1)} ${VIEW_HEIGHT} L ${first.x.toFixed(1)} ${VIEW_HEIGHT} Z`
            : null;

    const thresholdY = yFor(safeThreshold, safeMaxValue);
    const safeEventAt =
        eventAt !== null && Number.isFinite(eventAt) ? eventAt : null;
    const showEvent =
        safeEventAt !== null &&
        safeEventAt >= windowStart &&
        safeEventAt <= now;
    const eventX =
        showEvent && safeEventAt !== null ? xFor(safeEventAt, windowStart) : 0;
    const eventNearest =
        showEvent && safeEventAt !== null
            ? nearestPoint(chartPoints, safeEventAt)
            : null;
    const eventValue =
        eventNearest &&
        safeEventAt !== null &&
        Math.abs(eventNearest.t - safeEventAt) <= 60_000
            ? eventNearest.value
            : safeThreshold;
    const eventY = yFor(eventValue, safeMaxValue);
    const gradientId = `sensor-trace-fill-${sensorId}`;

    return (
        <div
            role="img"
            aria-label={`${label}. Current ${formatValue(safeValue, unit)}, trigger ${safeThreshold}%.`}
            className={cn(
                "relative h-28 w-full overflow-hidden rounded-lg border border-border/60 bg-[#0e0e0e]",
                !online && "opacity-70",
            )}
        >
            <div className="absolute inset-x-2.5 top-1.5 flex items-start justify-between gap-2">
                <span className="min-w-0 truncate font-mono text-[7.5px] tracking-[0.14em] text-zinc-500 uppercase">
                    {label}
                </span>
                <span
                    className="shrink-0 font-mono text-[13px] leading-none font-semibold tabular-nums"
                    style={{ color: valueColor }}
                >
                    {formatValue(safeValue, unit)}
                </span>
            </div>

            <div className="absolute inset-x-2.5 top-5 bottom-4">
                <svg
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full"
                    viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
                    preserveAspectRatio="none"
                >
                    <defs>
                        <linearGradient
                            id={gradientId}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor={color}
                                stopOpacity={0.22}
                            />
                            <stop
                                offset="100%"
                                stopColor={color}
                                stopOpacity={0.02}
                            />
                        </linearGradient>
                    </defs>

                    {[25, 50, 75].map((y) => (
                        <line
                            key={y}
                            x1={0}
                            x2={VIEW_WIDTH}
                            y1={y}
                            y2={y}
                            stroke="rgba(255,255,255,0.04)"
                            strokeWidth={1}
                            vectorEffect="non-scaling-stroke"
                        />
                    ))}

                    <line
                        x1={0}
                        x2={VIEW_WIDTH}
                        y1={thresholdY}
                        y2={thresholdY}
                        stroke={color}
                        strokeOpacity={0.45}
                        strokeWidth={1}
                        strokeDasharray="6 5"
                        vectorEffect="non-scaling-stroke"
                    />

                    {areaPath && (
                        <path d={areaPath} fill={`url(#${gradientId})`} />
                    )}

                    <path
                        d={linePath}
                        fill="none"
                        stroke={color}
                        strokeWidth={1.5}
                        strokeDasharray={hasTrace ? undefined : "4 4"}
                        strokeOpacity={hasTrace ? 1 : 0.45}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                    />

                    {showEvent && (
                        <line
                            x1={eventX}
                            x2={eventX}
                            y1={0}
                            y2={VIEW_HEIGHT}
                            stroke="rgba(255,255,255,0.1)"
                            strokeWidth={1}
                            strokeDasharray="2 3"
                            vectorEffect="non-scaling-stroke"
                        />
                    )}
                </svg>

                {last && (
                    <span
                        aria-hidden="true"
                        className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                        style={{
                            left: `${last.x / 10}%`,
                            top: `${last.y}%`,
                            backgroundColor: color,
                            boxShadow: `0 0 0 3px ${color}22`,
                        }}
                    />
                )}

                {showEvent && (
                    <span
                        aria-hidden="true"
                        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70"
                        style={{
                            left: `${eventX / 10}%`,
                            top: `${eventY}%`,
                            backgroundColor: color,
                        }}
                    />
                )}

                <span
                    className="absolute right-1 z-10 -translate-y-1/2 rounded border px-1 py-0.5 font-mono text-[7px] leading-none tabular-nums"
                    style={{
                        top: `${clamp(thresholdY, 6, 94)}%`,
                        color: valueColor,
                        backgroundColor: `${color}1f`,
                        borderColor: `${color}38`,
                    }}
                >
                    {safeThreshold}%
                </span>
            </div>

            <div className="absolute inset-x-2.5 bottom-1 flex items-center justify-between font-mono text-[6.5px] tracking-[0.12em] text-zinc-600 uppercase">
                <span>5m ago</span>
                <span>now</span>
            </div>
        </div>
    );
};
