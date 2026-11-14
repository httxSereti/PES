import { Controller, useWatch, type Control } from "react-hook-form";
import { SlidersHorizontal } from "lucide-react";

import { Field, FieldDescription, FieldLabel } from "@pes/ui/components/field";
import { Input } from "@pes/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@pes/ui/components/select";

import { ActionType } from "@/types/events.types";

import { CONDITION_OPERATORS, type FormValues } from "./schema";
import { SwitchRow } from "./switch-row";

const OPERATOR_LABELS: Record<string, string> = {
    eq: "equals",
    neq: "not equals",
    gt: ">",
    gte: "≥",
    lt: "<",
    lte: "≤",
    contains: "contains",
    icontains: "contains (i)",
    exists: "exists",
    is_null: "is null",
};

function fieldsForAction(actionType: ActionType): { value: string; label: string }[] {
    switch (actionType) {
        case ActionType.LEVEL:
            return [
                { value: "value", label: "Value" },
                { value: "duration", label: "Duration" },
            ];
        case ActionType.MULT:
            return [{ value: "pct", label: "Percentage" }];
        case ActionType.PROFILE:
            return [{ value: "level_pct", label: "Level %" }];
        case ActionType.CHASTER_TIME_UPDATE:
            return [{ value: "duration_minutes", label: "Minutes" }];
        case ActionType.LOVENSE_SET:
        case ActionType.LOVENSE_PULSE:
            return [{ value: "value", label: "Output" }];
        default:
            return [{ value: "value", label: "Value" }];
    }
}

export default function ActionAmplifierFields({
    index,
    control,
    actionType,
}: {
    index: number;
    control: Control<FormValues>;
    actionType: ActionType;
}) {
    const enabled = useWatch({ control, name: `actions.${index}.amplifier_enabled` });
    const condition = useWatch({ control, name: `actions.${index}.amplifier_condition` });
    const options = fieldsForAction(actionType);

    return (
        <div className="space-y-3 rounded-lg border border-violet-500/20 bg-violet-500/[0.04] p-3">
            <Controller
                name={`actions.${index}.amplifier_enabled`}
                control={control}
                render={({ field }) => (
                    <SwitchRow
                        icon={SlidersHorizontal}
                        label="Amplifier"
                        description="Scale this action when a condition matches"
                        checked={field.value}
                        onCheckedChange={(checked) => {
                            field.onChange(checked);
                        }}
                    />
                )}
            />

            {enabled && (
                <>
                    <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                        <Controller
                            name={`actions.${index}.amplifier_factor`}
                            control={control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel>Factor</FieldLabel>
                                    <Input
                                        {...field}
                                        type="number"
                                        min={1}
                                        max={10}
                                        step={0.5}
                                        aria-invalid={fieldState.invalid}
                                    />
                                </Field>
                            )}
                        />
                        <Controller
                            name={`actions.${index}.amplifier_fields`}
                            control={control}
                            render={({ field }) => (
                                <Field>
                                    <FieldLabel>Apply to</FieldLabel>
                                    <FieldDescription>
                                        Fields are scaled after templates/MagicNumbers resolve.
                                    </FieldDescription>
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {options.map((option) => {
                                            const selected = Array.isArray(field.value)
                                                ? field.value
                                                : [];
                                            const checked = selected.includes(option.value);
                                            return (
                                                <label
                                                    key={option.value}
                                                    className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border/70 bg-background/50 px-2 py-1 font-mono text-[10px] text-muted-foreground"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        className="size-3 accent-violet-500"
                                                        checked={checked}
                                                        onChange={() =>
                                                            field.onChange(
                                                                checked
                                                                    ? selected.filter(
                                                                          (value: string) =>
                                                                              value !== option.value
                                                                      )
                                                                    : [...selected, option.value]
                                                            )
                                                        }
                                                    />
                                                    {option.label}
                                                </label>
                                            );
                                        })}
                                    </div>
                                </Field>
                            )}
                        />
                    </div>

                    <Controller
                        name={`actions.${index}.amplifier_condition`}
                        control={control}
                        render={({ field }) => (
                            <SwitchRow
                                icon={SlidersHorizontal}
                                label="Only when"
                                description="Optional condition for the multiplier"
                                checked={Boolean(field.value)}
                                onCheckedChange={(checked) =>
                                    field.onChange(
                                        checked
                                            ? {
                                                  field: "actor.display_name",
                                                  op: "eq",
                                                  value: "",
                                                  case_sensitive: true,
                                              }
                                            : null
                                    )
                                }
                            />
                        )}
                    />

                    {condition && (
                        <div className="grid gap-2 md:grid-cols-[minmax(0,1.3fr)_120px_minmax(0,1fr)]">
                            <Controller
                                name={`actions.${index}.amplifier_condition.field`}
                                control={control}
                                render={({ field }) => (
                                    <Input
                                        {...field}
                                        placeholder="actor.display_name"
                                        className="h-8 font-mono text-[10px]"
                                    />
                                )}
                            />
                            <Controller
                                name={`actions.${index}.amplifier_condition.op`}
                                control={control}
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger className="h-8 text-[10px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {CONDITION_OPERATORS.filter((op) => op in OPERATOR_LABELS).map(
                                                (op) => (
                                                    <SelectItem key={op} value={op}>
                                                        {OPERATOR_LABELS[op]}
                                                    </SelectItem>
                                                )
                                            )}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                            <Controller
                                name={`actions.${index}.amplifier_condition.value`}
                                control={control}
                                render={({ field }) => (
                                    <Input
                                        {...field}
                                        placeholder="Sereti"
                                        className="h-8 font-mono text-[10px]"
                                    />
                                )}
                            />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
