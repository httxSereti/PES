import { useEffect, useLayoutEffect, useState } from "react";

/**
 * Counts down locally between sensor updates. The backend counter is the
 * authoritative remaining time; the local timer keeps the UI moving when the
 * sensor is quiet.
 */
export function useCooldownTimer(initialSeconds: number): number {
    const normalized = Math.max(0, Math.ceil(initialSeconds));
    const [remaining, setRemaining] = useState(normalized);

    useLayoutEffect(() => {
        setRemaining(normalized);
    }, [normalized]);

    useEffect(() => {
        if (normalized === 0) return;

        const interval = window.setInterval(() => {
            setRemaining((current) => Math.max(0, current - 1));
        }, 1000);

        return () => window.clearInterval(interval);
    }, [normalized]);

    return remaining;
}
