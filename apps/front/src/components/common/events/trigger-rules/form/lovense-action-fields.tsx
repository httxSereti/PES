
// ─────────────────────────────── Lovense ───────────────────────────────

import type { Control } from "react-hook-form";
import { Controller } from "react-hook-form";
import { ArrowUpToLine, Shield, Shuffle } from "lucide-react";

import { Field, FieldDescription, FieldError, FieldLabel } from "@pes/ui/components/field";
import { Input } from "@pes/ui/components/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@pes/ui/components/select";

import { useAppSelector } from "@/store/hooks";
import { ActionType } from "@/types/events.types";
import { MagicNumberInput } from "./magic-number-input";
import { type FormValues } from "./schema";
import { SwitchRow } from "./switch-row";

const LOVENSE_OUTPUTS = [
    "Vibrate",
    "Rotate",
    "Oscillate",
    "Constrict",
    "Position",
    "HwPositionWithDuration",
    "Temperature",
    "Led",
    "Spray",
];

const LOVENSE_TARGETABLE = new Set([
    ActionType.LOVENSE_SET,
    ActionType.LOVENSE_PULSE,
    ActionType.LOVENSE_STOP,
    ActionType.LOVENSE_PATTERN_PLAY,
    ActionType.LOVENSE_RANDOM_PATTERN,
    ActionType.LOVENSE_SET_CAP,
    ActionType.LOVENSE_ASSIGN,
]);

const LOVENSE_TAG_TARGETABLE = new Set([
    ActionType.LOVENSE_SET,
    ActionType.LOVENSE_PULSE,
    ActionType.LOVENSE_STOP,
    ActionType.LOVENSE_PATTERN_PLAY,
    ActionType.LOVENSE_SET_CAP,
    ActionType.LOVENSE_ASSIGN,
]);

