import type { Control } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";
import { useMemo } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pes/ui/components/card";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@pes/ui/components/field";
import { Input } from "@pes/ui/components/input";
import { Switch } from "@pes/ui/components/switch";
import { Separator } from "@pes/ui/components/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@pes/ui/components/select";

import { useAppSelector } from "@/store/hooks";
import { profilesSelectors } from "@/store/slices/profilesSlice";
import { integrationsSelectors } from "@/store/slices/integrationsSlice";
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
    const profiles = useAppSelector(profilesSelectors.selectAll);
    const integrations = useAppSelector(integrationsSelectors.selectAll);
    const watchedOperation = useWatch({ control, name: `actions.${index}.operation` });

    // Action options come from the integrations catalog; fall back to the
    // static ActionType enum while the catalog has not arrived yet.
    const actionOptions = useMemo(() => {
        const fromCatalog = integrations.flatMap(integration =>
            integration.actions.map(action => ({
                id: action.id,
                label: action.label,
                enabled: action.enabled,
            }))
        );
        if (fromCatalog.length > 0) return fromCatalog;
        return Object.values(ActionType).map(type => ({
            id: type as string,
            label: type as string,
            enabled: true,
        }));
    }, [integrations]);

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
                                        {actionOptions.map((option) => (
                                            <SelectItem
                                                key={option.id}
                                                value={option.id}
                                                className={
                                                    option.enabled ? undefined : "text-muted-foreground/50"
                                                }
                                            >
                                                {option.label}
                                                {option.label !== option.id && (
                                                    <span className="ml-1.5 font-mono text-[10px] text-muted-foreground/60">
                                                        {option.id}
                                                    </span>
                                                )}
                                                {!option.enabled && (
                                                    <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/50">
                                                        disabled
                                                    </span>
                                                )}
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
                                render={({ field, fieldState }) => {
                                    // Keep a manually authored letter selectable even
                                    // when it is not part of the current catalog.
                                    const missingOption =
                                        field.value &&
                                        field.value !== "X" &&
                                        !profiles.some((profile) => profile.name === field.value);

                                    return (
                                        <Field data-invalid={fieldState.invalid}>
                                            <FieldLabel>Profile</FieldLabel>
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <SelectTrigger aria-invalid={fieldState.invalid}>
                                                    <SelectValue placeholder="Select a profile" />
                                                </SelectTrigger>
                                                <SelectContent position="item-aligned">
                                                    <SelectItem value="X">X — random</SelectItem>
                                                    {missingOption && (
                                                        <SelectItem value={field.value}>
                                                            {field.value}
                                                        </SelectItem>
                                                    )}
                                                    {profiles.map((profile) => (
                                                        <SelectItem key={profile.name} value={profile.name}>
                                                            {profile.name}
                                                            {profile.description ? ` — ${profile.description}` : ""}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                        </Field>
                                    );
                                }}
                            />
                            <Controller
                                name={`actions.${index}.level_pct`}
                                control={control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel>Level %</FieldLabel>
                                        <Input {...field} type="number" min={0} max={150} aria-invalid={fieldState.invalid} placeholder="100" />
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

                    {actionType === ActionType.PURYFI_SET_ENABLED && (
                        <Controller
                            name={`actions.${index}.enabled`}
                            control={control}
                            render={({ field }) => (
                                <Field orientation="horizontal">
                                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                                    <FieldContent>
                                        <FieldLabel>Enable PuryFi</FieldLabel>
                                        <FieldDescription>On enables the blocker, off disables it</FieldDescription>
                                    </FieldContent>
                                </Field>
                            )}
                        />
                    )}

                    {actionType === ActionType.PURYFI_SET_LOCK && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Controller
                                name={`actions.${index}.timer_minutes`}
                                control={control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel>Timer (minutes)</FieldLabel>
                                        <FieldDescription>0 sets no timer</FieldDescription>
                                        <Input {...field} type="number" min={0} aria-invalid={fieldState.invalid} placeholder="30" />
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )}
                            />
                            <Controller
                                name={`actions.${index}.password`}
                                control={control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel>Password</FieldLabel>
                                        <FieldDescription>Leave empty to clear an existing password</FieldDescription>
                                        <Input {...field} type="password" aria-invalid={fieldState.invalid} placeholder="optional" autoComplete="off" />
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )}
                            />
                        </div>
                    )}

                    {actionType === ActionType.PURYFI_SET_LOCK_TIMER && (
                        <Controller
                            name={`actions.${index}.value`}
                            control={control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel>Time</FieldLabel>
                                    <FieldDescription>
                                        Relative to the current timer: 30, +10, -5, [5-25], +[5-25]
                                    </FieldDescription>
                                    <Input {...field} aria-invalid={fieldState.invalid} placeholder="+10" autoComplete="off" />
                                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                </Field>
                            )}
                        />
                    )}

                    {(actionType === ActionType.PURYFI_ENTER_LOCK_PASSWORD ||
                        actionType === ActionType.PURYFI_EMERGENCY_UNLOCK) && (
                        <p className="text-[11px] text-muted-foreground/60">
                            Uses the{" "}
                            {actionType === ActionType.PURYFI_ENTER_LOCK_PASSWORD
                                ? "lock password"
                                : "emergency server token"}{" "}
                            configured in the PuryFi integration settings.
                        </p>
                    )}

                    {actionType === ActionType.PURYFI_UPDATE_WBLIST && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Controller
                                name={`actions.${index}.operation`}
                                control={control}
                                render={({ field }) => (
                                    <Field>
                                        <FieldLabel>Operation</FieldLabel>
                                        <Select value={field.value} onValueChange={field.onChange}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent position="item-aligned">
                                                <SelectItem value="add">Add entry</SelectItem>
                                                <SelectItem value="remove">Remove entry</SelectItem>
                                                <SelectItem value="set_mode">Switch mode</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </Field>
                                )}
                            />
                            <Controller
                                name={`actions.${index}.list`}
                                control={control}
                                render={({ field }) => (
                                    <Field>
                                        <FieldLabel>
                                            {watchedOperation === "set_mode" ? "Mode" : "List"}
                                        </FieldLabel>
                                        <Select value={field.value} onValueChange={field.onChange}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent position="item-aligned">
                                                <SelectItem value="blacklist">Blacklist</SelectItem>
                                                <SelectItem value="whitelist">Whitelist</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </Field>
                                )}
                            />
                            {watchedOperation !== "set_mode" && (
                                <>
                                    <Controller
                                        name={`actions.${index}.entry_mode`}
                                        control={control}
                                        render={({ field }) => (
                                            <Field>
                                                <FieldLabel>Match</FieldLabel>
                                                <Select value={field.value} onValueChange={field.onChange}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent position="item-aligned">
                                                        <SelectItem value="text">Text</SelectItem>
                                                        <SelectItem value="regex">Regex</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </Field>
                                        )}
                                    />
                                    <Controller
                                        name={`actions.${index}.value`}
                                        control={control}
                                        render={({ field, fieldState }) => (
                                            <Field data-invalid={fieldState.invalid}>
                                                <FieldLabel>Value</FieldLabel>
                                                <FieldDescription>URL, domain or pattern</FieldDescription>
                                                <Input {...field} aria-invalid={fieldState.invalid} placeholder="example.com" autoComplete="off" />
                                                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                            </Field>
                                        )}
                                    />
                                </>
                            )}
                        </div>
                    )}

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
