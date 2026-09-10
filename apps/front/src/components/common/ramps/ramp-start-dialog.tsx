import * as React from "react"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"

import { Button } from "@pes/ui/components/button"
import { Input } from "@pes/ui/components/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@pes/ui/components/select"
import { Field, FieldError, FieldGroup, FieldLabel } from "@pes/ui/components/field"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@pes/ui/components/dialog"

import { useWebSocket } from "@/hooks/useWebSocket"
import { RampMode, type RampStartPayload } from "@/types"

const rampSchema = z.object({
    timer: z.coerce.number().positive("Timer must be greater than 0"),
    step: z.coerce.number().positive("Step must be greater than 0"),
    step_unit: z.enum(["percent", "absolute"]),
    mode: z.nativeEnum(RampMode),
    duration: z.coerce.number().refine(
        (v) => v === -1 || v > 0,
        "Use -1 for permanent, or a positive duration"
    ),
    // empty input = use the field's current level as max; also accepts
    // MagicNumber-style ranges like "[25-35]" (random target at start)
    max_value: z.union([
        z.literal(""),
        z.coerce.number().int().min(0).max(100),
        z.string().regex(/^\[\d{1,3}-\d{1,3}\]$/, "Use a number or a range like [25-35]"),
    ]),
    // empty input = start from the field's current level
    start_value: z.union([
        z.literal(""),
        z.coerce.number().int().min(0).max(100),
        z.string().regex(/^\[\d{1,3}-\d{1,3}\]$/, "Use a number or a range like [25-35]"),
    ]),
});

type FormValues = z.infer<typeof rampSchema>;

type RampStartDialogProps = {
    unitId: RampStartPayload["unit"];
    field: RampStartPayload["field"];
    currentValue: number | undefined;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export function RampStartDialog({
    unitId,
    field,
    currentValue,
    open,
    onOpenChange,
}: RampStartDialogProps) {
    const { sendCommand } = useWebSocket();

    const form = useForm<FormValues>({
        resolver: zodResolver(rampSchema) as unknown as Resolver<FormValues>,
        defaultValues: {
            timer: 1,
            step: 1,
            step_unit: "percent",
            mode: RampMode.RESET,
            duration: -1,
            max_value: "",
            start_value: "",
        },
    });

    const onSubmit = async (values: FormValues) => {
        try {
            const result = await sendCommand("ramps:start", {
                unit: unitId,
                field,
                timer: values.timer,
                step: values.step,
                step_unit: values.step_unit,
                mode: values.mode,
                duration: values.duration,
                max_value: values.max_value === "" ? null : values.max_value,
                start_value: values.start_value === "" ? null : values.start_value,
            });
            if (result.status === "error") {
                toast.error(result.message ?? "Failed to start ramp");
                return;
            }
            toast.success(`Ramp started on ${field}`);
            onOpenChange(false);
        } catch (error) {
            console.error("Failed to start ramp:", error);
            toast.error("Failed to start ramp");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Start ramp on {unitId}.{field}</DialogTitle>
                    <DialogDescription>
                        The ramp drives the field from its current value toward the max value, step by step.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3.5">
                    <FieldGroup>
                        <Field>
                            <FieldLabel>Timer (s)</FieldLabel>
                            <Input type="number" step="0.1" placeholder="1" {...form.register("timer")} />
                            {form.formState.errors.timer && (
                                <FieldError errors={[form.formState.errors.timer]} />
                            )}
                        </Field>

                        <Field>
                            <FieldLabel>Step</FieldLabel>
                            <div className="flex gap-2">
                                <Input type="number" step="0.1" placeholder="1" className="flex-1" {...form.register("step")} />
                                <Select
                                    name="step_unit"
                                    value={form.watch("step_unit")}
                                    onValueChange={(v) => form.setValue("step_unit", v as FormValues["step_unit"])}
                                >
                                    <SelectTrigger className="w-28 shrink-0">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent position="item-aligned">
                                        <SelectItem value="percent">% of max</SelectItem>
                                        <SelectItem value="absolute">value</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {form.formState.errors.step && (
                                <FieldError errors={[form.formState.errors.step]} />
                            )}
                        </Field>

                        <Field>
                            <FieldLabel>Mode</FieldLabel>
                            <Select
                                name="mode"
                                value={form.watch("mode")}
                                onValueChange={(v) => form.setValue("mode", v as RampMode)}
                            >
                                <SelectTrigger aria-invalid={!!form.formState.errors.mode} className="min-w-[200px]">
                                    <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent position="item-aligned">
                                    <SelectItem value={RampMode.RESET}>Reset (current → max, repeat)</SelectItem>
                                    <SelectItem value={RampMode.WAVE}>Wave (current → max → current)</SelectItem>
                                    <SelectItem value={RampMode.ASCEND}>Ascend (current → max, hold)</SelectItem>
                                </SelectContent>
                            </Select>
                            {form.formState.errors.mode && (
                                <FieldError errors={[form.formState.errors.mode]} />
                            )}
                        </Field>

                        <Field>
                            <FieldLabel>Duration (s)</FieldLabel>
                            <Input type="number" placeholder="-1 = permanent" {...form.register("duration")} />
                            {form.formState.errors.duration && (
                                <FieldError errors={[form.formState.errors.duration]} />
                            )}
                        </Field>

                        <Field>
                            <FieldLabel>Start value</FieldLabel>
                            <Input
                                type="text"
                                placeholder={currentValue !== undefined ? `Default: ${currentValue}` : "Default: current level"}
                                {...form.register("start_value")}
                            />
                            {form.formState.errors.start_value && (
                                <FieldError errors={[form.formState.errors.start_value]} />
                            )}
                        </Field>

                        <Field>
                            <FieldLabel>Max value</FieldLabel>
                            <Input
                                type="text"
                                placeholder={currentValue !== undefined ? `Default: ${currentValue}` : "Default: current level"}
                                {...form.register("max_value")}
                            />
                            {form.formState.errors.max_value && (
                                <FieldError errors={[form.formState.errors.max_value]} />
                            )}
                        </Field>
                    </FieldGroup>

                    <Button type="submit" className="w-full">
                        Start ramp
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
