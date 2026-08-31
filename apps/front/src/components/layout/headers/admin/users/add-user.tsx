import { Button } from "@pes/ui/components/button";
import { FieldGroup, Field, FieldDescription, FieldError, FieldLabel, FieldContent } from "@pes/ui/components/field";
import { Input } from "@pes/ui/components/input";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from "@pes/ui/components/dialog";
import { Check, Copy, Link, PlusCircle, UserPlus } from "lucide-react";
import { useState, type FC } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import * as z from "zod"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@pes/ui/components/select";
import { Separator } from "@pes/ui/components/separator";
import { useAppSelector } from "@/store/hooks";
import { Role } from "@/types";

const API_URL = import.meta.env.VITE_API_URL;

// Invitable roles (HOST is never assignable from the UI)
const availableRoles = [
    { label: "Guest", value: Role.GUEST },
    { label: "User", value: Role.USER },
    { label: "Operator", value: Role.OPERATOR },
    { label: "Trusted", value: Role.TRUSTED },
    { label: "Admin", value: Role.ADMIN },
] as const

const addUserSchema = z.object({
    display_name: z
        .string()
        .min(3, "Display name must be at least 5 characters.")
        .max(32, "Display name must be at most 32 characters."),
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
        role: data.role,
        display_name: data.display_name,
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


export const AddUser: FC = () => {
    const token = useAppSelector((state) => state.auth.token);

    const [open, setOpen] = useState(false);
    const [magicLink, setMagicLink] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const [apiError, setApiError] = useState<string | null>(null);

    const form = useForm<z.infer<typeof addUserSchema>>({
        resolver: zodResolver(addUserSchema),
        defaultValues: {
            display_name: "",
            role: "",
        },
    })

    const isSubmitting = form.formState.isSubmitting;

    async function onSubmit(values: AddUserFormValues) {
        setApiError(null);
        if (token) {
            try {
                const result = await addUser(values, token);
                setMagicLink(result.magic_link);

                toast.success(`User '${values.display_name}' added!`, {
                    description: `Role: ${values.role}`,
                    position: "bottom-right",
                })
            } catch (err) {
                setApiError(err instanceof Error ? err.message : "An error has occured");
            }
        }
    }

    function handleCopy() {
        if (!magicLink) return;
        navigator.clipboard.writeText(magicLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    function handleOpenChange(value: boolean) {
        setOpen(value);
        if (!value) {
            setTimeout(() => {
                form.reset();
                setMagicLink(null);
                setCopied(false);
            }, 200);
        }
    }


    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline">
                    <PlusCircle />Invite someone
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Invite someone</DialogTitle>
                    <DialogDescription>
                        A magic link will be generated, the user will just have to open it and enjoy
                    </DialogDescription>
                </DialogHeader>
                <Separator />
                {!magicLink ? (
                    <form id="form-add-user" onSubmit={form.handleSubmit(onSubmit)}>
                        <FieldGroup>
                            <Controller
                                name="display_name"
                                control={form.control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor="form-add-user-display_name">
                                            Display Name
                                        </FieldLabel>
                                        <FieldDescription>
                                            Display name of the user
                                        </FieldDescription>
                                        <Input
                                            {...field}
                                            id="form-add-user-display_name"
                                            aria-invalid={fieldState.invalid}
                                            placeholder="Sereti"
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
                                        orientation="responsive"
                                        data-invalid={fieldState.invalid}
                                    >
                                        <FieldContent>
                                            <FieldLabel htmlFor="form-add-user-select-role">
                                                Role
                                            </FieldLabel>
                                            <FieldDescription>
                                                Select the role you want assign
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
                                                id="form-add-user-select-role"
                                                aria-invalid={fieldState.invalid}
                                                className="min-w-[120px]"
                                            >
                                                <SelectValue placeholder="Select" />
                                            </SelectTrigger>
                                            <SelectContent position="item-aligned">
                                                {availableRoles.map((role) => (
                                                    <SelectItem key={role.value} value={role.value}>
                                                        {role.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </Field>
                                )}
                            />
                            {apiError && (
                                <p className="text-sm text-destructive">{apiError}</p>
                            )}
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
                            <Button type="submit" form="form-add-user" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <>
                                        <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <UserPlus className="mr-2 h-3.5 w-3.5" />
                                        Generate link
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                ) : (
                    <div className="space-y-4 py-1">
                        <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                <Link className="h-3 w-3" />
                                Invitation link
                            </div>
                            <p className="break-all rounded-md bg-background border px-3 py-2 font-mono text-xs text-foreground leading-relaxed select-all">
                                {magicLink}
                            </p>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                            This link will expire at restart.
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                                Close
                            </Button>
                            <Button onClick={handleCopy} variant={copied ? "secondary" : "default"}>
                                {copied ? (
                                    <>
                                        <Check className="mr-2 h-3.5 w-3.5 text-emerald-500" />
                                        Copied !
                                    </>
                                ) : (
                                    <>
                                        <Copy className="mr-2 h-3.5 w-3.5" />
                                        Copy link
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}