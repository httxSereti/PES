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
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from "@pes/ui/components/field";
import { Input } from "@pes/ui/components/input";

import { useWebSocket } from "@/hooks/useWebSocket";
import type { ProfileSummary } from "@/types";

const NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;

type DuplicateProfileDialogProps = {
    profile: ProfileSummary;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export function DuplicateProfileDialog({
    profile,
    open,
    onOpenChange,
}: DuplicateProfileDialogProps) {
    const { sendCommand } = useWebSocket();
    const [newName, setNewName] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            setNewName(`${profile.name}-copy`.slice(0, 32));
            setError(null);
        }
    }, [open, profile.name]);

    const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const name = newName.trim();
        if (!NAME_RE.test(name)) {
            setError("1-32 characters: letters, digits, '-' or '_'");
            return;
        }
        setError(null);
        setSubmitting(true);
        try {
            const result = await sendCommand("profiles:duplicate", {
                name: profile.name,
                new_name: name,
            });

            if (result.status === "ok") {
                toast.success(`Profile duplicated as "${name}"`, {
                    position: "bottom-right",
                });
                onOpenChange(false);
                return;
            }

            toast.error("Failed to duplicate profile", {
                description: result.message ?? undefined,
                position: "bottom-right",
            });
        } catch (err) {
            toast.error("Failed to duplicate profile", {
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
                    <DialogTitle>{`Duplicate "${profile.name}"`}</DialogTitle>
                    <DialogDescription>
                        Creates an independent copy with its own file.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="flex flex-col gap-4">
                    <FieldGroup>
                        <Field data-invalid={!!error}>
                            <FieldLabel>New name</FieldLabel>
                            <Input
                                value={newName}
                                onChange={(event) => setNewName(event.target.value)}
                                autoComplete="off"
                                aria-invalid={!!error}
                            />
                            <FieldDescription>
                                {"1-32 characters: letters, digits, '-' or '_'."}
                            </FieldDescription>
                            {error && <FieldError errors={[{ message: error }]} />}
                        </Field>
                    </FieldGroup>

                    <Button type="submit" className="w-full" disabled={submitting}>
                        {submitting ? "Duplicating..." : "Duplicate profile"}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
