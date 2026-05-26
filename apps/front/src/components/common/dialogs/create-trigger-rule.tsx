import { Button } from "@pes/ui/components/button";
import { FieldGroup, Field, FieldDescription, FieldError, FieldLabel, FieldContent } from "@pes/ui/components/field";
import { Input } from "@pes/ui/components/input";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from "@pes/ui/components/dialog";
import { Check, Copy, Hammer, Link, PlusCircle, PlusIcon, PlusSquare, UserPlus } from "lucide-react";
import React, { useState, type FC } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import * as z from "zod"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@pes/ui/components/select";
import { Separator } from "@pes/ui/components/separator";
import { useAppSelector } from "@/store/hooks";
import { ALL_KNOWN_TYPES } from "@/components/common/events/event-groups";

const API_URL = import.meta.env.VITE_API_URL;

const availableRoles = [
    { label: "Guest", value: "guest" },
    { label: "User", value: "user" },
    { label: "Operator", value: "operator" },
    { label: "Trusted", value: "trusted" },
    { label: "Admin", value: "admin" },
] as const

const addUserSchema = z.object({
    name: z
        .string()
        .min(3, "Name must be at least 3 characters.")
        .max(32, "Name must be at most 32 characters."),
    description: z
        .string()
        .min(3, "Description must be at least 3 characters.")
        .max(32, "Description must be at most 32 characters."),
    role: z
        .string()
        .min(1, "Please select a role to assign.")
})

type AddUserFormValues = z.infer<typeof addUserSchema>;

async function addUser(
    data: AddUserFormValues,
    authToken: string
): Promise<{ magic_link: string }> {
    const params = new URLSearchParams({
        name: data.name,
    });

    const response = await fetch(
        `${API_URL}/admin/generateMagicLink?${params}`,
        {
            method: "POST",
            headers: {
                accept: "application/json",
                Authorization: `Bearer ${authToken}`,
            },
        }
    );

    if (!response.ok) {
        throw new Error(`Erreur ${response.status} : ${await response.text()}`);
    }

    return response.json();
}


export const CreateTriggerRule: FC = () => {
    const token = useAppSelector((state) => state.auth.token);

    const [open, setOpen] = useState(false);
    const [apiError, setApiError] = useState<string | null>(null);

    const form = useForm<z.infer<typeof addUserSchema>>({
        resolver: zodResolver(addUserSchema),
        defaultValues: {
            name: "",
            description: "",
            role: "",
        },
    })

    const isSubmitting = form.formState.isSubmitting;

    async function onSubmit(values: AddUserFormValues) {
        setApiError(null);
        if (token) {
            try {
                const result = await addUser(values, token);

                toast.success(`User '${values.name}' added!`, {
                    description: `Role: ${values.role}`,
                    position: "bottom-right",
                })
            } catch (err) {
                setApiError(err instanceof Error ? err.message : "An error has occured");
            }
        }
    }

    function handleOpenChange(value: boolean) {
        setOpen(value);
        if (!value) {
            setTimeout(() => {
                // form.reset();
            }, 200);
        }
    }


    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="ghost" className="rounded-md bg-[#161226] border border-purple-800/40 text-xs text-muted-foreground/90">
                    <PlusIcon />New TriggerRule
                </Button>
            </DialogTrigger>
            <DialogContent className="md:max-w-lg lg:min-w-5xl sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>New Trigger Rule</DialogTitle>
                    <DialogDescription>
                        Trigger Rule apply or more actions when triggered.
                    </DialogDescription>
                </DialogHeader>

                <Separator />

                {apiError && (
                    <p className="text-sm text-destructive">{apiError}</p>
                )}

                <form id="form-create-trigger-rule" onSubmit={form.handleSubmit(onSubmit)}>
                    <FieldGroup>
                        <Controller
                            name="name"
                            control={form.control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel htmlFor="form-create-trigger-rule-name">
                                        Name
                                    </FieldLabel>
                                    <Input
                                        {...field}
                                        id="form-create-trigger-rule-name"
                                        aria-invalid={fieldState.invalid}
                                        placeholder="Sound Sensor alarm"
                                        autoComplete="off"
                                    />
                                    {fieldState.invalid && (
                                        <FieldError errors={[fieldState.error]} />
                                    )}
                                </Field>
                            )}
                        />
                        <Controller
                            name="description"
                            control={form.control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel htmlFor="form-create-trigger-rule-description">
                                        Description
                                    </FieldLabel>
                                    <Input
                                        {...field}
                                        id="form-create-trigger-rule-description"
                                        aria-invalid={fieldState.invalid}
                                        placeholder=""
                                        autoComplete="off"
                                    />
                                    {fieldState.invalid && (
                                        <FieldError errors={[fieldState.error]} />
                                    )}
                                </Field>
                            )}
                        />
                        <Controller
                            name="role"
                            control={form.control}
                            render={({ field, fieldState }) => (
                                <Field
                                    className="flex items-center"
                                    orientation="responsive"
                                    data-invalid={fieldState.invalid}
                                >
                                    <FieldContent>
                                        <FieldLabel htmlFor="form-create-trigger-rule-select-role">
                                            Event
                                        </FieldLabel>
                                        <FieldDescription>
                                            Which event should trigger this trigger rule
                                        </FieldDescription>
                                        {fieldState.invalid && (
                                            <FieldError errors={[fieldState.error]} />
                                        )}
                                    </FieldContent>
                                    <Select
                                        name={field.name}
                                        value={field.value}
                                        onValueChange={field.onChange}
                                    >
                                        <SelectTrigger
                                            id="form-create-trigger-rule-select-role"
                                            aria-invalid={fieldState.invalid}
                                            className="min-w-[120px]"
                                        >
                                            <SelectValue placeholder="Select" />
                                        </SelectTrigger>
                                        <SelectContent position="item-aligned">
                                            {Array.from(ALL_KNOWN_TYPES).map((eventType) => (
                                                <SelectItem key={eventType} value={eventType}>
                                                    {eventType}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </Field>
                            )}
                        />
                    </FieldGroup>
                    <DialogFooter className="mt-6">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => handleOpenChange(false)}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" form="form-create-trigger-rule" disabled={isSubmitting}>
                            {isSubmitting ? (
                                <>
                                    <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    Creating...
                                </>
                            ) : (
                                <>
                                    <PlusSquare className="mr-2 h-3.5 w-3.5" />
                                    Create
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}