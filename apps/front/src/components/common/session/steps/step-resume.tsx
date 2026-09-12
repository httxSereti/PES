"use client"

import type { UseFormReturn } from "react-hook-form"

import { SESSION_TYPE_LABELS } from "../session.constants"
import type {
    SessionFormValues,
    SessionSensorId,
    SessionUnitId,
} from "../session-form"

interface StepResumeProps {
    form: UseFormReturn<SessionFormValues>
    unitIds: SessionUnitId[]
    sensorIds: SessionSensorId[]
}

export function StepResume({ form, unitIds, sensorIds }: StepResumeProps) {
    const [type, name, description] = form.watch([
        "type",
        "name",
        "description",
    ])

    return (
        <div className="flex flex-col gap-3">
            <div className="rounded-lg border p-3">
                <p className="font-mono-dm text-xs uppercase tracking-wide text-muted-foreground">
                    Type
                </p>
                <p className="text-sm font-medium">
                    {SESSION_TYPE_LABELS[type]}
                </p>
            </div>
            <div className="rounded-lg border p-3">
                <p className="font-mono-dm text-xs uppercase tracking-wide text-muted-foreground">
                    Name
                </p>
                <p className="text-sm font-medium">{name}</p>
                {description && (
                    <>
                        <p className="mt-2 font-mono-dm text-xs uppercase tracking-wide text-muted-foreground">
                            Description
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {description}
                        </p>
                    </>
                )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                    <p className="font-mono-dm text-xs uppercase tracking-wide text-muted-foreground">
                        Units
                    </p>
                    {unitIds.length > 0 ? (
                        <ul className="mt-1 flex flex-wrap gap-1.5">
                            {unitIds.map((id) => (
                                <li
                                    key={id}
                                    className="rounded-full bg-muted px-2 py-0.5 text-xs"
                                >
                                    {id}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="mt-1 text-sm text-muted-foreground">
                            None
                        </p>
                    )}
                </div>
                <div className="rounded-lg border p-3">
                    <p className="font-mono-dm text-xs uppercase tracking-wide text-muted-foreground">
                        Sensors
                    </p>
                    {sensorIds.length > 0 ? (
                        <ul className="mt-1 flex flex-wrap gap-1.5">
                            {sensorIds.map((id) => (
                                <li
                                    key={id}
                                    className="rounded-full bg-muted px-2 py-0.5 text-xs"
                                >
                                    {id}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="mt-1 text-sm text-muted-foreground">
                            None
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}
