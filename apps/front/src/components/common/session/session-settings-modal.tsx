"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import {
    Check,
    ChevronLeft,
    ChevronRight,
    FlaskConical,
    PersonStanding,
    Play,
    Users,
} from "lucide-react"

import { Button } from "@pes/ui/components/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@pes/ui/components/dialog"
import {
    Field,
    FieldContent,
    FieldError,
    FieldLabel,
} from "@pes/ui/components/field"
import { Input } from "@pes/ui/components/input"
import { Textarea } from "@pes/ui/components/textarea"
import { cn } from "@pes/ui/lib/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import * as z from "zod"

import { useWebSocket } from "@/hooks/useWebSocket"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { closeSessionSettings } from "@/store/slices/sessionSlice"
import type { Session } from "@/types"

type SessionUnitId = Session["unit_ids"][number]
type SessionSensorId = Session["sensor_ids"][number]

const STEPS = [
    { id: "core", title: "Core", description: "Type & identity" },
    { id: "modules", title: "Modules", description: "Units & sensors" },
    { id: "resume", title: "Resume", description: "Review & start" },
] as const

const SESSION_TYPE_META = [
    {
        value: "testing",
        label: "Testing",
        description: "Development and testings",
        icon: FlaskConical,
    },
    {
        value: "solo_play",
        label: "Solo Play",
        description: "Solo play",
        icon: PersonStanding,
    },
    {
        value: "multiplayer",
        label: "Multiplayer",
        description: "Someone controlling the app",
        icon: Users,
    },
] as const

const UNITS: { id: SessionUnitId; label: string }[] = [
    { id: "UNIT1", label: "Unit 1" },
    { id: "UNIT2", label: "Unit 2" },
    { id: "UNIT3", label: "Unit 3" },
]

const SENSORS: {
    id: SessionSensorId
    label: string
    events: string[]
}[] = [
    { id: "sound", label: "Sound Sensor", events: ["sensor_sound_alarm"] },
    {
        id: "motion1",
        label: "Motion Sensor 1",
        events: ["sensor_position_alarm", "sensor_move_alarm"],
    },
    {
        id: "motion2",
        label: "Motion Sensor 2",
        events: ["sensor_position_alarm", "sensor_move_alarm"],
    },
]

const sessionFormSchema = z.object({
    type: z.enum(["testing", "solo_play", "multiplayer"]),
    name: z.string().min(1, "Name is required").max(64, "Name is too long"),
    description: z.string().max(512, "Description is too long"),
    unitIds: z
        .array(z.enum(["UNIT1", "UNIT2", "UNIT3"]))
        .min(1, "Select at least one unit"),
    sensorIds: z.array(z.enum(["sound", "motion1", "motion2"])),
})

type SessionFormValues = z.infer<typeof sessionFormSchema>

function buildDefaultValues(): SessionFormValues {
    return {
        type: "solo_play",
        name: `Session ${new Date().toLocaleDateString("en-GB")}`,
        description: "",
        unitIds: ["UNIT1", "UNIT2", "UNIT3"],
        sensorIds: [],
    }
}

const SESSION_TYPE_LABELS: Record<Session["type"], string> = {
    testing: "Testing",
    solo_play: "Solo Play",
    multiplayer: "Multiplayer",
}

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

