import { useEffect, useRef, useState } from "react";
import type { Ramp } from "@/types";

/**
 * Approximate live elapsed time of a running ramp.
 *
 * `ramps:update` is only emitted on lifecycle changes (start/pause/resume),
 * so `ramp.elapsed` freezes between them while the field value keeps flowing
 * through `units:update`. Rebase on every fresh snapshot, then tick locally.
 */
export function useRampElapsed(ramp: Ramp): number {
    const baseRef = useRef({ elapsed: ramp.elapsed, since: Date.now() });
    const paused = ramp.paused;
    const [, setTick] = useState(0);

    useEffect(() => {
        baseRef.current = { elapsed: ramp.elapsed, since: Date.now() };
    }, [ramp.elapsed, paused, ramp.unit, ramp.field]);

    useEffect(() => {
        if (paused) return;
        const id = window.setInterval(() => setTick((tick) => tick + 1), 1000);
        return () => window.clearInterval(id);
    }, [paused]);

    if (paused) return ramp.elapsed;
    return baseRef.current.elapsed + (Date.now() - baseRef.current.since) / 1000;
}
