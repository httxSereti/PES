import type { ReactNode } from "react";

import { Input } from "@pes/ui/components/input";
import { Slider } from "@pes/ui/components/slider";
import { cn } from "@pes/ui/lib/utils";

/** Purple pill shared by unit toggles, duration presets and unit chips. */
export function ToggleChip({
    active,
    disabled,
    className,
    children,
    onClick,
    title,
}: {
    active: boolean;
    disabled?: boolean;
    className?: string;
    children: ReactNode;
    onClick: () => void;
    title?: string;
}) {
    return (
        <button
            type="button"
            aria-pressed={active}
            disabled={disabled}
            title={title}
            onClick={onClick}
            className={cn(
                "inline-flex h-7 cursor-pointer items-center rounded-lg border px-2.5 text-[11px] font-medium transition-colors",
                active
                    ? "border-purple-500/30 bg-purple-500/15 text-purple-700 dark:text-purple-200"
                    : "border-border bg-muted/40 text-muted-foreground/70 hover:border-muted-foreground/30 hover:text-foreground",
                disabled && "cursor-not-allowed opacity-40",
                className,
            )}
        >
            {children}
        </button>
    );
}

/** Slider + numeric input driving one 0-100 level (or the apply %). */
export function LevelControl({
    value,
    onChange,
    max = 100,
    className,
    "aria-label": ariaLabel,
}: {
    value: number;
    onChange: (value: number) => void;
    max?: number;
    className?: string;
    "aria-label"?: string;
}) {
    const clamp = (raw: number) =>
        Number.isFinite(raw) ? Math.min(max, Math.max(0, Math.round(raw))) : 0;

    return (
        <div className={cn("flex items-center gap-3", className)}>
            <Slider
                aria-label={ariaLabel}
                value={[value]}
                min={0}
                max={max}
                step={1}
                onValueChange={([next]) => onChange(clamp(next ?? 0))}
                className="flex-1"
            />
            <Input
                type="number"
                min={0}
                max={max}
                value={value}
                aria-label={ariaLabel ? `${ariaLabel} value` : undefined}
                onChange={(event) =>
                    onChange(clamp(Number(event.target.value)))
                }
                className="h-8 w-16 shrink-0 text-center font-mono text-xs"
            />
        </div>
    );
}

/**
 * Channel usage limit band: value fill scaled to `limit.max`, with start /
 * warn ticks. Turns amber once the stored level would be clamped at apply.
 */
export function UsageLimitBar({
    value,
    limit,
    tone,
}: {
    value: number;
    limit: { start: number; warn: number; max: number };
    tone: "violet" | "blue";
}) {
    const max = Math.max(limit.max, 1);
    const pct = Math.min(100, (value / max) * 100);
    const overflow = value > limit.max;

    return (
        <div className="flex flex-col gap-1">
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                    className={cn(
                        "absolute inset-y-0 left-0 rounded-full",
                        overflow
                            ? "bg-amber-500"
                            : tone === "violet"
                              ? "bg-violet-500"
                              : "bg-blue-500",
                    )}
                    style={{ width: `${pct}%` }}
                />
                <span
                    className="absolute inset-y-0 w-px bg-foreground/30"
                    style={{
                        left: `${Math.min(100, (limit.start / max) * 100)}%`,
                    }}
                />
                <span
                    className="absolute inset-y-0 w-px bg-amber-500/70"
                    style={{
                        left: `${Math.min(100, (limit.warn / max) * 100)}%`,
                    }}
                />
            </div>
            <div className="flex items-center justify-between font-mono text-[9px] tracking-wide text-muted-foreground/70">
                <span>
                    start {limit.start} · warn {limit.warn} · max {limit.max}
                </span>
                {overflow && (
                    <span className="text-amber-500">
                        clamps to {limit.max} at apply
                    </span>
                )}
            </div>
        </div>
    );
}
