import { useState } from "react";
import { useNavigate } from "react-router";
import { Controller, useFieldArray, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { PlusSquare, Save } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pes/ui/components/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@pes/ui/components/field";
import { Input } from "@pes/ui/components/input";
import { Textarea } from "@pes/ui/components/textarea";
import { Separator } from "@pes/ui/components/separator";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppDispatch } from "@/store/hooks";
import { triggerRuleAdded, triggerRuleUpdated } from "@/store/slices/triggerRulesSlice";
import { ActionType, type TriggerRule } from "@/types/events.types";

import TriggerRuleActionFields from "./trigger-rule-action-fields";
import TriggerRuleLabelSelect from "./trigger-rule-label-select";
import { ActionExplorer } from "./action-explorer";
import { EventSelection } from "./event-explorer";
import { SwitchField } from "./switch-field";
import { actionSummary, defaultAction, formSchema, ruleToFormValues, toActionBody, type FormValues } from "./schema";

const BACK_PATH = "/app/events/trigger-rules";

export default function TriggerRuleForm({ rule }: { rule?: TriggerRule }) {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const { sendCommand } = useWebSocket();
    const [apiError, setApiError] = useState<string | null>(null);
    const [actionPicker, setActionPicker] = useState<{
        open: boolean;
        index: number | null;
    }>({ open: false, index: null });
    const [expandedAction, setExpandedAction] = useState<number | null>(0);
    const [dragIndex, setDragIndex] = useState<number | null>(null);

    const isEdit = !!rule;

    const form = useForm<FormValues>({
        // coerced number fields make zod's input type differ from its output;
        // cast keeps useForm typed on the output shape (FormValues).
        resolver: zodResolver(formSchema) as unknown as Resolver<FormValues>,
        defaultValues: rule
            ? ruleToFormValues(rule)
            : {
                  name: "",
                  description: "",
                  event_types: [],
                  priority: 0,
                  enabled: true,
                  labels: [],
                  actions: [defaultAction(ActionType.LEVEL)],
              },
    });

    const { fields, append, remove, update, move } = useFieldArray({
        control: form.control,
        name: "actions",
    });
    const watchedActions = form.watch("actions");
    const watchedEventTypes = form.watch("event_types");
    const watchedLabels = form.watch("labels");
    const isSubmitting = form.formState.isSubmitting;
    const actionsError = form.formState.errors.actions?.root ?? form.formState.errors.actions;
    const actionErrors = form.formState.errors.actions;

    function openActionPicker(index: number | null) {
        setActionPicker({ open: true, index });
    }

    function selectActionType(type: ActionType) {
        const index = actionPicker.index;
        if (index === null) {
            const nextIndex = fields.length;
            append(defaultAction(type));
            setExpandedAction(nextIndex);
            return;
        }

        // Reset the payload to the new type's defaults, keeping scheduling.
        const current = watchedActions?.[index];
        update(index, {
            ...defaultAction(type),
            duration: current?.duration ?? -1,
            cumulative: current?.cumulative ?? false,
        });
        setExpandedAction(index);
    }

    function removeAction(index: number) {
        remove(index);
        setExpandedAction((current) => {
            if (current === null) return null;
            if (current === index) return null;
            return current > index ? current - 1 : current;
        });
    }

    function dropAction(index: number) {
        if (dragIndex === null || dragIndex === index) {
            setDragIndex(null);
            return;
        }
        move(dragIndex, index);
        setExpandedAction(index);
        setDragIndex(null);
    }

    function isActionInvalid(index: number) {
        return Array.isArray(actionErrors) && Boolean(actionErrors[index]);
    }

    async function onSubmit(values: FormValues) {
        setApiError(null);
        try {
            const body = {
                event_types: values.event_types,
                name: values.name,
                description: values.description || null,
                enabled: values.enabled,
                priority: values.priority,
                labels: values.labels,
                actions: values.actions.map((action, i) => toActionBody(action, i)),
            };

            // Create or edit the rule (with its actions + labels) in a single WS command
            const result = isEdit
                ? await sendCommand("trigger_rules:edit", { rule_id: rule.id, ...body })
                : await sendCommand("trigger_rules:create", body);

            if (result.status !== "ok" || !result.rule) {
                throw new Error(result.message ?? `Server rejected the trigger rule`);
            }

            // keep the redux list in sync (it is otherwise only filled on WS connect)
            if (isEdit) {
                dispatch(triggerRuleUpdated({ id: rule.id, changes: result.rule }));
            } else {
                dispatch(triggerRuleAdded(result.rule));
            }

            toast.success(`Trigger rule '${values.name}' ${isEdit ? "updated" : "created"}`, {
                description: `${values.actions.length} action${values.actions.length > 1 ? "s" : ""} on ${values.event_types.length} event${values.event_types.length > 1 ? "s" : ""}`,
                position: "bottom-right",
            });

            navigate(BACK_PATH);
        } catch (err) {
            const message = err instanceof Error ? err.message : "An error has occurred";
            setApiError(message);
            toast.error(`Failed to ${isEdit ? "update" : "create"} trigger rule`, {
                description: message,
                position: "top-right",
            });
        }
    }

    return (
        <>
            {apiError && <p className="text-sm text-destructive">{apiError}</p>}

            <form id="form-trigger-rule" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">
                            Trigger rules / {isEdit ? "Edit" : "New"}
                        </p>
                        <h1 className="text-xl font-semibold tracking-tight">
                            {isEdit ? "Edit trigger rule" : "New trigger rule"}
                        </h1>
                        <p className="text-xs text-muted-foreground/60">
                            Pick one or more events, then compose the action chain.
                        </p>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/50">
                        <span className="size-1.5 rounded-full bg-amber-500" />
                        {isEdit ? "Editing rule · unsaved changes" : "Draft · not saved yet"}
                    </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="order-2 min-w-0 space-y-4 xl:order-1">
                        <Card className="gap-2 py-4">
                            <CardHeader className="pb-1">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <CardTitle className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
                                            01 · When this happens
                                        </CardTitle>
                                        <p className="mt-1 text-xs text-muted-foreground/60">
                                            Any selected event can trigger the rule.
                                        </p>
                                    </div>
                                    <span className="shrink-0 font-mono text-[9px] text-muted-foreground/40">
                                        {watchedEventTypes.length} event
                                        {watchedEventTypes.length === 1 ? "" : "s"}
                                    </span>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Controller
                                    name="event_types"
                                    control={form.control}
                                    render={({ field, fieldState }) => (
                                        <div className="space-y-1.5">
                                            <EventSelection value={field.value} onChange={field.onChange} />
                                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                        </div>
                                    )}
                                />
                            </CardContent>
                        </Card>

                        <Card className="gap-2 py-4">
                            <CardHeader className="pb-1">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <CardTitle className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
                                            02 · Then do this
                                        </CardTitle>
                                        <p className="mt-1 text-xs text-muted-foreground/60">
                                            Actions run top to bottom.
                                            <span className="hidden sm:inline"> Drag to reorder.</span>
                                        </p>
                                    </div>
                                    <span className="shrink-0 font-mono text-[9px] text-muted-foreground/40">
                                        {fields.length} action{fields.length === 1 ? "" : "s"}
                                    </span>
                                </div>
                                {actionsError && "message" in actionsError && (
                                    <p className="mt-2 text-xs text-destructive">{actionsError.message as string}</p>
                                )}
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {fields.map((field, index) => {
                                    const action = watchedActions?.[index];
                                    return (
                                        <TriggerRuleActionFields
                                            key={field.id}
                                            index={index}
                                            control={form.control}
                                            actionType={action?.action_type ?? ActionType.LEVEL}
                                            expanded={expandedAction === index}
                                            summary={actionSummary(action ?? defaultAction(ActionType.LEVEL))}
                                            invalid={isActionInvalid(index)}
                                            onToggle={() =>
                                                setExpandedAction((current) => (current === index ? null : index))
                                            }
                                            onOpenActionPicker={() => openActionPicker(index)}
                                            onRemove={() => removeAction(index)}
                                            onDragStart={() => setDragIndex(index)}
                                            onDragOver={(event) => event.preventDefault()}
                                            onDrop={() => dropAction(index)}
                                        />
                                    );
                                })}

                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full border-dashed"
                                    onClick={() => openActionPicker(null)}
                                >
                                    <PlusSquare className="mr-2 h-4 w-4" /> Add action
                                </Button>

                                <p className="pt-1 font-mono text-[9px] leading-relaxed text-muted-foreground/40">
                                    Actions run top to bottom. The first waiting action holds the queue until its
                                    duration ends.
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    <aside className="order-1 min-w-0 xl:order-2 xl:sticky xl:top-[60px] xl:self-start">
                        <Card className="gap-2 py-4">
                            <CardHeader className="pb-1">
                                <div className="flex items-center justify-between gap-2">
                                    <CardTitle className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
                                        Rule details
                                    </CardTitle>
                                    <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground/40">
                                        Required
                                    </span>
                                </div>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4">
                                <FieldGroup className="gap-4">
                                    <Controller
                                        name="name"
                                        control={form.control}
                                        render={({ field, fieldState }) => (
                                            <Field data-invalid={fieldState.invalid}>
                                                <FieldLabel>Name</FieldLabel>
                                                <Input
                                                    {...field}
                                                    aria-invalid={fieldState.invalid}
                                                    placeholder="Breast detection response"
                                                    autoComplete="off"
                                                />
                                                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                            </Field>
                                        )}
                                    />
                                    <Controller
                                        name="description"
                                        control={form.control}
                                        render={({ field, fieldState }) => (
                                            <Field data-invalid={fieldState.invalid}>
                                                <FieldLabel>Description</FieldLabel>
                                                <Textarea
                                                    {...field}
                                                    aria-invalid={fieldState.invalid}
                                                    placeholder="What does this rule do?"
                                                />
                                                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                            </Field>
                                        )}
                                    />
                                    <div className="grid grid-cols-2 gap-3">
                                        <Controller
                                            name="priority"
                                            control={form.control}
                                            render={({ field, fieldState }) => (
                                                <Field data-invalid={fieldState.invalid}>
                                                    <FieldLabel>Priority</FieldLabel>
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
                                            name="enabled"
                                            control={form.control}
                                            render={({ field }) => (
                                                <SwitchField
                                                    label="Enabled"
                                                    description="Active immediately"
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                />
                                            )}
                                        />
                                    </div>
                                    <Controller
                                        name="labels"
                                        control={form.control}
                                        render={({ field }) => (
                                            <Field>
                                                <FieldLabel>Labels</FieldLabel>
                                                <FieldDescription>
                                                    Pick existing labels or create new ones
                                                </FieldDescription>
                                                <TriggerRuleLabelSelect value={field.value} onChange={field.onChange} />
                                            </Field>
                                        )}
                                    />
                                </FieldGroup>

                                <Separator />

                                <div className="rounded-lg border bg-muted/20 p-3">
                                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">
                                        Rule summary
                                    </p>
                                    <div className="mt-2 space-y-1.5 font-mono text-[10px]">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-muted-foreground/40">WHEN</span>
                                            <span>
                                                {watchedEventTypes.length} event
                                                {watchedEventTypes.length === 1 ? "" : "s"}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-muted-foreground/40">THEN</span>
                                            <span>
                                                {fields.length} action
                                                {fields.length === 1 ? "" : "s"} · ordered
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-muted-foreground/40">LABELS</span>
                                            <span>{watchedLabels.length}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="hidden gap-2 pt-2 xl:flex">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="flex-1"
                                        onClick={() => navigate(BACK_PATH)}
                                        disabled={isSubmitting}
                                    >
                                        Cancel
                                    </Button>
                                    <Button type="submit" className="flex-1" disabled={isSubmitting}>
                                        {isSubmitting ? (
                                            <>
                                                <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                                {isEdit ? "Saving..." : "Creating..."}
                                            </>
                                        ) : isEdit ? (
                                            <>
                                                <Save className="mr-2 h-3.5 w-3.5" /> Save changes
                                            </>
                                        ) : (
                                            <>
                                                <PlusSquare className="mr-2 h-3.5 w-3.5" /> Create rule
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </aside>

                    <div className="order-3 flex gap-2 xl:hidden">
                        <Button
                            type="button"
                            variant="ghost"
                            className="flex-1"
                            onClick={() => navigate(BACK_PATH)}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" className="flex-1" disabled={isSubmitting}>
                            {isSubmitting ? (
                                <>
                                    <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    {isEdit ? "Saving..." : "Creating..."}
                                </>
                            ) : isEdit ? (
                                <>
                                    <Save className="mr-2 h-3.5 w-3.5" /> Save changes
                                </>
                            ) : (
                                <>
                                    <PlusSquare className="mr-2 h-3.5 w-3.5" /> Create rule
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </form>

            <ActionExplorer
                open={actionPicker.open}
                onOpenChange={(open) => setActionPicker((current) => ({ ...current, open }))}
                mode={actionPicker.index === null ? "add" : "change"}
                value={actionPicker.index === null ? undefined : watchedActions?.[actionPicker.index]?.action_type}
                onSelect={selectActionType}
            />
        </>
    );
}
