"use client"

import { Check, Info, TriangleAlert } from "lucide-react"

import { cn } from "@pes/ui/lib/utils"

import { useAppSelector } from "@/store/hooks"
import { triggerRulesSelectors } from "@/store/slices/triggerRulesSlice"
import type { IntegrationCatalogEntry } from "@/types"

import { STEPS } from "./session.constants"

interface ReadinessValues {
    step: number
    unitIds: string[]
    sensorIds: string[]
    selectedIntegrations: IntegrationCatalogEntry[]
    totalServiceCount: number
}

function useReadiness({
    step,
    unitIds,
    sensorIds,
    selectedIntegrations,
    totalServiceCount,
}: ReadinessValues) {
    const rules = useAppSelector(triggerRulesSelectors.selectAll)
    const activeServices = selectedIntegrations.filter((entry) => entry.enabled)
    const disabledServices = selectedIntegrations.filter(
        (entry) => !entry.enabled
    )
    const eventIds = new Set(
        activeServices.flatMap((entry) =>
            entry.events.filter((event) => event.enabled).map((event) => event.id)
        )
    )
    const armedRules = rules.filter((rule) => {
        if (!rule.enabled) return false
        const eventTypes = rule.event_types.length
            ? rule.event_types
            : [rule.event_type]
        return eventTypes.some((eventType) => eventIds.has(eventType))
    })
    const eventCount = activeServices.reduce(
        (total, entry) =>
            total + entry.events.filter((event) => event.enabled).length,
        0
    )
    // The current step counts as a passed check: on Integrations the three
    // setup checks are satisfied and only the launch review remains.
    const completed = Math.min(step + 1, STEPS.length)
    const percent = Math.round((completed / STEPS.length) * 100)

    return {
        activeServices,
        disabledServices,
        armedRules,
        eventCount,
        completed,
        percent,
        serviceCount: activeServices.length,
        unitCount: unitIds.length,
        sensorCount: sensorIds.length,
        totalServiceCount,
    }
}

function checklistState(index: number, step: number) {
    if (index < step) return "done" as const
    if (index === step) return "active" as const
    return "next" as const
}

interface ReadinessProps extends ReadinessValues {
    className?: string
}

