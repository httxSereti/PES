"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import {
    AudioLines,
    ChevronLeft,
    ChevronRight,
    Play,
    X,
} from "lucide-react"
import { useNavigate } from "react-router"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@pes/ui/components/button"
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@pes/ui/components/dialog"

import { useWebSocket } from "@/hooks/useWebSocket"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { integrationsSelectors } from "@/store/slices/integrationsSlice"
import { closeSessionSettings } from "@/store/slices/sessionSlice"

import { SESSION_TYPE_LABELS, STEP_COPY, STEPS } from "./session.constants"
import {
    buildDefaultValues,
    sessionFormSchema,
    type SessionFormValues,
    type SessionSensorId,
    type SessionUnitId,
} from "./session-form"
import {
    SessionReadinessRail,
    SessionReadinessStrip,
} from "./session-readiness-rail"
import { SessionMobileSteps, SessionStepRail } from "./session-step-rail"
import { StepCore } from "./steps/step-core"
import { StepIntegrations } from "./steps/step-integrations"
import { StepLaunch } from "./steps/step-launch"
import { StepModules } from "./steps/step-modules"

export function SessionSettingsModal() {
    const dispatch = useAppDispatch()
    const navigate = useNavigate()
    const { sendCommand } = useWebSocket()
    const open = useAppSelector((state) => state.session.settingsModalOpen)
    const catalog = useAppSelector(integrationsSelectors.selectAll)

    const externalIntegrations = useMemo(
        () =>
            catalog
                .filter((entry) => entry.kind === "external")
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name)),
        [catalog]
    )
    const enabledIntegrationIds = useMemo(
        () =>
            externalIntegrations
                .filter((entry) => entry.enabled)
                .map((entry) => entry.id),
        [externalIntegrations]
    )

    const [step, setStep] = useState(0)
    const [submitting, setSubmitting] = useState(false)
    const [focusedIntegrationId, setFocusedIntegrationId] = useState<
        string | null
    >(null)
    // Timestamp of the last step transition: submits racing a transition
    // (e.g. the second click of a double-click landing on "Start session")
    // are ignored for a short grace period.
    const stepChangedAtRef = useRef(0)
    const integrationDefaultsInitialized = useRef(false)
    const [startReady, setStartReady] = useState(false)

    const form = useForm<SessionFormValues>({
        resolver: zodResolver(sessionFormSchema),
        defaultValues: buildDefaultValues(),
    })

    // Default to every globally enabled service once the catalog arrives.
    // Reopening the modal keeps the previous selection.
    useEffect(() => {
        if (
            !open ||
            integrationDefaultsInitialized.current ||
            externalIntegrations.length === 0
        ) {
            return
        }
        form.setValue("integrationIds", enabledIntegrationIds, {
            shouldValidate: false,
        })
        integrationDefaultsInitialized.current = true
    }, [open, externalIntegrations, enabledIntegrationIds, form])

    useEffect(() => {
        if (externalIntegrations.length === 0) {
            setFocusedIntegrationId(null)
            return
        }
        setFocusedIntegrationId((current) =>
            current && externalIntegrations.some((entry) => entry.id === current)
                ? current
                : externalIntegrations[0]?.id ?? null
        )
    }, [externalIntegrations])

    // Keep form + step state when the modal closes and reopens

    // Briefly disable the Start button right after entering the launch step
    useEffect(() => {
        if (!open || step !== STEPS.length - 1) {
            return
        }
        setStartReady(false)
        const timeout = setTimeout(() => setStartReady(true), 500)
        return () => clearTimeout(timeout)
    }, [open, step])

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

    const toggleIntegration = (integrationId: string) => {
        const entry = externalIntegrations.find(
            (integration) => integration.id === integrationId
        )
        if (!entry?.enabled) return
        const current = form.getValues("integrationIds")
        const next = current.includes(integrationId)
            ? current.filter((id) => id !== integrationId)
            : [...current, integrationId]
        form.setValue("integrationIds", next, { shouldValidate: true })
        if (!current.includes(integrationId)) {
            setFocusedIntegrationId(integrationId)
        }
    }

    const goNext = async () => {
        const fields =
            step === 0
                ? (["type", "name"] as const)
                : step === 1
                  ? (["unitIds"] as const)
                  : (["integrationIds"] as const)
        if (await form.trigger(fields)) {
            stepChangedAtRef.current = Date.now()
            setStep((current) =>
                Math.min(current + 1, STEPS.length - 1)
            )
        }
    }

    const goBack = () => setStep((current) => Math.max(current - 1, 0))

    const handleReset = () => {
        const defaults = buildDefaultValues(enabledIntegrationIds)
        form.reset(defaults)
        setStep(0)
        integrationDefaultsInitialized.current =
            externalIntegrations.length > 0
        setFocusedIntegrationId(externalIntegrations[0]?.id ?? null)
    }

    const openGlobalSettings = () => {
        dispatch(closeSessionSettings())
        navigate("/app/admin/integrations")
    }

    const isLastStep = step === STEPS.length - 1

    const onSubmit = form.handleSubmit(async (values: SessionFormValues) => {
        // Ignore submits racing a step transition (double-click on "Next")
        if (Date.now() - stepChangedAtRef.current < 500) {
            return
        }
        setSubmitting(true)
        try {
            // Globally disabled services cannot feed a session.
            const integrationIds = values.integrationIds.filter((id) =>
                externalIntegrations.some(
                    (entry) => entry.id === id && entry.enabled
                )
            )
            const result = await sendCommand("session:start", {
                type: values.type,
                name: values.name,
                description: values.description || null,
                unit_ids: values.unitIds,
                sensor_ids: values.sensorIds,
                integration_ids: integrationIds,
            })
            if (result.status === "ok") {
                toast.success("Session started", {
                    description: `${values.name} (${SESSION_TYPE_LABELS[values.type]}) · ${integrationIds.length} service${integrationIds.length === 1 ? "" : "s"}`,
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

    // Enter on earlier steps advances the wizard; only the launch step
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
    const integrationIds = form.watch("integrationIds")
    const selectedIntegrations = useMemo(
        () =>
            externalIntegrations.filter((entry) =>
                integrationIds.includes(entry.id)
            ),
        [externalIntegrations, integrationIds]
    )
    const activeSelectedIntegrations = selectedIntegrations.filter(
        (entry) => entry.enabled
    )
    const activeEventCount = activeSelectedIntegrations.reduce(
        (total, entry) =>
            total + entry.events.filter((event) => event.enabled).length,
        0
    )

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                showCloseButton={false}
                className="grid h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] min-w-0 max-w-[calc(100%-2rem)] grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden rounded-2xl border-border/80 bg-background p-0 sm:max-w-[860px] lg:h-[720px] lg:max-w-[calc(100%-2rem)] xl:max-w-[1120px]"
            >
                <div className="flex h-full min-h-0 min-w-0 flex-col lg:flex-row">
                    <SessionStepRail
                        step={step}
                        onStepClick={setStep}
                        className="hidden lg:flex"
                    />

                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                        <DialogHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/70 px-4 py-3.5 text-left sm:px-6">
                            <div className="flex min-w-0 items-center gap-2.5">
                                <span className="accent-tile flex size-8 shrink-0 items-center justify-center rounded-lg">
                                    <AudioLines className="accent-tile-icon size-4" />
                                </span>
                                <div className="flex min-w-0 flex-col gap-0.5">
                                    <DialogTitle className="truncate text-sm font-semibold leading-none">
                                        Session setup
                                    </DialogTitle>
                                    <DialogDescription className="truncate text-[10.5px] leading-none text-muted-foreground">
                                        Step {step + 1} of {STEPS.length} ·{" "}
                                        {STEPS[step]?.title}
                                    </DialogDescription>
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <kbd className="hidden rounded border border-border/70 bg-muted/30 px-1.5 py-0.5 font-mono-dm text-[8px] text-muted-foreground/60 sm:inline">
                                    ESC
                                </kbd>
                                <DialogClose asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="Close session settings"
                                    >
                                        <X className="size-4" />
                                    </Button>
                                </DialogClose>
                            </div>
                        </DialogHeader>

                        <form
                            id="session-settings-form"
                            onSubmit={handleFormSubmit}
                            className="flex min-h-0 min-w-0 flex-1 flex-col"
                        >
                            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                                <SessionMobileSteps
                                    step={step}
                                    onStepClick={setStep}
                                />

                                <div className="mb-4 flex flex-col gap-1">
                                    <span className="font-mono-dm text-[9px] uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300">
                                        Step{" "}
                                        {String(step + 1).padStart(2, "0")} ·{" "}
                                        {STEPS[step]?.title}
                                    </span>
                                    <h2 className="text-lg font-semibold tracking-tight">
                                        {STEP_COPY[step]?.title}
                                    </h2>
                                    <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                                        {STEP_COPY[step]?.description}
                                    </p>
                                </div>

                                {step === 0 && <StepCore form={form} />}

                                {step === 1 && (
                                    <StepModules
                                        unitIds={unitIds}
                                        sensorIds={sensorIds}
                                        toggleUnit={toggleUnit}
                                        toggleSensor={toggleSensor}
                                    />
                                )}

                                {step === 2 && (
                                    <StepIntegrations
                                        integrations={externalIntegrations}
                                        selectedIds={integrationIds}
                                        focusedId={focusedIntegrationId}
                                        unitCount={unitIds.length}
                                        sensorCount={sensorIds.length}
                                        onToggle={toggleIntegration}
                                        onFocus={setFocusedIntegrationId}
                                        onEditModules={() => setStep(1)}
                                        onOpenSettings={openGlobalSettings}
                                    />
                                )}

                                {step === 3 && (
                                    <StepLaunch
                                        form={form}
                                        unitIds={unitIds}
                                        sensorIds={sensorIds}
                                        selectedIntegrations={
                                            activeSelectedIntegrations
                                        }
                                        eventCount={activeEventCount}
                                    />
                                )}

                                <SessionReadinessStrip
                                    step={step}
                                    unitIds={unitIds}
                                    sensorIds={sensorIds}
                                    selectedIntegrations={selectedIntegrations}
                                    totalServiceCount={externalIntegrations.length}
                                />
                            </div>

                            <footer className="flex min-w-0 items-center justify-between gap-2 border-t border-border/70 px-4 py-3 sm:px-6">
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
                                    <span className="hidden font-mono-dm text-[8.5px] uppercase tracking-[0.12em] text-muted-foreground/50 sm:inline">
                                        Step {step + 1} / {STEPS.length}
                                    </span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={handleReset}
                                        disabled={submitting}
                                        className="hidden sm:inline-flex"
                                    >
                                        Reset
                                    </Button>
                                    {!isLastStep ? (
                                        <Button
                                            type="button"
                                            onClick={goNext}
                                            className="bg-violet-600 text-white hover:bg-violet-500"
                                        >
                                            Next
                                            <ChevronRight className="size-4" />
                                        </Button>
                                    ) : (
                                        <Button
                                            type="submit"
                                            form="session-settings-form"
                                            disabled={submitting || !startReady}
                                            className="bg-violet-600 text-white hover:bg-violet-500"
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
                            </footer>
                        </form>
                    </div>

                    <SessionReadinessRail
                        step={step}
                        unitIds={unitIds}
                        sensorIds={sensorIds}
                        selectedIntegrations={selectedIntegrations}
                        totalServiceCount={externalIntegrations.length}
                        className="hidden lg:flex"
                    />
                </div>
            </DialogContent>
        </Dialog>
    )
}
