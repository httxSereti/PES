"use client"

import { Check } from "lucide-react"

import { cn } from "@pes/ui/lib/utils"

import { STEPS } from "./session.constants"

interface SessionStepperProps {
    step: number
    onStepClick: (step: number) => void
}

export function SessionStepper({ step, onStepClick }: SessionStepperProps) {
    const renderCircle = (i: number) => {
        const done = i < step
        const active = i === step
        return (
            <span
                className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                    done
                        ? "border-primary bg-primary text-primary-foreground"
                        : active
                            ? "border-purple-500 text-primary"
                            : "border-border text-muted-foreground"
                )}
            >
                {done ? <Check className="size-3.5" /> : i + 1}
            </span>
        )
    }

    return (
        <aside className="flex flex-col gap-1 border-b px-2 py-4 md:border-r md:border-b-0">
            <p className="font-mono-dm text-xs uppercase tracking-wide text-muted-foreground">
                Setup ({step + 1} of {STEPS.length})
            </p>
            <div className="mb-3 mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                    className="h-full rounded-full bg-purple-500 transition-all duration-300"
                    style={{
                        width: `${((step + 1) / STEPS.length) * 100}%`,
                    }}
                />
            </div>

            {/* Mobile: compact horizontal steps */}
            <div className="flex justify-between items-center gap-3 md:hidden">
                <div>
                    <span className="min-w-0 truncate text-sm font-medium">
                        {STEPS[step]!.title}
                    </span>
                </div>
                <div className="flex gap-2">
                    {STEPS.map((s, i) => (
                        <button
                            key={s.id}
                            type="button"
                            disabled={i > step}
                            onClick={() => onStepClick(i)}
                            aria-current={i === step ? "step" : undefined}
                            aria-label={`Step ${i + 1}: ${s.title}`}
                            className={cn(
                                "flex items-center rounded-full transition-opacity",
                                i <= step
                                    ? "cursor-pointer hover:opacity-80"
                                    : "cursor-not-allowed opacity-50"
                            )}
                        >
                            {renderCircle(i)}
                        </button>
                    ))}

                </div>

            </div>

            {/* Desktop: vertical steps */}
            <div className="hidden flex-col gap-1 md:flex">
                {STEPS.map((s, i) => {
                    const active = i === step
                    return (
                        <button
                            key={s.id}
                            type="button"
                            disabled={i > step}
                            onClick={() => onStepClick(i)}
                            className={cn(
                                "flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                                active
                                    ? "border-primary/30 bg-primary/5"
                                    : "border-transparent",
                                i <= step
                                    ? "cursor-pointer hover:bg-muted"
                                    : "cursor-not-allowed opacity-50"
                            )}
                        >
                            {renderCircle(i)}
                            <span className="flex flex-col">
                                <span className="text-sm font-medium">
                                    {s.title}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {s.description}
                                </span>
                            </span>
                        </button>
                    )
                })}
            </div>
        </aside>
    )
}