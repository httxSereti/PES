import type { Control } from "react-hook-form";
import { Controller } from "react-hook-form";
import { Trash2 } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pes/ui/components/card";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@pes/ui/components/field";
import { Input } from "@pes/ui/components/input";
import { Switch } from "@pes/ui/components/switch";
import { Separator } from "@pes/ui/components/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@pes/ui/components/select";

import { ActionType } from "@/types/events.types";
import { type FormValues } from "./schema";

export default function TriggerRuleActionFields({
    index,
    control,
    actionType,
    onTypeChange,
    onRemove,
}: {
    index: number;
    control: Control<FormValues>;
    actionType: ActionType;
    onTypeChange: (type: ActionType) => void;
    onRemove: () => void;
}) {
    return (
        <Card className="bg-muted/20">
            <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="font-mono text-xs text-muted-foreground/80">Action #{index + 1}</CardTitle>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={onRemove}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </CardHeader>
            <CardContent>
                <FieldGroup>
                    <Controller
                        name={`actions.${index}.action_type`}
                        control={control}
                        render={({ field }) => (
                            <Field orientation="responsive">
                                <FieldContent>
                                    <FieldLabel>Action type</FieldLabel>
                                    <FieldDescription>What this action does when triggered</FieldDescription>
                                </FieldContent>
                                <Select
                                    value={field.value}
                                    onValueChange={(v) => onTypeChange(v as ActionType)}
                                >
                                    <SelectTrigger className="min-w-[200px]">
                                        <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent position="item-aligned">
                                        {Object.values(ActionType).map((t) => (
                                            <SelectItem key={t} value={t}>
                                                {t}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        )}
                    />

                    <Separator />

                    {/* ── Type-specific payload ── */}
                    {actionType === ActionType.PROFILE && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Controller
                                name={`actions.${index}.profile`}
                                control={control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel>Profile</FieldLabel>
                                        <Input {...field} aria-invalid={fieldState.invalid} placeholder="A-J or X (random)" autoComplete="off" />
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )}
                            />
                            <Controller
                                name={`actions.${index}.level_pct`}
                                control={control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel>Level %</FieldLabel>
                                        <Input {...field} type="number" aria-invalid={fieldState.invalid} placeholder="100" />
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )}
                            />
                        </div>
                    )}

                    {actionType === ActionType.LEVEL && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Controller
                                name={`actions.${index}.units`}
                                control={control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel>Units</FieldLabel>
                                        <Input {...field} aria-invalid={fieldState.invalid} placeholder="123, 12RM, 23RO" autoComplete="off" />
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )}
                            />
                            <Controller
                                name={`actions.${index}.channels`}
                                control={control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel>Channels</FieldLabel>
                                        <Input {...field} aria-invalid={fieldState.invalid} placeholder="AB, ABRM, ABRO" autoComplete="off" />
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )}
                            />
                            <Controller
                                name={`actions.${index}.value`}
                                control={control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel>Value</FieldLabel>
                                        <FieldDescription>Operator is part of the value: 30, +5, -5, %+5, %-[5-10]</FieldDescription>
                                        <Input {...field} aria-invalid={fieldState.invalid} placeholder="30, +5, %-[5-10]" autoComplete="off" />
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )}
                            />
                        </div>
                    )}

                    {actionType === ActionType.MULT && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Controller
                                name={`actions.${index}.target`}
                                control={control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel>Target</FieldLabel>
                                        <Input {...field} aria-invalid={fieldState.invalid} placeholder="all or usage name" autoComplete="off" />
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )}
                            />
                            <Controller
                                name={`actions.${index}.pct`}
                                control={control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel>Percentage</FieldLabel>
                                        <Input {...field} type="number" aria-invalid={fieldState.invalid} placeholder="0" />
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )}
                            />
                            <Controller
                                name={`actions.${index}.random`}
                                control={control}
                                render={({ field }) => (
                                    <Field orientation="horizontal">
                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                        <FieldContent>
                                            <FieldLabel>Random</FieldLabel>
                                            <FieldDescription>Randomize between 0 and percentage</FieldDescription>
                                        </FieldContent>
                                    </Field>
                                )}
                            />
                        </div>
                    )}

                    {actionType === ActionType.CHASTER_TIME_UPDATE && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Controller
                                name={`actions.${index}.duration_minutes`}
                                control={control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel>Duration (minutes)</FieldLabel>
                                        <FieldDescription>Positive adds time, negative removes</FieldDescription>
                                        <Input {...field} type="number" aria-invalid={fieldState.invalid} placeholder="0" />
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )}
                            />
                            <Controller
                                name={`actions.${index}.only_max`}
                                control={control}
                                render={({ field }) => (
                                    <Field orientation="horizontal">
                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                        <FieldContent>
                                            <FieldLabel>Only max</FieldLabel>
                                            <FieldDescription>Update max only, not current time</FieldDescription>
                                        </FieldContent>
                                    </Field>
                                )}
                            />
                        </div>
                    )}

                    <Separator />

                    {/* ── Common scheduling ── */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Controller
                            name={`actions.${index}.duration`}
                            control={control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel>Duration (seconds)</FieldLabel>
                                    <FieldDescription>-1 means no expiry</FieldDescription>
                                    <Input {...field} type="number" aria-invalid={fieldState.invalid} placeholder="-1" />
                                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                </Field>
                            )}
                        />
                        <Controller
                            name={`actions.${index}.cumulative`}
                            control={control}
                            render={({ field }) => (
                                <Field orientation="horizontal">
                                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                                    <FieldContent>
                                        <FieldLabel>Cumulative</FieldLabel>
                                        <FieldDescription>Runs concurrently instead of waiting its turn</FieldDescription>
                                    </FieldContent>
                                </Field>
                            )}
                        />
                    </div>
                </FieldGroup>
            </CardContent>
        </Card>
    );
}
