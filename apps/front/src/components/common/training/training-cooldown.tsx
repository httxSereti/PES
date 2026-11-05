import { Hourglass } from "lucide-react";

import { formatDuration } from "@/lib/training";

interface TrainingCooldownProps {
    /** Seconds left before the next successful edge (0 = ready). */
    remaining: number;
    /** Configured minimum interval; 0 hides the indicator. */
    intervalSeconds: number;
    className?: string;
}

/** Small live badge showing the remaining cooldown between two edges. */
export function TrainingCooldown({
    remaining,
    intervalSeconds,
    className,
}: TrainingCooldownProps) {
    if (intervalSeconds <= 0) return null;

    const active = remaining > 0;

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${
                active
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            } ${className ?? ""}`}
            title={
                active
                    ? "The next edge is blocked until the cooldown ends"
                    : "The next edge can be recorded"
            }
        >
            <Hourglass size={12} />
            {active ? (
                <>
                    Cooldown
                    <span className="font-mono tabular-nums">
                        {formatDuration(remaining)}
                    </span>
                </>
            ) : (
                "Ready for next edge"
            )}
        </span>
    );
}