export function SessionReadinessRail({
    className,
    ...values
}: ReadinessProps) {
    const {
        armedRules,
        completed,
        disabledServices,
        eventCount,
        percent,
        sensorCount,
        serviceCount,
        unitCount,
    } = useReadiness(values)
    const radius = 34
    const circumference = 2 * Math.PI * radius

    return (
        <aside
            className={cn(
                "flex w-[296px] shrink-0 flex-col gap-3 overflow-y-auto border-l bg-black/[0.14] p-5",
                className
            )}
            aria-label="Session readiness"
        >
            <div className="flex items-center justify-between gap-2">
                <span className="font-mono-dm text-[8px] uppercase tracking-[0.18em] text-muted-foreground/60">
                    Readiness
                </span>
                <span className="font-mono-dm text-[9px] tabular-nums text-violet-600 dark:text-violet-300">
                    {completed} / {STEPS.length}
                </span>
            </div>

            <div className="flex items-center gap-3.5">
                <div className="relative size-[82px] shrink-0">
                    <svg
                        viewBox="0 0 82 82"
                        className="size-full -rotate-90"
                        aria-hidden="true"
                    >
                        <circle
                            cx="41"
                            cy="41"
                            r={radius}
                            fill="none"
                            strokeWidth="6"
                            className="stroke-muted"
                        />
                        <circle
                            cx="41"
                            cy="41"
                            r={radius}
                            fill="none"
                            strokeWidth="6"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={
                                circumference * (1 - completed / STEPS.length)
                            }
                            className="stroke-violet-500 transition-[stroke-dashoffset] duration-300"
                        />
                    </svg>
                    <span className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-[15px] font-semibold tabular-nums">
                            {percent}%
                        </span>
                        <span className="font-mono-dm text-[7px] uppercase tracking-[0.16em] text-muted-foreground/50">
                            Ready
                        </span>
                    </span>
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[11px] font-semibold">
                        {completed} of {STEPS.length} checks
                    </span>
                    <span className="text-[9.5px] leading-relaxed text-muted-foreground/70">
                        {completed === STEPS.length
                            ? "Everything is set. Start the session."
                            : completed === STEPS.length - 1
                              ? "Hardware and event sources are set. Launch remains."
                              : "Complete the remaining steps before launch."}
                    </span>
                </div>
            </div>

            <div className="flex flex-col">
                {STEPS.map((item, index) => {
                    const state = checklistState(index, values.step)
                    return (
                        <div
                            key={item.id}
                            className="flex h-[30px] items-center gap-2"
                        >
                            <span
                                className={cn(
                                    "flex size-[15px] shrink-0 items-center justify-center rounded-full border",
                                    state === "done" &&
                                        "border-violet-500/50 bg-violet-500/10 text-violet-500 dark:text-violet-400",
                                    state === "active" &&
                                        "border-violet-500 bg-violet-500/10",
                                    state === "next" && "border-border"
                                )}
                            >
                                {state === "done" ? (
                                    <Check className="size-2" />
                                ) : state === "active" ? (
                                    <span className="size-1.5 rounded-full bg-violet-500" />
                                ) : null}
                            </span>
                            <span
                                className={cn(
                                    "min-w-0 flex-1 truncate text-[9.5px]",
                                    state === "active"
                                        ? "text-foreground"
                                        : state === "done"
                                          ? "text-muted-foreground"
                                          : "text-muted-foreground/45"
                                )}
                            >
                                {item.title === "Core"
                                    ? "Core details"
                                    : item.title === "Modules"
                                      ? "Hardware modules"
                                      : item.title === "Integrations"
                                        ? "Event sources"
                                        : "Launch review"}
                            </span>
                            <span
                                className={cn(
                                    "font-mono-dm text-[7px] uppercase tracking-[0.12em]",
                                    state === "active"
                                        ? "text-violet-600 dark:text-violet-300"
                                        : "text-muted-foreground/35"
                                )}
                            >
                                {state === "done"
                                    ? "Done"
                                    : state === "active"
                                      ? "Now"
                                      : "Next"}
                            </span>
                        </div>
                    )
                })}
            </div>

            <div className="h-px w-full bg-border/60" />

            <span className="font-mono-dm text-[8px] uppercase tracking-[0.18em] text-muted-foreground/60">
                In this session
            </span>

            <div className="flex flex-col">
                {[
                    ["Units", unitCount],
                    ["Sensors", sensorCount],
                    ["Services", serviceCount],
                    ["Events armed", eventCount],
                    ["Rules armed", armedRules.length],
                ].map(([label, value]) => (
                    <div
                        key={label}
                        className="flex h-[21px] items-center gap-2"
                    >
                        <span className="text-[9.5px] text-muted-foreground/80">
                            {label}
                        </span>
                        <span className="h-px flex-1 bg-border/40" />
                        <span className="font-mono-dm text-[8.5px] tabular-nums text-foreground/80">
                            {value}
                        </span>
                    </div>
                ))}
            </div>

            {disabledServices.length > 0 ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-2.5 py-2 text-amber-600 dark:text-amber-400">
                    <TriangleAlert className="mt-px size-3 shrink-0" />
                    <span className="text-[9px] leading-relaxed">
                        {disabledServices.map((entry) => entry.name).join(", ")}{" "}
                        {disabledServices.length === 1 ? "is" : "are"} disabled
                        globally. Re-enable {disabledServices.length === 1 ? "it" : "them"} in
                        Integrations to receive events.
                    </span>
                </div>
            ) : (
                <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2 text-muted-foreground/70">
                    <Info className="mt-px size-3 shrink-0" />
                    <span className="text-[9px] leading-relaxed">
                        {values.totalServiceCount === 0
                            ? "No external integrations are registered. Core hardware still runs."
                            : serviceCount === 0
                              ? "Core hardware only. No external service events will reach this session."
                              : "Events from selected services are scoped to this session. Global event toggles still apply."}
                    </span>
                </div>
            )}

            <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-dm text-[8px] uppercase tracking-[0.18em] text-muted-foreground/60">
                        Triggers armed
                    </span>
                    <span className="font-mono-dm text-[8px] tabular-nums text-muted-foreground/40">
                        {armedRules.length}
                    </span>
                </div>
                {armedRules.length === 0 ? (
                    <span className="text-[9px] leading-relaxed text-muted-foreground/45">
                        No enabled rules listen to the selected events yet.
                    </span>
                ) : (
                    armedRules.slice(0, 3).map((rule) => (
                        <div
                            key={rule.id}
                            className="flex h-[21px] items-center gap-2"
                        >
                            <span className="size-1 rounded-full bg-violet-500" />
                            <span className="min-w-0 flex-1 truncate text-[9.5px] text-muted-foreground">
                                {rule.name}
                            </span>
                            <span className="font-mono-dm text-[7.5px] uppercase tracking-wide text-muted-foreground/35">
                                {rule.actions.length} act
                            </span>
                        </div>
                    ))
                )}
                {armedRules.length > 3 && (
                    <span className="font-mono-dm text-[8px] text-muted-foreground/40">
                        +{armedRules.length - 3} more rules
                    </span>
                )}
            </div>

            <div className="mt-auto flex flex-col gap-1.5 rounded-xl border bg-card/50 px-2.5 py-2.5">
                <div className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[10px] font-semibold text-foreground/90">
                        {values.step === STEPS.length - 1
                            ? "Ready to launch"
                            : "Ready for review"}
                    </span>
                </div>
                <span className="text-[8.5px] leading-relaxed text-muted-foreground/60">
                    {values.step === STEPS.length - 1
                        ? "Review the manifest, then start the session."
                        : "Next, confirm the session manifest before launch."}
                </span>
                <div className="mt-0.5 h-[3px] overflow-hidden rounded-full bg-muted">
                    <div
                        className="h-full rounded-full bg-violet-500 transition-[width] duration-300"
                        style={{ width: `${percent}%` }}
                    />
                </div>
            </div>
        </aside>
    )
}

export function SessionReadinessStrip({
    className,
    ...values
}: ReadinessProps) {
    const { completed, eventCount, percent, sensorCount, serviceCount, unitCount } =
        useReadiness(values)

    return (
        <div
            className={cn(
                "mt-4 rounded-xl border bg-muted/20 px-3 py-2.5 lg:hidden",
                className
            )}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="font-mono-dm text-[8px] uppercase tracking-[0.16em] text-muted-foreground/60">
                    Readiness
                </span>
                <span className="font-mono-dm text-[9px] tabular-nums text-violet-600 dark:text-violet-300">
                    {completed}/{STEPS.length} · {percent}%
                </span>
            </div>
            <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-muted">
                <div
                    className="h-full rounded-full bg-violet-500 transition-[width] duration-300"
                    style={{ width: `${percent}%` }}
                />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono-dm text-[8.5px] text-muted-foreground/60">
                <span>{unitCount} units</span>
                <span>{sensorCount} sensors</span>
                <span>{serviceCount} services</span>
                <span>{eventCount} events</span>
            </div>
        </div>
    )
}
