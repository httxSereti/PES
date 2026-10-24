"use client"

import { AudioLines } from "lucide-react"

import { cn } from "@pes/ui/lib/utils"

import { STEPS } from "./session.constants"

interface SessionStepRailProps {
    step: number
    onStepClick: (step: number) => void
    className?: string
}

export function SessionStepRail({
    step,
    onStepClick,
    className,
}: SessionStepRailProps) {
    return (
        <aside
            className={cn(
                "flex w-[72px] shrink-0 flex-col items-center border-r bg-black/[0.18] py-4",
                className
            )}
        >
            <div className="accent-tile flex size-8 items-center justify-center rounded-[10px]">
                <AudioLines className="accent-tile-icon size-4" />
            </div>
            <span className="font-mono-dm mt-3 text-[8px] uppercase tracking-[0.18em] text-muted-foreground/50">
                Setup
            </span>

            <nav
                className="mt-3 flex flex-col gap-2"
                aria-label="Session setup steps"
            >
                {STEPS.map((item, index) => {
                    const Icon = item.icon
                    const active = index === step
                    const done = index < step
                    const locked = index > step

                    return (
                        <button
                            key={item.id}
                            type="button"
                            disabled={locked}
                            onClick={() => onStepClick(index)}
                            aria-current={active ? "step" : undefined}
                            aria-label={`Step ${index + 1}: ${item.title}`}
                            title={`${item.title} — ${item.description}`}
                            className={cn(
                                "flex size-11 flex-col items-center justify-center gap-1 rounded-[10px] border transition-colors",
                                active &&
                                    "border-violet-500 bg-violet-500 text-white shadow-sm shadow-violet-500/25",
                                done &&
                                    "border-border/70 bg-muted/30 text-violet-500 hover:bg-muted/60 dark:text-violet-400",
                                locked &&
                                    "cursor-not-allowed border-transparent text-muted-foreground/40"
                            )}
                        >
                            <Icon className="size-4" />
                            <span className="font-mono-dm text-[8px] tracking-[0.12em]">
                                {String(index + 1).padStart(2, "0")}
                            </span>
                        </button>
                    )
                })}
            </nav>

            <div className="mt-auto flex flex-col items-center gap-1">
                <span className="font-mono-dm text-[9px] tabular-nums text-muted-foreground/50">
                    {step + 1}/{STEPS.length}
                </span>
                <span className="h-8 w-px bg-border/60" />
            </div>
        </aside>
    )
}

interface SessionMobileStepsProps {
    step: number
    onStepClick: (step: number) => void
    className?: string
}

export function SessionMobileSteps({
    step,
    onStepClick,
    className,
}: SessionMobileStepsProps) {
    return (
        <nav
            className={cn(
                "mb-4 flex min-w-0 items-center gap-1.5 lg:hidden",
                className
            )}
            aria-label="Session setup steps"
        >
            {STEPS.map((item, index) => {
                const Icon = item.icon
                const active = index === step
                const done = index < step
                const locked = index > step

                return (
                    <button
                        key={item.id}
                        type="button"
                        disabled={locked}
                        onClick={() => onStepClick(index)}
                        aria-current={active ? "step" : undefined}
                        aria-label={`Step ${index + 1}: ${item.title}`}
                        className={cn(
                            "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[10px] transition-colors",
                            active &&
                                "border-violet-500/60 bg-violet-500/10 text-foreground",
                            done &&
                                "border-border/70 bg-muted/30 text-violet-500 dark:text-violet-400",
                            locked &&
                                "cursor-not-allowed border-border/40 text-muted-foreground/35"
                        )}
                    >
                        <Icon className="size-3.5 shrink-0" />
                        <span className="hidden truncate sm:inline">
                            {item.title}
                        </span>
                        <span className="font-mono-dm text-[8px] opacity-60">
                            {index + 1}
                        </span>
                    </button>
                )
            })}
        </nav>
    )
}
