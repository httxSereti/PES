import { useEffect, useRef, useState } from "react";

export type SensorTracePoint = {
    t: number;
    value: number;
};

export const SENSOR_TRACE_WINDOW_MS = 5 * 60 * 1000;
const TRACE_SAMPLE_MS = 3_000;

/**
 * The backend exposes live sensor values but no history endpoint. Keep a
 * small client-side ring buffer so the card trace survives page navigation.
 */
const traceBuffers = new Map<string, SensorTracePoint[]>();

function freshPoints(
    sensorId: string,
    now: number,
    windowMs: number,
): SensorTracePoint[] {
    const existing = traceBuffers.get(sensorId) ?? [];
    const fresh = existing.filter((point) => point.t >= now - windowMs);

    if (fresh.length !== existing.length) {
        traceBuffers.set(sensorId, fresh);
    }

    return fresh;
}

type UseSensorTraceOptions = {
    windowMs?: number;
    sampleMs?: number;
};

export function useSensorTrace(
    sensorId: string,
    value: number,
    {
        windowMs = SENSOR_TRACE_WINDOW_MS,
        sampleMs = TRACE_SAMPLE_MS,
    }: UseSensorTraceOptions = {},
): SensorTracePoint[] {
    const valueRef = useRef(value);
    const [points, setPoints] = useState<SensorTracePoint[]>([]);

    valueRef.current = Number.isFinite(value) ? value : 0;

    useEffect(() => {
        const now = Date.now();
        const existing = freshPoints(sensorId, now, windowMs);
        const last = existing[existing.length - 1];
        const next =
            !last || now - last.t >= sampleMs
                ? [...existing, { t: now, value: valueRef.current }]
                : existing;

        traceBuffers.set(sensorId, next);
        setPoints(next);

        const interval = window.setInterval(() => {
            const t = Date.now();
            const current = freshPoints(sensorId, t, windowMs);
            const updated = [...current, { t, value: valueRef.current }].filter(
                (point) => point.t >= t - windowMs,
            );

            traceBuffers.set(sensorId, updated);
            setPoints(updated);
        }, sampleMs);

        return () => window.clearInterval(interval);
    }, [sensorId, sampleMs, windowMs]);

    return points;
}
