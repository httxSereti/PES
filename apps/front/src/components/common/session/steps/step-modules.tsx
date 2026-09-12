"use client"

import { Field, FieldContent, FieldLabel } from "@pes/ui/components/field"
import { cn } from "@pes/ui/lib/utils"

import { SENSORS, UNITS } from "../session.constants"
import type { SessionSensorId, SessionUnitId } from "../session-form"

function UnitServerIcon({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <rect width="20" height="6" x="2" y="2" rx="1.5" />
            <rect width="20" height="6" x="2" y="9.5" rx="1.5" />
            <rect width="20" height="6" x="2" y="17" rx="1.5" />
            <line x1="6" x2="6.01" y1="5" y2="5" />
            <line x1="6" x2="6.01" y1="12.5" y2="12.5" />
            <line x1="6" x2="6.01" y1="20" y2="20" />
        </svg>
    )
}

function SelectDot({ selected }: { selected: boolean }) {
    return (
        <span
            className={cn(
                "h-3 w-3 rounded-full transition-colors",
                selected ? "bg-green-500" : "bg-red-500"
            )}
        />
    )
}

interface StepModulesProps {
    unitIds: SessionUnitId[]
    sensorIds: SessionSensorId[]
    toggleUnit: (unitId: SessionUnitId) => void
    toggleSensor: (sensorId: SessionSensorId) => void
}

export function StepModules({
    unitIds,
    sensorIds,
    toggleUnit,
    toggleSensor,
}: StepModulesProps) {
    return (
        <>
            <Field>
                <FieldLabel>Active units</FieldLabel>
                <FieldContent>
                    <div className="grid gap-2.5 sm:grid-cols-3">
                        {UNITS.map((unit) => {
                            const selected = unitIds.includes(unit.id)
                            return (
                                <button
                                    key={unit.id}
                                    type="button"
                                    onClick={() => toggleUnit(unit.id)}
                                    className={cn(
                                        "flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-colors",
                                        selected
                                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                                            : "border-border hover:border-primary/50"
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <UnitServerIcon
                                            className={cn(
                                                "size-7",
                                                selected
                                                    ? "text-primary"
                                                    : "text-muted-foreground"
                                            )}
                                        />
                                        <SelectDot selected={selected} />
                                    </div>
                                    <span className="text-sm font-medium">
                                        {unit.label}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </FieldContent>
            </Field>

            <Field>
                <FieldLabel>Active sensors</FieldLabel>
                <FieldContent>
                    <div className="grid gap-2.5 sm:grid-cols-3">
                        {SENSORS.map((sensor) => {
                            const selected = sensorIds.includes(sensor.id)
                            return (
                                <button
                                    key={sensor.id}
                                    type="button"
                                    onClick={() => toggleSensor(sensor.id)}
                                    className={cn(
                                        "flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors",
                                        selected
                                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                                            : "border-border hover:border-primary/50"
                                    )}
                                >
                                    <div className="flex w-full items-center justify-between">
                                        <span className="text-sm font-medium">
                                            {sensor.label}
                                        </span>
                                        <SelectDot selected={selected} />
                                    </div>
                                    <ul className="flex flex-col gap-1">
                                        {sensor.events.map((event) => (
                                            <li
                                                key={event}
                                                className="font-mono-dm text-xs text-muted-foreground"
                                            >
                                                {event}
                                            </li>
                                        ))}
                                    </ul>
                                </button>
                            )
                        })}
                    </div>
                </FieldContent>
            </Field>
        </>
    )
}
