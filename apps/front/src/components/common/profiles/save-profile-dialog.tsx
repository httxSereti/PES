import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";

import { Badge } from "@pes/ui/components/badge";
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
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { closeProfileSave, profilesSelectors } from "@/store/slices/profilesSlice";
import { rampsSelectors } from "@/store/slices/rampsSlice";
import { unitsSelectors } from "@/store/slices/unitsSlice";
import { MODE_2B } from "@/types/units.types";

const profileSaveSchema = z.object({
    name: z
        .string()
        .min(1, "Name is required")
        .max(32, "Name must be at most 32 characters")
        .regex(/^[A-Za-z0-9_-]+$/, "Letters, digits, '-' and '_' only"),
    description: z
        .string()
        .max(200, "Description must be at most 200 characters"),
    include_ramps: z.boolean(),
    overwrite: z.boolean(),
});

type FormValues = z.infer<typeof profileSaveSchema>;

const DEFAULT_VALUES: FormValues = {
    name: "",
    description: "",
    include_ramps: true,
    overwrite: false,
};

export function SaveProfileDialog() {
    const dispatch = useAppDispatch();
    const { sendCommand } = useWebSocket();

    const open = useAppSelector((state) => state.profiles.saveDialogOpen);
    const profiles = useAppSelector(profilesSelectors.selectAll);
    const units = useAppSelector(unitsSelectors.selectAll);
    const ramps = useAppSelector(rampsSelectors.selectAll);

    const [submitting, setSubmitting] = useState(false);

    const form = useForm<FormValues>({
        resolver: zodResolver(profileSaveSchema),
        defaultValues: DEFAULT_VALUES,
    });

    const name = form.watch("name");
    const includeRamps = form.watch("include_ramps");
    const overwrite = form.watch("overwrite");

    // Names are case-insensitive on the server filesystem (Windows)
    const existing = profiles.find(
        (profile) => profile.name.toLowerCase() === name.trim().toLowerCase()
    );

    useEffect(() => {
        if (open) {
            form.reset(DEFAULT_VALUES);
        }
    }, [open, form]);

    const onSubmit = form.handleSubmit(async (values) => {
        setSubmitting(true);
        try {
            const result = await sendCommand("profiles:save", {
                name: values.name.trim(),
                description: values.description.trim() || null,
                include_ramps: values.include_ramps,
                overwrite: values.overwrite,
            });

            if (result.status === "ok") {
                toast.success(`Profile "${values.name.trim()}" saved`, {
                    description: "It is now available for trigger rules and the profile list.",
                    position: "bottom-right",
                });
                dispatch(closeProfileSave());
                return;
            }

            toast.error("Failed to save profile", {
                description: result.message ?? undefined,
                position: "bottom-right",
            });
        } catch (error) {
            toast.error("Failed to save profile", {
                description: error instanceof Error ? error.message : undefined,
                position: "bottom-right",
            });
        } finally {
            setSubmitting(false);
        }
    });

    return (
        <Dialog
            open={open}
            onOpenChange={(value) => {
                if (!value) dispatch(closeProfileSave());
            }}
        >
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Save current settings as a profile</DialogTitle>
                    <DialogDescription>
                        Snapshots the levels, usages and settings of every unit so a
                        trigger rule can apply them later.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="flex flex-col gap-4">
                    <FieldGroup>
                        <Field data-invalid={!!form.formState.errors.name}>
                            <FieldLabel>Name</FieldLabel>
                            <Input
                                placeholder="e.g. NightRide or A"
                                autoComplete="off"
                                aria-invalid={!!form.formState.errors.name}
                                {...form.register("name")}
                            />
                            <FieldDescription>
                                {"1-32 characters: letters, digits, '-' or '_'. A single letter works with the Chaster WOF codes."}
                            </FieldDescription>
                            {form.formState.errors.name && (
                                <FieldError errors={[form.formState.errors.name]} />
                            )}
                        </Field>

                        <Field data-invalid={!!form.formState.errors.description}>
                            <FieldLabel>Description</FieldLabel>
                            <Textarea
                                rows={2}
                                placeholder="What this profile feels like..."
                                aria-invalid={!!form.formState.errors.description}
                                {...form.register("description")}
                            />
                            {form.formState.errors.description && (
                                <FieldError errors={[form.formState.errors.description]} />
                            )}
                        </Field>

                        <Field orientation="horizontal">
                            <Switch
                                checked={includeRamps}
                                onCheckedChange={(value) =>
                                    form.setValue("include_ramps", value)
                                }
                            />
                            <FieldContent>
                                <FieldLabel>Include active ramps</FieldLabel>
                                <FieldDescription>
                                    Save the ramps currently running as part of the
                                    profile.
                                </FieldDescription>
                            </FieldContent>
                        </Field>

                        {existing && (
                            <Field orientation="horizontal" data-invalid>
                                <Switch
                                    checked={overwrite}
                                    onCheckedChange={(value) =>
                                        form.setValue("overwrite", value)
                                    }
                                />
                                <FieldContent>
                                    <FieldLabel>Overwrite existing profile</FieldLabel>
                                    <FieldDescription className="text-amber-500">
                                        {`"${existing.name}"${existing.builtin ? " (built-in)" : ""} already exists and will be replaced.`}
                                    </FieldDescription>
                                </FieldContent>
                            </Field>
                        )}
                    </FieldGroup>

                    <div className="flex flex-col gap-2">
                        <p className="font-mono text-[10px] tracking-widest uppercase text-primary/40">
                            Snapshot preview
                        </p>

                        {units.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No unit settings available yet.
                            </p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {units.map((unit) => {
                                    const unitRamps = includeRamps
                                        ? ramps.filter((ramp) => ramp.unit === unit.id)
                                        : [];
                                    const modeLabel =
                                        MODE_2B[unit.mode]?.id ?? `mode ${unit.mode}`;

                                    return (
                                        <div
                                            key={unit.id}
                                            className="rounded-lg border border-border/60 bg-muted/20 p-3"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-mono text-xs font-semibold">
                                                    {unit.id}
                                                </span>
                                                <div className="flex flex-wrap justify-end gap-1">
                                                    {unitRamps.map((ramp) => (
                                                        <Badge
                                                            key={`${ramp.unit}.${ramp.field}`}
                                                            variant="secondary"
                                                            className="font-mono text-[10px]"
                                                        >
                                                            {ramp.field} · {ramp.mode}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                                <div className="flex items-center justify-between rounded bg-background/60 px-2 py-1">
                                                    <span className="truncate text-muted-foreground">
                                                        A · {unit.ch_A_use || "—"}
                                                    </span>
                                                    <span className="font-mono font-semibold">
                                                        {Math.round(unit.ch_A)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between rounded bg-background/60 px-2 py-1">
                                                    <span className="truncate text-muted-foreground">
                                                        B · {unit.ch_B_use || "—"}
                                                    </span>
                                                    <span className="font-mono font-semibold">
                                                        {Math.round(unit.ch_B)}
                                                    </span>
                                                </div>
                                            </div>

                                            <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                                                {modeLabel} ·{" "}
                                                {unit.level_h ? "High power" : "Low power"}
                                                {unit.level_d ? " · Dynamic" : ""}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={submitting || (existing != null && !overwrite)}
                    >
                        {submitting ? "Saving..." : "Save profile"}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
