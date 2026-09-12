"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { ChevronLeft, ChevronRight, Play } from "lucide-react"

import { Button } from "@pes/ui/components/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@pes/ui/components/dialog"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { useWebSocket } from "@/hooks/useWebSocket"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { closeSessionSettings } from "@/store/slices/sessionSlice"

import { SESSION_TYPE_LABELS, STEPS } from "./session.constants"
import {
    buildDefaultValues,
    sessionFormSchema,
    type SessionFormValues,
    type SessionSensorId,
    type SessionUnitId,
} from "./session-form"
import { SessionStepper } from "./session-stepper"
import { StepCore } from "./steps/step-core"
import { StepModules } from "./steps/step-modules"
import { StepResume } from "./steps/step-resume"

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
            <DialogContent showCloseButton={true} className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl lg:max-w-4xl">
                <DialogHeader className="border-b px-5 py-4 pr-10">
                    <DialogTitle>Session settings</DialogTitle>
                    <DialogDescription>
                        Configure the session before starting.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex min-h-0 flex-1 flex-col gap-0 md:grid md:grid-cols-[170px_1fr]">
                    {/* Stepper sidebar */}
                    <SessionStepper step={step} onStepClick={setStep} />

                    {/* Step content */}
                    <form
                        id="session-settings-form"
                        onSubmit={handleFormSubmit}
                        className="flex min-h-0 flex-col overflow-hidden"
                    >
                        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
                            {step === 0 && <StepCore form={form} />}

                            {step === 1 && (
                                <StepModules
                                    form={form}
                                    unitIds={unitIds}
                                    sensorIds={sensorIds}
                                    toggleUnit={toggleUnit}
                                    toggleSensor={toggleSensor}
                                />
                            )}

                            {step === 2 && (
                                <StepResume
                                    form={form}
                                    unitIds={unitIds}
                                    sensorIds={sensorIds}
                                />
                            )}
                        </div>

                        {/* Footer navigation */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3">
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