export function LovenseActionFields({
    index,
    control,
    actionType,
}: {
    index: number;
    control: Control<FormValues>;
    actionType: ActionType;
}) {
    const patterns = useAppSelector(state => state.lovense.patterns);

    return (
        <>
            {LOVENSE_TARGETABLE.has(actionType) && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Controller
                        name={`actions.${index}.devices`}
                        control={control}
                        render={({ field }) => (
                            <Field>
                                <FieldLabel>Devices</FieldLabel>
                                <FieldDescription>
                                    &quot;all&quot; or comma-separated device ids
                                </FieldDescription>
                                <Input
                                    {...field}
                                    value={String(field.value ?? "")}
                                    placeholder="all"
                                    autoComplete="off"
                                />
                            </Field>
                        )}
                    />
                    {LOVENSE_TAG_TARGETABLE.has(actionType) && (
                        <Controller
                            name={`actions.${index}.tags`}
                            control={control}
                            render={({ field }) => (
                                <Field>
                                    <FieldLabel>Target tags</FieldLabel>
                                    <FieldDescription>
                                        Comma-separated tags (empty = no tag filter)
                                    </FieldDescription>
                                    <Input
                                        {...field}
                                        value={String(field.value ?? "")}
                                        placeholder="edge2, camille"
                                        autoComplete="off"
                                    />
                                </Field>
                            )}
                        />
                    )}
                </div>
            )}

            {actionType === ActionType.LOVENSE_SET && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Controller
                        name={`actions.${index}.output`}
                        control={control}
                        render={({ field }) => (
                            <Field>
                                <FieldLabel>Output</FieldLabel>
                                <Select
                                    value={String(field.value ?? "Vibrate")}
                                    onValueChange={field.onChange}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent position="item-aligned">
                                        {LOVENSE_OUTPUTS.map(output => (
                                            <SelectItem key={output} value={output}>
                                                {output}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        )}
                    />
                    <Controller
                        name={`actions.${index}.mode`}
                        control={control}
                        render={({ field }) => (
                            <Field>
                                <FieldLabel>Mode</FieldLabel>
                                <Select
                                    value={String(field.value ?? "expression")}
                                    onValueChange={field.onChange}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent position="item-aligned">
                                        <SelectItem value="expression">Expression</SelectItem>
                                        <SelectItem value="absolute">Absolute</SelectItem>
                                        <SelectItem value="relative">Relative</SelectItem>
                                        <SelectItem value="percent">Percent of current</SelectItem>
                                    </SelectContent>
                                </Select>
                            </Field>
                        )}
                    />
                    <Controller
                        name={`actions.${index}.value`}
                        control={control}
                        render={({ field, fieldState }) => (
                            <Field
                                data-invalid={fieldState.invalid}
                                className="sm:col-span-2"
                            >
                                <FieldLabel>Value</FieldLabel>
                                <FieldDescription>
                                    Percentage of the device range. Expressions are resolved per
                                    device.
                                </FieldDescription>
                                <MagicNumberInput
                                    value={String(field.value ?? "")}
                                    onChange={field.onChange}
                                    invalid={fieldState.invalid}
                                />
                                {fieldState.invalid && (
                                    <FieldError errors={[fieldState.error]} />
                                )}
                            </Field>
                        )}
                    />
                    <Controller
                        name={`actions.${index}.ramp_ms`}
                        control={control}
                        render={({ field }) => (
                            <Field>
                                <FieldLabel>Ramp (ms)</FieldLabel>
                                <FieldDescription>0 = apply immediately</FieldDescription>
                                <Input
                                    type="number"
                                    min={0}
                                    value={Number(field.value ?? 0)}
                                    onChange={event => field.onChange(Number(event.target.value))}
                                />
                            </Field>
                        )}
                    />
                </div>
            )}

            {actionType === ActionType.LOVENSE_PULSE && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Controller
                        name={`actions.${index}.output`}
                        control={control}
                        render={({ field }) => (
                            <Field>
                                <FieldLabel>Output</FieldLabel>
                                <Select
                                    value={String(field.value ?? "Vibrate")}
                                    onValueChange={field.onChange}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent position="item-aligned">
                                        {LOVENSE_OUTPUTS.map(output => (
                                            <SelectItem key={output} value={output}>
                                                {output}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        )}
                    />
                    <Controller
                        name={`actions.${index}.value`}
                        control={control}
                        render={({ field }) => (
                            <Field>
                                <FieldLabel>Peak %</FieldLabel>
                                <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={Number(field.value ?? 50)}
                                    onChange={event => field.onChange(Number(event.target.value))}
                                />
                            </Field>
                        )}
                    />
                    <Controller
                        name={`actions.${index}.attack_ms`}
                        control={control}
                        render={({ field }) => (
                            <Field>
                                <FieldLabel>Attack (ms)</FieldLabel>
                                <Input
                                    type="number"
                                    min={0}
                                    value={Number(field.value ?? 200)}
                                    onChange={event => field.onChange(Number(event.target.value))}
                                />
                            </Field>
                        )}
                    />
                    <Controller
                        name={`actions.${index}.release_ms`}
                        control={control}
                        render={({ field }) => (
                            <Field>
                                <FieldLabel>Release (ms)</FieldLabel>
                                <Input
                                    type="number"
                                    min={0}
                                    value={Number(field.value ?? 300)}
                                    onChange={event => field.onChange(Number(event.target.value))}
                                />
                            </Field>
                        )}
                    />
                    <Controller
                        name={`actions.${index}.hold_ms`}
                        control={control}
                        render={({ field }) => (
                            <Field className="sm:col-span-2">
                                <FieldLabel>Hold (ms)</FieldLabel>
                                <Input
                                    type="number"
                                    min={0}
                                    value={Number(field.value ?? 800)}
                                    onChange={event => field.onChange(Number(event.target.value))}
                                />
                            </Field>
                        )}
                    />
                </div>
            )}

            {actionType === ActionType.LOVENSE_STOP && (
                <Controller
                    name={`actions.${index}.output`}
                    control={control}
                    render={({ field }) => (
                        <Field>
                            <FieldLabel>Output (optional)</FieldLabel>
                            <FieldDescription>
                                Empty stops every output on the targeted devices
                            </FieldDescription>
                            <Select
                                value={String(field.value || "all")}
                                onValueChange={value =>
                                    field.onChange(value === "all" ? "" : value)
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent position="item-aligned">
                                    <SelectItem value="all">Every output</SelectItem>
                                    {LOVENSE_OUTPUTS.map(output => (
                                        <SelectItem key={output} value={output}>
                                            {output}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                    )}
                />
            )}

            {actionType === ActionType.LOVENSE_PATTERN_PLAY && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Controller
                        name={`actions.${index}.pattern_id`}
                        control={control}
                        render={({ field }) => (
                            <Field>
                                <FieldLabel>Pattern</FieldLabel>
                                <Select
                                    value={String(field.value ?? "")}
                                    onValueChange={field.onChange}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Choose a pattern" />
                                    </SelectTrigger>
                                    <SelectContent position="item-aligned">
                                        {patterns.map(pattern => (
                                            <SelectItem key={pattern.id} value={pattern.id}>
                                                {pattern.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        )}
                    />
                    <Controller
                        name={`actions.${index}.scale_pct`}
                        control={control}
                        render={({ field }) => (
                            <Field>
                                <FieldLabel>Intensity scale (%)</FieldLabel>
                                <Input
                                    type="number"
                                    min={0}
                                    max={150}
                                    value={Number(field.value ?? 100)}
                                    onChange={event => field.onChange(Number(event.target.value))}
                                />
                            </Field>
                        )}
                    />
                    <Controller
                        name={`actions.${index}.loop`}
                        control={control}
                        render={({ field }) => (
                            <SwitchRow
                                icon={Shuffle}
                                label="Loop"
                                description="Repeat until stopped or the duration ends"
                                checked={Boolean(field.value)}
                                onCheckedChange={field.onChange}
                            />
                        )}
                    />
                    <Controller
                        name={`actions.${index}.replace`}
                        control={control}
                        render={({ field }) => (
                            <SwitchRow
                                icon={ArrowUpToLine}
                                label="Replace existing"
                                description="Preempt another pattern on the same output"
                                checked={Boolean(field.value)}
                                onCheckedChange={field.onChange}
                            />
                        )}
                    />
                </div>
            )}

            {actionType === ActionType.LOVENSE_PATTERN_STOP && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Controller
                        name={`actions.${index}.pattern_id`}
                        control={control}
                        render={({ field }) => (
                            <Field>
                                <FieldLabel>Pattern (optional)</FieldLabel>
                                <Select
                                    value={String(field.value || "none")}
                                    onValueChange={value =>
                                        field.onChange(value === "none" ? "" : value)
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent position="item-aligned">
                                        <SelectItem value="none">Any</SelectItem>
                                        {patterns.map(pattern => (
                                            <SelectItem key={pattern.id} value={pattern.id}>
                                                {pattern.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        )}
                    />
                    <Controller
                        name={`actions.${index}.run_id`}
                        control={control}
                        render={({ field }) => (
                            <Field>
                                <FieldLabel>Run id (optional)</FieldLabel>
                                <Input
                                    {...field}
                                    value={String(field.value ?? "")}
                                    placeholder="Specific run"
                                    autoComplete="off"
                                />
                            </Field>
                        )}
                    />
                    <Controller
                        name={`actions.${index}.all`}
                        control={control}
                        render={({ field }) => (
                            <SwitchRow
                                icon={Shield}
                                label="Stop every run"
                                description="When no pattern or run id is set"
                                checked={Boolean(field.value)}
                                onCheckedChange={field.onChange}
                            />
                        )}
                    />
                </div>
            )}

            {actionType === ActionType.LOVENSE_RANDOM_PATTERN && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Controller
                        name={`actions.${index}.pattern_tags`}
                        control={control}
                        render={({ field }) => (
                            <Field>
                                <FieldLabel>Pattern tags</FieldLabel>
                                <FieldDescription>
                                    Empty picks any pattern
                                </FieldDescription>
                                <Input
                                    {...field}
                                    value={String(field.value ?? "")}
                                    placeholder="tease, reward"
                                    autoComplete="off"
                                />
                            </Field>
                        )}
                    />
                    <Controller
                        name={`actions.${index}.scale_pct`}
                        control={control}
                        render={({ field }) => (
                            <Field>
                                <FieldLabel>Intensity scale (%)</FieldLabel>
                                <Input
                                    type="number"
                                    min={0}
                                    max={150}
                                    value={Number(field.value ?? 100)}
                                    onChange={event => field.onChange(Number(event.target.value))}
                                />
                            </Field>
                        )}
                    />
                    <Controller
                        name={`actions.${index}.replace`}
                        control={control}
                        render={({ field }) => (
                            <SwitchRow
                                icon={ArrowUpToLine}
                                label="Replace existing"
                                description="Preempt another pattern on the same output"
                                checked={Boolean(field.value)}
                                onCheckedChange={field.onChange}
                            />
                        )}
                    />
                </div>
            )}

            {(actionType === ActionType.LOVENSE_SCAN ||
                actionType === ActionType.LOVENSE_RECONNECT) && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Controller
                        name={`actions.${index}.node_id`}
                        control={control}
                        render={({ field }) => (
                            <Field>
                                <FieldLabel>Node id</FieldLabel>
                                <FieldDescription>
                                    {actionType === ActionType.LOVENSE_SCAN
                                        ? "The node to scan"
                                        : "Empty reconnects every node"}
                                </FieldDescription>
                                <Input
                                    {...field}
                                    value={String(field.value ?? "")}
                                    placeholder="Node id"
                                    autoComplete="off"
                                />
                            </Field>
                        )}
                    />
                    {actionType === ActionType.LOVENSE_SCAN && (
                        <Controller
                            name={`actions.${index}.seconds`}
                            control={control}
                            render={({ field }) => (
                                <Field>
                                    <FieldLabel>Duration (s)</FieldLabel>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={120}
                                        value={Number(field.value ?? 10)}
                                        onChange={event =>
                                            field.onChange(Number(event.target.value))
                                        }
                                    />
                                </Field>
                            )}
                        />
                    )}
                </div>
            )}

            {actionType === ActionType.LOVENSE_SET_CAP && (
                <Controller
                    name={`actions.${index}.max_pct`}
                    control={control}
                    render={({ field }) => (
                        <Field>
                            <FieldLabel>Maximum intensity (%)</FieldLabel>
                            <FieldDescription>
                                Server-side cap; never above 100
                            </FieldDescription>
                            <Input
                                type="number"
                                min={0}
                                max={100}
                                value={Number(field.value ?? 70)}
                                onChange={event => field.onChange(Number(event.target.value))}
                            />
                        </Field>
                    )}
                />
            )}

            {actionType === ActionType.LOVENSE_ASSIGN && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Controller
                        name={`actions.${index}.alias`}
                        control={control}
                        render={({ field }) => (
                            <Field>
                                <FieldLabel>Alias</FieldLabel>
                                <Input
                                    {...field}
                                    value={String(field.value ?? "")}
                                    placeholder="Edge de Camille"
                                    autoComplete="off"
                                />
                            </Field>
                        )}
                    />
                    <Controller
                        name={`actions.${index}.new_tags`}
                        control={control}
                        render={({ field }) => (
                            <Field>
                                <FieldLabel>New tags</FieldLabel>
                                <Input
                                    {...field}
                                    value={String(field.value ?? "")}
                                    placeholder="edge2, camille"
                                    autoComplete="off"
                                />
                            </Field>
                        )}
                    />
                </div>
            )}

            <p className="text-[11px] text-muted-foreground/60">
                Lovense outputs are percentages of the device range. The global and
                per-device caps are always applied server-side.
            </p>
        </>
    );
}
