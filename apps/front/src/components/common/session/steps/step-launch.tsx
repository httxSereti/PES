"use client"

import type { ReactNode } from "react"
import type { UseFormReturn } from "react-hook-form"

import { cn } from "@pes/ui/lib/utils"

import type { IntegrationCatalogEntry } from "@/types"

import {
    SESSION_TYPE_LABELS,
    SESSION_TYPE_META,
    SENSORS,
    UNITS,
} from "../session.constants"
import type {
    SessionFormValues,
    SessionSensorId,
    SessionUnitId,
} from "../session-form"

interface StepLaunchProps {
    form: UseFormReturn<SessionFormValues>
    unitIds: SessionUnitId[]
    sensorIds: SessionSensorId[]
    selectedIntegrations: IntegrationCatalogEntry[]
    eventCount: number
}

function SummaryCard({
    title,
    caption,
    children,
    className,
}: {
    title: string
    caption: string
    children: ReactNode
    className?: string
}) {
    return (
        <div
            className={cn(
                "flex flex-col gap-2 rounded-xl border bg-card/40 px-3 py-2.5",
                className
            )}
        >
            <div className="flex flex-col gap-0.5">
                <span className="font-mono-dm text-[8px] uppercase tracking-[0.16em] text-muted-foreground/50">
                    {title}
                </span>
                <span className="text-[9.5px] text-muted-foreground/60">
                    {caption}
                </span>
            </div>
            {children}
        </div>
    )
}

export function StepLaunch({
    form,
    unitIds,
    sensorIds,
    selectedIntegrations,
    eventCount,
}: StepLaunchProps) {
    const [type, name, description] = form.watch([
        "type",
        "name",
        "description",
    ])
    const typeMeta = SESSION_TYPE_META.find((meta) => meta.value === type)
    const TypeIcon = typeMeta?.icon
    const units = UNITS.filter((unit) => unitIds.includes(unit.id))
    const sensors = SENSORS.filter((sensor) => sensorIds.includes(sensor.id))

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3 rounded-xl border bg-card/50 px-3.5 py-3">
                <span className="accent-tile flex size-9 shrink-0 items-center justify-center rounded-lg">
                    {TypeIcon ? (
                        <TypeIcon className="accent-tile-icon size-4" />
                    ) : null}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold">
                            {name || "Untitled session"}
                        </span>
                        <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 font-mono-dm text-[8px] uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">
                            {SESSION_TYPE_LABELS[type]}
                        </span>
                    </div>
                    <span className="text-[10.5px] leading-relaxed text-muted-foreground/70">
                        {description ||
                            "No description. Add one in Core if you want the history entry to carry context."}
                    </span>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <SummaryCard
                    title="Units"
                    caption={
                        units.length > 0
                            ? `${units.length} selected`
                            : "No units selected"
                    }
                >
                    <div className="flex flex-wrap gap-1">
                        {units.length > 0 ? (
                            units.map((unit) => (
                                <span
                                    key={unit.id}
                                    className="rounded border border-border/60 bg-background/50 px-1.5 py-0.5 font-mono-dm text-[8.5px] text-muted-foreground"
                                >
                                    {unit.label}
                                </span>
                            ))
                        ) : (
                            <span className="text-[9.5px] text-muted-foreground/50">
                                Session will run without units.
                            </span>
                        )}
                    </div>
                </SummaryCard>

                <SummaryCard
                    title="Sensors"
                    caption={
                        sensors.length > 0
                            ? `${sensors.length} selected`
                            : "No sensors selected"
                    }
                >
                    <div className="flex flex-wrap gap-1">
                        {sensors.length > 0 ? (
                            sensors.map((sensor) => (
                                <span
                                    key={sensor.id}
                                    className="rounded border border-border/60 bg-background/50 px-1.5 py-0.5 font-mono-dm text-[8.5px] text-muted-foreground"
                                >
                                    {sensor.label}
                                </span>
                            ))
                        ) : (
                            <span className="text-[9.5px] text-muted-foreground/50">
                                Core hardware only.
                            </span>
                        )}
                    </div>
                </SummaryCard>

                <SummaryCard
                    title="Services"
                    caption={
                        selectedIntegrations.length > 0
                            ? `${selectedIntegrations.length} selected`
                            : "No external services"
                    }
                >
                    <div className="flex flex-col gap-1">
                        {selectedIntegrations.length > 0 ? (
                            selectedIntegrations.map((entry) => (
                                <div
                                    key={entry.id}
                                    className="flex items-center gap-1.5"
                                >
                                    <span className="size-1.5 rounded-full bg-emerald-500" />
                                    <span className="truncate text-[9.5px] text-muted-foreground">
                                        {entry.name}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <span className="text-[9.5px] text-muted-foreground/50">
                                Only core hardware events can feed rules.
                            </span>
                        )}
                    </div>
                </SummaryCard>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/20 px-3 py-2.5">
                <span className="font-mono-dm text-[8px] uppercase tracking-[0.16em] text-muted-foreground/50">
                    Event scope
                </span>
                <span className="text-[10px] text-muted-foreground/80">
                    {eventCount === 0
                        ? "No service events are armed for this session."
                        : `${eventCount} service events can trigger rules during this session.`}
                </span>
                <span className="ml-auto font-mono-dm text-[8px] text-muted-foreground/40">
                    per session
                </span>
            </div>

            <p className="text-[9.5px] leading-relaxed text-muted-foreground/55">
                Starting the session applies the hardware selection immediately
                and scopes external service events to the integrations enabled
                in step 3. Ending the session restores the previous hardware
                state.
            </p>
        </div>
    )
}
