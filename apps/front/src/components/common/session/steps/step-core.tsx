"use client"

import { Controller, type UseFormReturn } from "react-hook-form"

import {
    Field,
    FieldContent,
    FieldError,
    FieldLabel,
} from "@pes/ui/components/field"
import { Input } from "@pes/ui/components/input"
import { Textarea } from "@pes/ui/components/textarea"
import { cn } from "@pes/ui/lib/utils"

import { SESSION_TYPE_META } from "../session.constants"
import type { SessionFormValues } from "../session-form"

interface StepCoreProps {
    form: UseFormReturn<SessionFormValues>
}

export function StepCore({ form }: StepCoreProps) {
    return (
        <>
            <Controller
                name="type"
                control={form.control}
                render={({ field }) => (
                    <Field>
                        <FieldLabel>Session type</FieldLabel>
                        <FieldContent>
                            <div className="grid gap-2.5 sm:grid-cols-3">
                                {SESSION_TYPE_META.map((meta) => {
                                    const selected = field.value === meta.value
                                    return (
                                        <button
                                            key={meta.value}
                                            type="button"
                                            onClick={() =>
                                                field.onChange(meta.value)
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
                                                {meta.description}
                                            </span>
                                        </button>
                                    )
                                })}
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
                                <FieldError errors={[fieldState.error]} />
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
                                <FieldError errors={[fieldState.error]} />
                            )}
                        </FieldContent>
                    </Field>
                )}
            />
        </>
    )
}
