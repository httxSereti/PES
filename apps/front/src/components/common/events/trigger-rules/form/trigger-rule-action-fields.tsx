import type { DragEvent } from "react";
import type { Control } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";
import {
    ArrowUpToLine,
    ChevronDown,
    ChevronRight,
    GripVertical,
    Layers,
    Pencil,
    Shield,
    Shuffle,
    Trash2,
} from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@pes/ui/components/field";
import { cn } from "@pes/ui/lib/utils";
import { Input } from "@pes/ui/components/input";
import { Separator } from "@pes/ui/components/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@pes/ui/components/select";

import { useAppSelector } from "@/store/hooks";
import { profilesSelectors } from "@/store/slices/profilesSlice";
import { ActionType } from "@/types/events.types";
import { useActionCatalog } from "./action-groups";
import { ActionIcon } from "./action-visuals";
import { type FormValues } from "./schema";
import { SwitchRow } from "./switch-row";
import { TokenComposer } from "./token-composer";
import { DurationInput } from "./duration-input";
import { MagicNumberInput } from "./magic-number-input";

export default function TriggerRuleActionFields({
    index,
    control,
    actionType,
    expanded,
    summary,
    invalid,
    onToggle,
    onOpenActionPicker,
    onRemove,
    onDragStart,
    onDragOver,
    onDrop,
}: {
    index: number;
    control: Control<FormValues>;
    actionType: ActionType;
    expanded: boolean;
    summary: string;
    invalid?: boolean;
    onToggle: () => void;
    onOpenActionPicker: () => void;
    onRemove: () => void;
    onDragStart: () => void;
    onDragOver: (event: DragEvent<HTMLDivElement>) => void;
    onDrop: () => void;
}) {
    const profiles = useAppSelector(profilesSelectors.selectAll);
    const { actions } = useActionCatalog();
    const watchedOperation = useWatch({ control, name: `actions.${index}.operation` });
    const action = actions[actionType];

    return (
        <div
            className={cn("rounded-xl border bg-muted/20 transition-colors", expanded && "border-violet-500/30")}
            onDragOver={onDragOver}
            onDrop={onDrop}
        >
            <div className="flex items-center gap-1.5 px-2 py-2 sm:gap-2 sm:px-3 sm:py-2.5">
                <span
                    draggable
                    onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", String(index));
                        onDragStart();
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label="Drag to reorder"
                    title="Drag to reorder"
                    className="cursor-grab text-muted-foreground/40 active:cursor-grabbing"
                >
                    <GripVertical className="size-3.5" />
                </span>
                <span className="font-mono text-[9px] text-muted-foreground/40">
                    {String(index + 1).padStart(2, "0")}
                </span>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-violet-500/25 bg-violet-500/10 text-violet-600 sm:size-8 dark:text-violet-400">
                    <ActionIcon type={actionType} className="size-3.5 sm:size-4" />
                </span>
                <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{action?.label ?? actionType}</span>
                        {invalid && <span className="size-1.5 shrink-0 rounded-full bg-destructive" />}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-muted-foreground/60">
                        {summary}
                        {" · "}
                        {action?.integrationName ?? "Action"}
                    </span>
                </button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={onOpenActionPicker}
                    aria-label="Change action type"
                    className="hidden sm:inline-flex"
                >
                    <Pencil className="size-3.5" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={onToggle}
                    aria-label={expanded ? "Collapse action" : "Expand action"}
                >
                    <ChevronDown className={cn("size-4 transition-transform", !expanded && "-rotate-90")} />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-red-500"
                    onClick={onRemove}
                    aria-label="Remove action"
                >
                    <Trash2 className="size-3.5" />
                </Button>
            </div>
            {expanded && (
                <div className="border-t px-2.5 py-3 sm:px-3">
                    <FieldGroup className="gap-4">
                        <Field>
                            <FieldContent>
                                <FieldLabel>Action type</FieldLabel>
                                <FieldDescription>What this action does when triggered</FieldDescription>
                            </FieldContent>
                            <button
                                type="button"
                                onClick={onOpenActionPicker}
                                className="flex w-full items-center gap-3 rounded-lg border bg-background/40 p-2.5 text-left transition-colors hover:border-violet-500/40 hover:bg-violet-500/5"
                            >
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-400">
                                    <ActionIcon type={actionType} className="size-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium">
                                        {action?.label ?? actionType}
                                    </span>
                                    <span className="block truncate font-mono text-[10px] text-muted-foreground/60">
                                        {action?.integrationName ?? "Action"}
                                        {action?.group ? ` · ${action.group}` : ""}
                                        {" · "}
                                        {Object.keys(action?.payloadSchema ?? {}).length} fields
                                    </span>
                                </span>
                                <span className="hidden shrink-0 font-mono text-[10px] text-muted-foreground/50 sm:inline">
                                    Change
                                </span>
                                <ChevronRight className="size-4 shrink-0 text-muted-foreground/40" />
                            </button>
                        </Field>

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
                                                            <SelectItem value={field.value}>{field.value}</SelectItem>
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
                                            <Input
                                                {...field}
                                                type="number"
                                                min={0}
                                                max={150}
                                                aria-invalid={fieldState.invalid}
                                                placeholder="100"
                                            />
                                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                        </Field>
                                    )}
                                />
                            </div>
                        )}

                        {actionType === ActionType.LEVEL && (
                            <>
                                <Controller
                                    name={`actions.${index}.units`}
                                    control={control}
                                    render={({ field, fieldState }) => (
                                        <Field data-invalid={fieldState.invalid}>
                                            <FieldLabel htmlFor={`trigger-action-${index}-units`}>Units</FieldLabel>
                                            <TokenComposer
                                                id={`trigger-action-${index}-units`}
                                                kind="units"
                                                value={field.value}
                                                onChange={field.onChange}
                                                ariaInvalid={fieldState.invalid}
                                                placeholder="Type 123 or 12RM…"
                                                quickAdd={["123", "1", "2", "3", "12RM", "23RO"]}
                                                hint="One unit group per field. 123 = all units · RM random · RO random once."
                                            />
                                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                        </Field>
                                    )}
                                />
                                <Controller
                                    name={`actions.${index}.channels`}
                                    control={control}
                                    render={({ field, fieldState }) => (
                                        <Field data-invalid={fieldState.invalid}>
                                            <FieldLabel htmlFor={`trigger-action-${index}-channels`}>
                                                Channels
                                            </FieldLabel>
                                            <TokenComposer
                                                id={`trigger-action-${index}-channels`}
                                                kind="channels"
                                                value={field.value}
                                                onChange={field.onChange}
                                                ariaInvalid={fieldState.invalid}
                                                placeholder="Type AB or ABRM…"
                                                quickAdd={["AB", "A", "B", "ABRM", "ABRO"]}
                                                hint="One channel group per field. AB = both · RM random · RO random once."
                                            />
                                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                        </Field>
                                    )}
                                />
                                <Controller
                                    name={`actions.${index}.value`}
                                    control={control}
                                    render={({ field, fieldState }) => (
                                        <Field data-invalid={fieldState.invalid}>
                                            <FieldLabel htmlFor={`trigger-action-${index}-value`}>Value</FieldLabel>
                                            <FieldDescription>
                                                Operator is part of the value: 30, +5, -5, %+5, %-[5-10]
                                            </FieldDescription>
                                            <MagicNumberInput
                                                id={`trigger-action-${index}-value`}
                                                value={field.value}
                                                onChange={field.onChange}
                                                invalid={fieldState.invalid}
                                            />
                                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                        </Field>
                                    )}
                                />
                            </>
                        )}

                        {actionType === ActionType.MULT && (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Controller
                                    name={`actions.${index}.target`}
                                    control={control}
                                    render={({ field, fieldState }) => (
                                        <Field data-invalid={fieldState.invalid}>
                                            <FieldLabel>Target</FieldLabel>
                                            <Input
                                                {...field}
                                                aria-invalid={fieldState.invalid}
                                                placeholder="all or usage name"
                                                autoComplete="off"
                                            />
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
                                            <Input
                                                {...field}
                                                type="number"
                                                aria-invalid={fieldState.invalid}
                                                placeholder="0"
                                            />
                                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                        </Field>
                                    )}
                                />
                            </div>
                        )}

                        {actionType === ActionType.MULT && (
                            <Controller
                                name={`actions.${index}.random`}
                                control={control}
                                render={({ field }) => (
                                    <SwitchRow
                                        icon={Shuffle}
                                        label="Random"
                                        description="Randomize between 0 and percentage"
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        className="border-t"
                                    />
                                )}
                            />
                        )}

                        {actionType === ActionType.CHASTER_TIME_UPDATE && (
                            <>
                                <Controller
                                    name={`actions.${index}.duration_minutes`}
                                    control={control}
                                    render={({ field, fieldState }) => (
                                        <Field data-invalid={fieldState.invalid}>
                                            <FieldLabel>Duration (minutes)</FieldLabel>
                                            <FieldDescription>Positive adds time, negative removes</FieldDescription>
                                            <Input
                                                {...field}
                                                type="number"
                                                aria-invalid={fieldState.invalid}
                                                placeholder="0"
                                            />
                                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                        </Field>
                                    )}
                                />
                                <Controller
                                    name={`actions.${index}.only_max`}
                                    control={control}
                                    render={({ field }) => (
                                        <SwitchRow
                                            icon={ArrowUpToLine}
                                            label="Only max"
                                            description="Update max only, not current time"
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                            className="border-t"
                                        />
                                    )}
                                />
                            </>
                        )}

                        <Separator />

                        {actionType === ActionType.PURYFI_SET_ENABLED && (
                            <Controller
                                name={`actions.${index}.enabled`}
                                control={control}
                                render={({ field }) => (
                                    <SwitchRow
                                        icon={Shield}
                                        label="Enable PuryFi"
                                        description="On enables the blocker, off disables it"
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                )}
                            />
                        )}

                        {actionType === ActionType.PURYFI_SET_LOCK && (
                            <div className="space-y-3">
                                <Controller
                                    name={`actions.${index}.timer_minutes`}
                                    control={control}
                                    render={({ field, fieldState }) => (
                                        <Field data-invalid={fieldState.invalid}>
                                            <FieldLabel>Timer (minutes)</FieldLabel>
                                            <FieldDescription>0 sets no timer</FieldDescription>
                                            <Input
                                                {...field}
                                                type="number"
                                                min={0}
                                                aria-invalid={fieldState.invalid}
                                                placeholder="30"
                                            />
                                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                        </Field>
                                    )}
                                />
                                <p className="text-[11px] text-muted-foreground/60">
                                    Uses the lock password configured in the PuryFi integration
                                    settings. Leave it empty to create locks without a password.
                                </p>
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
                                        <Input
                                            {...field}
                                            aria-invalid={fieldState.invalid}
                                            placeholder="+10"
                                            autoComplete="off"
                                        />
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
                                            <FieldLabel>{watchedOperation === "set_mode" ? "Mode" : "List"}</FieldLabel>
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
                                                    <Input
                                                        {...field}
                                                        aria-invalid={fieldState.invalid}
                                                        placeholder="example.com"
                                                        autoComplete="off"
                                                    />
                                                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                                </Field>
                                            )}
                                        />
                                    </>
                                )}
                            </div>
                        )}

                        {/* ── Common scheduling ── */}
                        <Controller
                            name={`actions.${index}.duration`}
                            control={control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel htmlFor={`trigger-action-${index}-duration`}>Duration</FieldLabel>
                                    <FieldDescription>Seconds · ∞ means no expiry</FieldDescription>
                                    <DurationInput
                                        id={`trigger-action-${index}-duration`}
                                        value={field.value}
                                        onChange={field.onChange}
                                        invalid={fieldState.invalid}
                                    />
                                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                </Field>
                            )}
                        />
                        <Controller
                            name={`actions.${index}.cumulative`}
                            control={control}
                            render={({ field }) => (
                                <SwitchRow
                                    icon={Layers}
                                    label="Cumulative"
                                    description="Runs concurrently instead of waiting its turn"
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    className="border-t"
                                />
                            )}
                        />
                    </FieldGroup>
                </div>
            )}
        </div>
    );
}
