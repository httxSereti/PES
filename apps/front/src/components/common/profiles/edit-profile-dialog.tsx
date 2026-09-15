import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@pes/ui/components/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@pes/ui/components/dialog";
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from "@pes/ui/components/field";
import { Input } from "@pes/ui/components/input";
import { Switch } from "@pes/ui/components/switch";
import { Textarea } from "@pes/ui/components/textarea";

import { useWebSocket } from "@/hooks/useWebSocket";
import type { ProfileSummary } from "@/types";

const NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;

type EditProfileDialogProps = {
    profile: ProfileSummary;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export function EditProfileDialog({
    profile,
    open,
    onOpenChange,
}: EditProfileDialogProps) {
    const { sendCommand } = useWebSocket();
    const [name, setName] = useState(profile.name);
    const [description, setDescription] = useState(profile.description ?? "");
    const [fromCurrent, setFromCurrent] = useState(false);
    const [includeRamps, setIncludeRamps] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            setName(profile.name);
            setDescription(profile.description ?? "");
            setFromCurrent(false);
            setIncludeRamps(true);
            setError(null);
        }
    }, [open, profile]);

    const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmedName = name.trim();
        if (!NAME_RE.test(trimmedName)) {
            setError("1-32 characters: letters, digits, '-' or '_'");
            return;
        }
        setError(null);
        setSubmitting(true);
        try {
            const result = await sendCommand("profiles:update", {
                name: profile.name,
                description: description.trim(),
                rename_to: trimmedName !== profile.name ? trimmedName : null,
                from_current: fromCurrent,
                include_ramps: includeRamps,
            });

            if (result.status === "ok") {
                toast.success(`Profile "${trimmedName}" updated`, {
                    position: "bottom-right",
                });
                onOpenChange(false);
                return;
            }

            toast.error("Failed to update profile", {
                description: result.message ?? undefined,
                position: "bottom-right",
            });
        } catch (err) {
            toast.error("Failed to update profile", {
                description: err instanceof Error ? err.message : undefined,
                position: "bottom-right",
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{`Edit "${profile.name}"`}</DialogTitle>
                    <DialogDescription>
                        Rename it, change its description, or replace its content
                        with the current unit settings.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="flex flex-col gap-4">
                    <FieldGroup>
                        <Field data-invalid={!!error}>
                            <FieldLabel>Name</FieldLabel>
                            <Input
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                autoComplete="off"
                                aria-invalid={!!error}
                            />
                            {error && <FieldError errors={[{ message: error }]} />}
                        </Field>

                        <Field>
                            <FieldLabel>Description</FieldLabel>
                            <Textarea
                                rows={2}
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                placeholder="What this profile feels like..."
                            />
                        </Field>

                        <Field orientation="horizontal">
                            <Switch
                                checked={fromCurrent}
                                onCheckedChange={setFromCurrent}
                            />
                            <FieldContent>
                                <FieldLabel>Replace with current settings</FieldLabel>
                                <FieldDescription>
                                    Overwrites the stored unit settings with the live
                                    values (levels, usages, mode...).
                                </FieldDescription>
                            </FieldContent>
                        </Field>

                        {fromCurrent && (
                            <Field orientation="horizontal">
                                <Switch
                                    checked={includeRamps}
                                    onCheckedChange={setIncludeRamps}
                                />
                                <FieldContent>
                                    <FieldLabel>Include active ramps</FieldLabel>
                                    <FieldDescription>
                                        Save the ramps currently running as well.
                                    </FieldDescription>
                                </FieldContent>
                            </Field>
                        )}
                    </FieldGroup>

                    <Button type="submit" className="w-full" disabled={submitting}>
                        {submitting ? "Saving..." : "Save changes"}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
