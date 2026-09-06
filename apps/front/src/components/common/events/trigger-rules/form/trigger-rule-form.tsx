import { useState } from "react";
import { useNavigate } from "react-router";
import { Controller, useFieldArray, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { PlusSquare, Save } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pes/ui/components/card";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@pes/ui/components/field";
import { Input } from "@pes/ui/components/input";
import { Textarea } from "@pes/ui/components/textarea";
import { Switch } from "@pes/ui/components/switch";
import { Separator } from "@pes/ui/components/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@pes/ui/components/select";

import { EVENT_GROUPS } from "@/components/common/events/event-groups";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppDispatch } from "@/store/hooks";
import { triggerRuleAdded, triggerRuleUpdated } from "@/store/slices/triggerRulesSlice";
import { ActionType, type TriggerRule } from "@/types/events.types";

import TriggerRuleActionFields from "./trigger-rule-action-fields";
import TriggerRuleLabelSelect from "./trigger-rule-label-select";
import { defaultAction, formSchema, ruleToFormValues, toActionBody, type FormValues } from "./schema";

const BACK_PATH = "/app/events/trigger-rules";

export default function TriggerRuleForm({ rule }: { rule?: TriggerRule }) {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const { sendCommand } = useWebSocket();
    const [apiError, setApiError] = useState<string | null>(null);

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
                event_type: "",
                priority: 0,
                enabled: true,
                labels: [],
                actions: [defaultAction(ActionType.LEVEL)],
            },
    });

    const { fields, append, remove, update } = useFieldArray({ control: form.control, name: "actions" });
    const watchedActions = form.watch("actions");
    const isSubmitting = form.formState.isSubmitting;
    const actionsError = form.formState.errors.actions?.root ?? form.formState.errors.actions;

    async function onSubmit(values: FormValues) {
        setApiError(null);
        try {
            const body = {
                event_type: values.event_type,
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
                description: `${values.actions.length} action${values.actions.length > 1 ? "s" : ""} on ${values.event_type}`,
                position: "bottom-right",
            });

            navigate(BACK_PATH);
        } catch (err) {
            const message = err instanceof Error ? err.message : "An error has occurred";
            setApiError(message);
            toast.error(`Failed to ${isEdit ? "update" : "create"} trigger rule`, { description: message, position: "top-right" });
        }
    }

    return (
        <>
            {apiError && <p className="text-sm text-destructive">{apiError}</p>}

            <form id="form-trigger-rule" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Rule details */}
                <Card>
                    <CardHeader>
                        <CardTitle className="font-mono text-xs text-muted-foreground/80">Rule</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <FieldGroup>
                            <Controller
                                name="name"
                                control={form.control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel>Name</FieldLabel>
                                        <Input {...field} aria-invalid={fieldState.invalid} placeholder="Sound Sensor alarm" autoComplete="off" />
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
                                        <Textarea {...field} aria-invalid={fieldState.invalid} placeholder="What does this rule do?" />
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )}
                            />
                            <Controller
                                name="event_type"
                                control={form.control}
                                render={({ field, fieldState }) => (
                                    <Field orientation="responsive" data-invalid={fieldState.invalid}>
                                        <FieldContent>
                                            <FieldLabel>Event</FieldLabel>
                                            <FieldDescription>Which event should trigger this rule</FieldDescription>
                                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                        </FieldContent>
                                        <Select name={field.name} value={field.value} onValueChange={field.onChange}>
                                            <SelectTrigger aria-invalid={fieldState.invalid} className="min-w-[200px]">
                                                <SelectValue placeholder="Select" />
                                            </SelectTrigger>
                                            <SelectContent position="item-aligned">
                                                {Object.values(EVENT_GROUPS).map((group) => (
                                                    <div key={group.label}>
                                                        <div className="px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/40">
                                                            {group.label}
                                                        </div>
                                                        {group.types.map((t) => (
                                                            <SelectItem key={t} value={t}>
                                                                {t}
                                                            </SelectItem>
                                                        ))}
                                                    </div>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </Field>
                                )}
                            />
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Controller
                                    name="priority"
                                    control={form.control}
                                    render={({ field, fieldState }) => (
                                        <Field data-invalid={fieldState.invalid}>
                                            <FieldLabel>Priority</FieldLabel>
                                            <FieldDescription>Higher runs first</FieldDescription>
                                            <Input {...field} type="number" aria-invalid={fieldState.invalid} placeholder="0" />
                                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                        </Field>
                                    )}
                                />
                                <Controller
                                    name="enabled"
                                    control={form.control}
                                    render={({ field }) => (
                                        <Field orientation="horizontal">
                                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                                            <FieldContent>
                                                <FieldLabel>Enabled</FieldLabel>
                                                <FieldDescription>Rule is active immediately</FieldDescription>
                                            </FieldContent>
                                        </Field>
                                    )}
                                />
                            </div>
                            <Controller
                                name="labels"
                                control={form.control}
                                render={({ field }) => (
                                    <Field>
                                        <FieldLabel>Labels</FieldLabel>
                                        <FieldDescription>Pick existing labels or create new ones</FieldDescription>
                                        <TriggerRuleLabelSelect value={field.value} onChange={field.onChange} />
                                    </Field>
                                )}
                            />
                        </FieldGroup>
                    </CardContent>
                </Card>

                {/* Actions */}
                <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/40">Actions</span>
                    {actionsError && "message" in actionsError && (
                        <span className="text-xs text-destructive">{actionsError.message as string}</span>
                    )}
                </div>

                {fields.map((field, index) => (
                    <TriggerRuleActionFields
                        key={field.id}
                        index={index}
                        control={form.control}
                        actionType={watchedActions?.[index]?.action_type ?? ActionType.LEVEL}
                        onTypeChange={(type) => {
                            // reset payload to the new type's defaults, keeping scheduling
                            const current = watchedActions?.[index];
                            update(index, {
                                ...defaultAction(type),
                                duration: current?.duration ?? -1,
                                cumulative: current?.cumulative ?? false,
                            });
                        }}
                        onRemove={() => remove(index)}
                    />
                ))}

                <Button
                    type="button"
                    variant="outline"
                    className="w-full border-dashed"
                    onClick={() => append(defaultAction(ActionType.LEVEL))}
                >
                    <PlusSquare className="mr-2 h-4 w-4" /> Add action
                </Button>

                <Separator />

                <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => navigate(BACK_PATH)} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
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
            </form>
        </>
    );
}
