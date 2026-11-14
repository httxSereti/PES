import { Controller, useFieldArray, type Control } from "react-hook-form";
import { GitBranch, Plus, Trash2 } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { Input } from "@pes/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@pes/ui/components/select";

import { CONDITION_OPERATORS, type FormValues } from "./schema";

const COMMON_FIELDS = [
    "actor.display_name",
    "actor.id",
    "actor.is_blocked",
    "payload.duration",
    "payload.author",
    "payload.channel.nsfw",
    "payload.is_mention",
    "payload.message.length",
    "session.type",
];

const OPERATOR_LABELS: Record<string, string> = {
    eq: "equals",
    neq: "not equals",
    gt: ">",
    gte: "≥",
    lt: "<",
    lte: "≤",
    in: "in",
    not_in: "not in",
    contains: "contains",
    icontains: "contains (i)",
    starts_with: "starts with",
    ends_with: "ends with",
    matches: "regex",
    exists: "exists",
    between: "between",
    length: "length",
    is_null: "is null",
};

export default function ConditionBuilder({ control }: { control: Control<FormValues> }) {
    const { fields, append, remove } = useFieldArray({ control, name: "conditions" });

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground/60">
                    Conditions are checked before any action runs. Use{" "}
                    <span className="font-mono text-[10px] text-foreground/70">actor.display_name</span>{" "}
                    for the author.
                </p>
                <Controller
                    name="condition_mode"
                    control={control}
                    render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger className="h-7 w-[112px] text-[10px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Match all</SelectItem>
                                <SelectItem value="any">Match any</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                />
            </div>

            {fields.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center">
                    <p className="text-[11px] text-muted-foreground/50">
                        No conditions. The rule runs for every matching event.
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {fields.map((field, index) => (
                        <div
                            key={field.id}
                            className="grid gap-2 rounded-lg border border-border/60 bg-background/40 p-2 md:grid-cols-[minmax(0,1.4fr)_132px_minmax(0,1fr)_auto] md:items-center"
                        >
                            <Controller
                                name={`conditions.${index}.field`}
                                control={control}
                                render={({ field: input, fieldState }) => (
                                    <div className="space-y-1">
                                        <Input
                                            {...input}
                                            list="trigger-condition-fields"
                                            placeholder="actor.display_name"
                                            aria-invalid={fieldState.invalid}
                                            className="h-8 font-mono text-[10px]"
                                            autoComplete="off"
                                        />
                                        {fieldState.invalid && (
                                            <p className="text-[10px] text-destructive">{fieldState.error?.message}</p>
                                        )}
                                    </div>
                                )}
                            />
                            <Controller
                                name={`conditions.${index}.op`}
                                control={control}
                                render={({ field: select }) => (
                                    <Select value={select.value} onValueChange={select.onChange}>
                                        <SelectTrigger className="h-8 text-[10px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {CONDITION_OPERATORS.map((op) => (
                                                <SelectItem key={op} value={op}>
                                                    {OPERATOR_LABELS[op] ?? op}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                            <Controller
                                name={`conditions.${index}.value`}
                                control={control}
                                render={({ field: input }) => (
                                    <Input
                                        {...input}
                                        placeholder="Sereti, 30, true, a,b…"
                                        className="h-8 font-mono text-[10px]"
                                        autoComplete="off"
                                    />
                                )}
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground/50 hover:text-destructive"
                                onClick={() => remove(index)}
                                aria-label="Remove condition"
                            >
                                <Trash2 className="size-3.5" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-dashed"
                    onClick={() =>
                        append({
                            field: "actor.display_name",
                            op: "eq",
                            value: "",
                            case_sensitive: true,
                        })
                    }
                >
                    <Plus className="mr-1.5 size-3.5" />
                    Add condition
                </Button>
                <span className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground/40">
                    <GitBranch className="size-3" />
                    {fields.length} condition{fields.length === 1 ? "" : "s"}
                </span>
            </div>

            <datalist id="trigger-condition-fields">
                {COMMON_FIELDS.map((field) => (
                    <option key={field} value={field} />
                ))}
            </datalist>
        </div>
    );
}