export function SessionSettingsModal() {
    const dispatch = useAppDispatch()
    const { sendCommand } = useWebSocket()
    const open = useAppSelector((state) => state.session.settingsModalOpen)

    const [step, setStep] = useState(0)
    const [submitting, setSubmitting] = useState(false)
    // Timestamp of the last step transition: submits racing a transition
    // (e.g. the second click of a double-click landing on "Start session")
    // are ignored for a short grace period.
    const stepChangedAtRef = useRef(0)
    const [startReady, setStartReady] = useState(false)

    const form = useForm<SessionFormValues>({
        resolver: zodResolver(sessionFormSchema),
        defaultValues: buildDefaultValues(),
    })

    // Keep form + step state when the modal closes and reopens

    // Briefly disable the Start button right after entering the resume step
    useEffect(() => {
        if (step === STEPS.length - 1) {
            setStartReady(false)
            const timeout = setTimeout(() => setStartReady(true), 500)
            return () => clearTimeout(timeout)
        }
    }, [step])

    const handleOpenChange = (value: boolean) => {
        if (!value) {
            dispatch(closeSessionSettings())
        }
    }

    const toggleUnit = (unitId: SessionUnitId) => {
        const current = form.getValues("unitIds")
        const next = current.includes(unitId)
            ? current.filter((id) => id !== unitId)
            : [...current, unitId]
        form.setValue("unitIds", next, { shouldValidate: true })
    }

    const toggleSensor = (sensorId: SessionSensorId) => {
        const current = form.getValues("sensorIds")
        const next = current.includes(sensorId)
            ? current.filter((id) => id !== sensorId)
            : [...current, sensorId]
        form.setValue("sensorIds", next, { shouldValidate: true })
    }

    const goNext = async () => {
        const fields = step === 0
            ? (["type", "name"] as const)
            : (["unitIds"] as const)
        if (await form.trigger(fields)) {
            stepChangedAtRef.current = Date.now()
            setStep((s) => Math.min(s + 1, STEPS.length - 1))
        }
    }

    const goBack = () => setStep((s) => Math.max(s - 1, 0))

    const handleReset = () => {
        form.reset(buildDefaultValues())
        setStep(0)
    }

    const isLastStep = step === STEPS.length - 1

    const onSubmit = form.handleSubmit(async (values: SessionFormValues) => {
        // Ignore submits racing a step transition (double-click on "Next")
        if (Date.now() - stepChangedAtRef.current < 500) {
            return
        }
        setSubmitting(true)
        try {
            const result = await sendCommand("session:start", {
                type: values.type,
                name: values.name,
                description: values.description || null,
                unit_ids: values.unitIds,
                sensor_ids: values.sensorIds,
            })
            if (result.status === "ok") {
                toast.success("Session started", {
                    description: `${values.name} (${SESSION_TYPE_LABELS[values.type]})`,
                    position: "bottom-right",
                })
                dispatch(closeSessionSettings())
            } else {
                toast.error("Failed to start session", {
                    description: result.message ?? undefined,
                    position: "bottom-right",
                })
            }
        } catch (err) {
            toast.error("Failed to start session", {
                description: err instanceof Error ? err.message : undefined,
                position: "bottom-right",
            })
        } finally {
            setSubmitting(false)
        }
    })

    // Enter on earlier steps advances the wizard; only the resume step
    // submits, and only through an explicit click on "Start session".
    const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!isLastStep) {
            void goNext()
            return
        }
        const submitter = (event.nativeEvent as SubmitEvent).submitter
        if (!submitter) {
            return
        }
        void onSubmit()
    }

    const unitIds = form.watch("unitIds")
    const sensorIds = form.watch("sensorIds")

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="gap-0 p-0 sm:max-w-2xl lg:max-w-3xl">
                <DialogHeader className="border-b px-5 py-3">
                    <DialogTitle>Session settings</DialogTitle>
                    <DialogDescription>
                        Configure the session lifecycle before starting.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-0 md:grid-cols-[170px_1fr]">
                    {/* Stepper sidebar */}
                    <aside className="flex flex-col gap-1 border-b px-4 py-4 md:border-r md:border-b-0">
                        <p className="font-mono-dm text-xs uppercase tracking-wide text-muted-foreground">
                            Setup progress
                        </p>
                        <div className="mb-3 mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                            <div
                                className="h-full rounded-full bg-primary transition-all duration-300"
                                style={{
                                    width: `${((step + 1) / STEPS.length) * 100}%`,
                                }}
                            />
                        </div>
                        {STEPS.map((s, i) => {
                            const done = i < step
                            const active = i === step
                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    disabled={i > step}
                                    onClick={() => setStep(i)}
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
                                    <span
                                        className={cn(
                                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                                            done
                                                ? "border-primary bg-primary text-primary-foreground"
                                                : active
                                                    ? "border-primary text-primary"
                                                    : "border-border text-muted-foreground"
                                        )}
                                    >
                                        {done ? <Check className="size-3.5" /> : i + 1}
                                    </span>
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
                    </aside>

                    {/* Step content */}
                    <form
                        id="session-settings-form"
                        onSubmit={handleFormSubmit}
                        className="flex min-h-[300px] flex-col"
                    >
                        <div className="flex flex-1 flex-col gap-4 px-5 py-4">
                            {step === 0 && (
                                <>
                                    <Controller
                                        name="type"
                                        control={form.control}
                                        render={({ field }) => (
                                            <Field>
                                                <FieldLabel>Session type</FieldLabel>
                                                <FieldContent>
                                                    <div className="grid gap-2.5 sm:grid-cols-3">
                                                        {SESSION_TYPE_META.map(
                                                            (meta) => {
                                                                const selected =
                                                                    field.value ===
                                                                    meta.value
                                                                return (
                                                                    <button
                                                                        key={meta.value}
                                                                        type="button"
                                                                        onClick={() =>
                                                                            field.onChange(
                                                                                meta.value
                                                                            )
                                                                        }
                                                                        className={cn(
                                                                            "flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors",
                                                                            selected
                                                                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                                                                : "border-border hover:border-primary/50"
                                                                        )}
                                                                    >
                                                                        <meta.icon
                                                                            className={cn(
                                                                                "size-5",
                                                                                selected
                                                                                    ? "text-primary"
                                                                                    : "text-muted-foreground"
                                                                            )}
                                                                        />
                                                                        <span className="text-sm font-medium">
                                                                            {meta.label}
                                                                        </span>
                                                                        <span className="text-xs text-muted-foreground">
                                                                            {
                                                                                meta.description
                                                                            }
                                                                        </span>
                                                                    </button>
                                                                )
                                                            }
                                                        )}
                                                    </div>
                                                </FieldContent>
                                            </Field>
                                        )}
                                    />
                                    <Controller
                                        name="name"
                                        control={form.control}
                                        render={({ field, fieldState }) => (
                                            <Field data-invalid={fieldState.invalid}>
                                                <FieldLabel htmlFor="session-settings-name">
                                                    Name
                                                </FieldLabel>
                                                <FieldContent>
                                                    <Input
                                                        {...field}
                                                        id="session-settings-name"
                                                        aria-invalid={fieldState.invalid}
                                                        autoComplete="off"
                                                    />
                                                    {fieldState.invalid && (
                                                        <FieldError
                                                            errors={[fieldState.error]}
                                                        />
                                                    )}
                                                </FieldContent>
                                            </Field>
                                        )}
                                    />
                                    <Controller
                                        name="description"
                                        control={form.control}
                                        render={({ field, fieldState }) => (
                                            <Field data-invalid={fieldState.invalid}>
                                                <FieldLabel htmlFor="session-settings-description">
                                                    Description
                                                </FieldLabel>
                                                <FieldContent>
                                                    <Textarea
                                                        {...field}
                                                        id="session-settings-description"
                                                        aria-invalid={fieldState.invalid}
                                                        placeholder="What is this session about?"
                                                        rows={2}
                                                    />
                                                    {fieldState.invalid && (
                                                        <FieldError
                                                            errors={[fieldState.error]}
                                                        />
                                                    )}
                                                </FieldContent>
                                            </Field>
                                        )}
                                    />
                                </>
                            )}

                            {step === 1 && (
                                <>
                                    <Field data-invalid={!!form.formState.errors.unitIds}>
                                        <FieldLabel>Active units</FieldLabel>
                                        <FieldContent>
                                            <div className="grid gap-2.5 sm:grid-cols-3">
                                                {UNITS.map((unit) => {
                                                    const selected = unitIds.includes(
                                                        unit.id
                                                    )
                                                    return (
                                                        <button
                                                            key={unit.id}
                                                            type="button"
                                                            onClick={() =>
                                                                toggleUnit(unit.id)
                                                            }
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
                                                                <SelectDot
                                                                    selected={selected}
                                                                />
                                                            </div>
                                                            <span className="text-sm font-medium">
                                                                {unit.label}
                                                            </span>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                            {form.formState.errors.unitIds && (
                                                <FieldError
                                                    errors={[
                                                        form.formState.errors.unitIds,
                                                    ]}
                                                />
                                            )}
                                        </FieldContent>
                                    </Field>

                                    <Field>
                                        <FieldLabel>Active sensors</FieldLabel>
                                        <FieldContent>
                                            <div className="grid gap-2.5 sm:grid-cols-3">
                                                {SENSORS.map((sensor) => {
                                                    const selected = sensorIds.includes(
                                                        sensor.id
                                                    )
                                                    return (
                                                        <button
                                                            key={sensor.id}
                                                            type="button"
                                                            onClick={() =>
                                                                toggleSensor(sensor.id)
                                                            }
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
                                                                <SelectDot
                                                                    selected={selected}
                                                                />
                                                            </div>
                                                            <ul className="flex flex-col gap-1">
                                                                {sensor.events.map(
                                                                    (event) => (
                                                                        <li
                                                                            key={event}
                                                                            className="font-mono-dm text-xs text-muted-foreground"
                                                                        >
                                                                            {event}
                                                                        </li>
                                                                    )
                                                                )}
                                                            </ul>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </FieldContent>
                                    </Field>
                                </>
                            )}

                            {step === 2 && (
                                <div className="flex flex-col gap-3">
                                    <div className="rounded-lg border p-3">
                                        <p className="font-mono-dm text-xs uppercase tracking-wide text-muted-foreground">
                                            Type
                                        </p>
                                        <p className="text-sm font-medium">
                                            {SESSION_TYPE_LABELS[form.getValues("type")]}
                                        </p>
                                    </div>
                                    <div className="rounded-lg border p-3">
                                        <p className="font-mono-dm text-xs uppercase tracking-wide text-muted-foreground">
                                            Name
                                        </p>
                                        <p className="text-sm font-medium">
                                            {form.getValues("name")}
                                        </p>
                                        {form.getValues("description") && (
                                            <>
                                                <p className="mt-2 font-mono-dm text-xs uppercase tracking-wide text-muted-foreground">
                                                    Description
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    {form.getValues("description")}
                                                </p>
                                            </>
                                        )}
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="rounded-lg border p-3">
                                            <p className="font-mono-dm text-xs uppercase tracking-wide text-muted-foreground">
                                                Units
                                            </p>
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
                            )}
                        </div>

                        {/* Footer navigation */}
                        <div className="flex items-center justify-between border-t px-5 py-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={goBack}
                                disabled={step === 0 || submitting}
                            >
                                <ChevronLeft className="size-4" />
                                Back
                            </Button>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={handleReset}
                                    disabled={submitting}
                                >
                                    Reset
                                </Button>
                                {!isLastStep ? (
                                    <Button type="button" onClick={goNext}>
                                        Next
                                        <ChevronRight className="size-4" />
                                    </Button>
                                ) : (
                                    <Button
                                        type="submit"
                                        form="session-settings-form"
                                        disabled={submitting || !startReady}
                                    >
                                        {submitting ? (
                                            <>
                                                <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                                Starting...
                                            </>
                                        ) : (
                                            <>
                                                <Play className="size-4" />
                                                Start session
                                            </>
                                        )}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </form>
                </div>
            </DialogContent>
        </Dialog>
    )
}
