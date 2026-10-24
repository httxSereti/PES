import { useCooldownTimer } from "@/hooks/useCooldownTimer";
import { cn } from "@pes/ui/lib/utils";
import type { FC } from "react";

type CooldownIndicatorProps = {
    label: string;
    counter: number;
    totalSeconds: number;
    triggerSeconds: number;
    alarmCount: number;
    aboveThreshold: boolean;
    enabled: boolean;
    online: boolean;
    alarmEnabled: boolean;
    compact?: boolean;
};

type IndicatorState = {
    status: string;
    detail: string;
    value: string;
    containerClassName: string;
    valueClassName: string;
    barColor: string;
    progress: number;
};

function clampPercent(value: number): number {
    return Math.min(100, Math.max(0, value));
}

export const CooldownIndicator: FC<CooldownIndicatorProps> = ({
    label,
    counter,
    totalSeconds,
    triggerSeconds,
    alarmCount,
    aboveThreshold,
    enabled,
    online,
    alarmEnabled,
    compact = false,
}) => {
    const cooldownSeconds =
        Number.isFinite(counter) && counter < 0
            ? Math.ceil(Math.abs(counter))
            : 0;
    const total = Number.isFinite(totalSeconds)
        ? Math.max(1, Math.ceil(totalSeconds))
        : 1;
    const triggerTotal = Number.isFinite(triggerSeconds)
        ? Math.max(0, Math.ceil(triggerSeconds))
        : 0;
    const accumulated = Number.isFinite(counter) && counter > 0 ? counter : 0;
    const remainingTrigger = Math.max(0, triggerTotal - accumulated);
    const available = enabled && online && alarmEnabled;
    const hasCooldown = available && alarmCount > 0 && cooldownSeconds > 0;
    const remaining = useCooldownTimer(hasCooldown ? cooldownSeconds : 0);
    const activeCooldown = hasCooldown && remaining > 0;
    const cooldownProgress = activeCooldown
        ? clampPercent((remaining / total) * 100)
        : 0;
    const triggerProgress =
        triggerTotal > 0
            ? clampPercent((accumulated / triggerTotal) * 100)
            : 100;

    let state: IndicatorState;

    if (!enabled) {
        state = {
            status: "Disabled",
            detail: "Cannot trigger",
            value: "—",
            containerClassName: "border-zinc-500/20 bg-zinc-500/5",
            valueClassName: "text-zinc-500 dark:text-zinc-400",
            barColor: "#71717A",
            progress: 0,
        };
    } else if (!online) {
        state = {
            status: "Offline",
            detail: "Cannot trigger",
            value: "—",
            containerClassName: "border-red-500/20 bg-red-500/5",
            valueClassName: "text-red-500 dark:text-red-400",
            barColor: "#EF4444",
            progress: 0,
        };
    } else if (!alarmEnabled) {
        state = {
            status: "Alarm off",
            detail: "Cannot trigger",
            value: "—",
            containerClassName: "border-border/60 bg-muted/20",
            valueClassName: "text-muted-foreground/60",
            barColor: "#71717A",
            progress: 0,
        };
    } else if (activeCooldown) {
        state = {
            status: "Cooldown",
            detail: "Cannot trigger",
            value: `${remaining}s`,
            containerClassName: "border-sky-500/20 bg-sky-500/5",
            valueClassName: "text-sky-500 dark:text-sky-400",
            barColor: "#38BDF8",
            progress: cooldownProgress,
        };
    } else if (remainingTrigger > 0) {
        state = aboveThreshold
            ? {
                  status: "Charging",
                  detail: "Cannot trigger yet",
                  value: `${remainingTrigger}s`,
                  containerClassName: "border-violet-500/20 bg-violet-500/5",
                  valueClassName: "text-violet-500 dark:text-violet-400",
                  barColor: "#8E51FF",
                  progress: triggerProgress,
              }
            : {
                  status: "Waiting",
                  detail: "Below trigger",
                  value: `${remainingTrigger}s`,
                  containerClassName: "border-border/60 bg-muted/20",
                  valueClassName: "text-muted-foreground/60",
                  barColor: "#71717A",
                  progress: triggerProgress,
              };
    } else {
        state = {
            status: "Ready",
            detail: "Can trigger",
            value: "READY",
            containerClassName: "border-emerald-500/20 bg-emerald-500/5",
            valueClassName: "text-emerald-500 dark:text-emerald-400",
            barColor: "#10B981",
            progress: 100,
        };
    }

    return (
        <div
            className={cn(
                "rounded-lg border",
                compact ? "px-2 py-1.5" : "px-2.5 py-2",
                state.containerClassName,
            )}
        >
            <div className="flex items-center justify-between gap-2">
                <span
                    className={cn(
                        "min-w-0 truncate font-mono tracking-[0.14em] text-muted-foreground/50 uppercase",
                        compact ? "text-[7px]" : "text-[8px]",
                    )}
                >
                    {label}
                </span>
                <span
                    className={cn(
                        "shrink-0 font-mono font-medium tabular-nums",
                        compact ? "text-[9px]" : "text-[11px]",
                        state.valueClassName,
                    )}
                >
                    {state.value}
                </span>
            </div>

            <div
                className={cn(
                    "w-full overflow-hidden rounded-full bg-foreground/10",
                    compact ? "mt-1 h-0.5" : "mt-1.5 h-1",
                )}
            >
                <div
                    className="h-full rounded-full transition-all duration-1000 ease-linear"
                    style={{
                        width: `${state.progress}%`,
                        backgroundColor: state.barColor,
                    }}
                />
            </div>

            <div
                className={cn(
                    "flex items-center justify-between gap-2 font-mono text-muted-foreground/40",
                    compact ? "mt-1 text-[6.5px]" : "mt-1 text-[7px]",
                )}
            >
                <span className="truncate tracking-[0.1em] uppercase">
                    {state.status}
                </span>
                <span className="shrink-0">{state.detail}</span>
            </div>
        </div>
    );
};
