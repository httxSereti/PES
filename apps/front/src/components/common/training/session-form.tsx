import type { TrainingSessionFields } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@pes/ui/components/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@pes/ui/components/field";
import { Input } from "@pes/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pes/ui/components/select";
import { Switch } from "@pes/ui/components/switch";
import { Plus, SquareCheck, Trash2 } from "lucide-react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

const GOAL_TYPES = [
  { value: "duration", label: "Duration (minutes)" },
  { value: "edges", label: "Edges (count)" },
] as const;

export const sessionFormSchema = z.object({
  name: z.string().min(1, "Name is required.").max(120, "Name is too long."),
  goals: z
    .array(
      z.object({
        type: z.enum(["duration", "edges"]),
        // Duration goals are entered in minutes, edges as a count.
        value: z.coerce
          .number({ message: "Must be a number." })
          .positive("Must be positive."),
      }),
    )
    .min(1, "At least one goal is required.")
    .max(10, "Too many goals."),
  auto_stop_on_goal: z.boolean(),
});

export type SessionFormValues = z.output<typeof sessionFormSchema>;

export function toSessionFields(
  values: SessionFormValues,
): TrainingSessionFields {
  return {
    name: values.name,
    goals: values.goals.map((goal) => ({
      type: goal.type,
      value:
        goal.type === "duration"
          ? Math.round(goal.value * 60)
          : Math.round(goal.value),
    })),
    auto_stop_on_goal: values.auto_stop_on_goal,
  };
}

export function fromSessionFields(
  fields: Partial<TrainingSessionFields> | undefined,
): SessionFormValues {
  return {
    name: fields?.name ?? "",
    goals: (fields?.goals ?? []).map((goal) => ({
      type: goal.type,
      value: goal.type === "duration" ? goal.value / 60 : goal.value,
    })),
    auto_stop_on_goal: fields?.auto_stop_on_goal ?? false,
  };
}

interface SessionFormProps {
  initial?: Partial<TrainingSessionFields>;
  submitLabel: string;
  onSubmit: (fields: TrainingSessionFields) => Promise<void>;
  error?: string | null;
}

export function SessionForm({
  initial,
  submitLabel,
  onSubmit,
  error,
}: SessionFormProps) {
  const form = useForm<
    z.input<typeof sessionFormSchema>,
    unknown,
    z.output<typeof sessionFormSchema>
  >({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: fromSessionFields(initial),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "goals",
  });

  const isSubmitting = form.formState.isSubmitting;

  async function handleSubmit(values: SessionFormValues) {
    await onSubmit(toSessionFields(values));
  }

  return (
    <form
      id="form-training-session"
      className="space-y-5"
      onSubmit={form.handleSubmit(handleSubmit)}
      noValidate
    >
      {error && <p className="text-sm text-destructive">{error}</p>}

      <FieldGroup>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="form-training-session-name">Name</FieldLabel>
              <Input
                {...field}
                id="form-training-session-name"
                placeholder="Sunday edging session"
                aria-invalid={fieldState.invalid}
                autoComplete="off"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Goals</p>
            <p className="text-xs text-muted-foreground">
              The session succeeds once <em>every</em> goal is reached.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={fields.length >= 10}
            onClick={() => append({ type: "duration", value: 10 })}
          >
            <Plus size={13} />
            Add goal
          </Button>
        </div>

        {form.formState.errors.goals?.root && (
          <FieldError errors={[form.formState.errors.goals.root]} />
        )}

        <div className="space-y-2">
          {fields.map((item, index) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-lg border border-border/60 p-2"
            >
              <Controller
                name={`goals.${index}.type`}
                control={form.control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-44" aria-label="Goal type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GOAL_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <Controller
                name={`goals.${index}.value`}
                control={form.control}
                render={({ field, fieldState }) => (
                  <div className="flex-1">
                    <Input
                      {...field}
                      value={field.value as string | number | undefined}
                      type="number"
                      min={0.5}
                      step={0.5}
                      placeholder={
                        fields[index]?.type === "duration" ? "10" : "5"
                      }
                      aria-invalid={fieldState.invalid}
                      autoComplete="off"
                    />
                    {fieldState.invalid && (
                      <p className="mt-1 text-xs text-destructive">
                        {fieldState.error?.message}
                      </p>
                    )}
                  </div>
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                aria-label="Remove goal"
                disabled={fields.length <= 1}
                onClick={() => remove(index)}
              >
                <Trash2 size={15} />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Controller
        name="auto_stop_on_goal"
        control={form.control}
        render={({ field }) => (
          <Field
            orientation="horizontal"
            className={`items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ${
              field.value
                ? "border-primary/20 bg-primary/5"
                : "border-border/30 bg-transparent"
            }`}
          >
            <div className="flex items-center gap-2">
              <SquareCheck
                size={12}
                className={
                  field.value ? "text-primary/70" : "text-muted-foreground/30"
                }
              />
              <span
                className={`font-mono text-[11px] ${
                  field.value
                    ? "text-primary/80"
                    : "text-muted-foreground/40"
                }`}
              >
                Auto stop on success
              </span>
            </div>
            <Switch
              id="form-training-session-auto-stop"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          </Field>
        )}
      />

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Saving...
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </form>
  );
}
