import { useMemo, useState } from "react";
import { AlertTriangle, Check, FlaskConical, Loader2, Play, X } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { cn } from "@pes/ui/lib/utils";

import { useRuleSimulation, type DraftRulePayload } from "@/hooks/useRuleSimulation";

import { conditionSummary, toActionBody, toConditionBody, type FormValues } from "./schema";

function parseAtom(raw: string): unknown {
    const value = raw.trim();
    if (!value) return "";
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null") return null;
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
    return value;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
    const parts = path.split(".").filter(Boolean);
    if (parts.length === 0) return;
    let current: Record<string, unknown> = target;
    for (const part of parts.slice(0, -1)) {
        const next = current[part];
        if (!next || typeof next !== "object" || Array.isArray(next)) {
            current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
    }
    const last = parts[parts.length - 1];
    if (!last) return;
    current[last] = value;
}

function sampleForCondition(condition: { op: string; value: string }): unknown {
    const first = condition.value.split(",")[0] ?? "";
    const parsed = parseAtom(first);
    const numeric = typeof parsed === "number" ? parsed : null;
    if (condition.op === "gt" && numeric !== null) return numeric + 1;
    if (condition.op === "gte" && numeric !== null) return numeric;
    if (condition.op === "lt" && numeric !== null) return Math.max(0, numeric - 1);
    if (condition.op === "lte" && numeric !== null) return numeric;
    if (condition.op === "neq") return `${String(parsed)}_other`;
    if (condition.op === "not_in") return `${String(parsed)}_other`;
    if (condition.op === "between") return parsed;
    if (condition.op === "length" && numeric !== null) return "x".repeat(Math.max(0, numeric));
    if (condition.op === "exists") return parsed === "" ? "sample" : parsed;
    if (condition.op === "is_null") return null;
    return parsed;
}

function sampleFromValues(values: FormValues): Record<string, unknown> {
    const event: Record<string, unknown> = {};
    const actors: Record<string, unknown> = {};
    const session: Record<string, unknown> = {};

    const conditions = [
        ...values.conditions,
        ...values.actions
            .map((action) => action.amplifier_condition)
            .filter((condition): condition is NonNullable<typeof condition> => Boolean(condition)),
    ];

    for (const condition of conditions) {
        const field = condition.field.trim();
        if (!field) continue;
        const value = sampleForCondition(condition);
        if (field.startsWith("actor.")) {
            setPath(actors, field.slice("actor.".length), value);
        } else if (field.startsWith("session.")) {
            setPath(session, field.slice("session.".length), value);
        } else if (field.startsWith("event.")) {
            setPath(event, field.slice("event.".length), value);
        } else if (field.startsWith("payload.")) {
            setPath(event, field.slice("payload.".length), value);
        } else {
            setPath(event, field, value);
        }
    }

    if (Object.keys(actors).length > 0) event.actor = actors;
    if (Object.keys(session).length > 0) event.session = session;
    return event;
}

function payloadSummary(payload: Record<string, unknown>): string {
    const entries = Object.entries(payload).filter(([, value]) => value !== undefined && value !== "");
    if (entries.length === 0) return "no payload";
    return entries
        .slice(0, 3)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(" · ");
}

export default function RulePreview({ values }: { values: FormValues }) {
    const { result, loading, error, simulate } = useRuleSimulation();
    const [hasRun, setHasRun] = useState(false);
    const eventType = values.event_types[0] ?? "";
    const sample = useMemo(() => sampleFromValues(values), [values]);
    const draft = useMemo<DraftRulePayload>(
        () => ({
            name: values.name || "Draft rule",
            description: values.description,
            conditions: values.conditions.map(toConditionBody),
            condition_mode: values.condition_mode,
            actions: values.actions.map((action, index) => ({
                ...toActionBody(action, index),
            })),
        }),
        [values],
    );

    const run = async () => {
        if (!eventType) return;
        setHasRun(true);
        await simulate(eventType, draft, sample);
    };

    const matchedRules = result?.rules.filter((rule) => rule.matched !== false) ?? [];
    const conditionMatched = matchedRules.length > 0;
    const actions = matchedRules.flatMap((rule) => rule.actions);

    return (
        <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <FlaskConical className="size-3.5 text-violet-500 dark:text-violet-400" />
                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                        Live preview
                    </p>
                </div>
                {result && (
                    <span
                        className={cn(
                            "rounded border px-1.5 py-0.5 font-mono text-[8px]",
                            conditionMatched
                                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        )}
                    >
                        {conditionMatched ? "MATCHED" : "CONDITIONS FAILED"}
                    </span>
                )}
            </div>

            <div className="mt-2 space-y-1 font-mono text-[9px] text-muted-foreground/60">
                <div className="flex items-center justify-between gap-2">
                    <span>WHEN</span>
                    <span className="truncate text-foreground/80">{eventType || "no event selected"}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <span>IF</span>
                    <span className="truncate text-foreground/80">
                        {values.conditions.length === 0
                            ? "always"
                            : `${values.conditions.length} condition${values.conditions.length === 1 ? "" : "s"} · ${values.condition_mode}`}
                    </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <span>THEN</span>
                    <span className="text-foreground/80">{values.actions.length} action{values.actions.length === 1 ? "" : "s"}</span>
                </div>
            </div>

            {values.conditions.length > 0 && (
                <div className="mt-2 space-y-1 rounded-lg border border-border/50 bg-background/40 p-2">
                    {values.conditions.map((condition, index) => (
                        <p key={index} className="truncate font-mono text-[9px] text-muted-foreground/60">
                            {conditionSummary(condition)}
                        </p>
                    ))}
                </div>
            )}

            <div className="mt-2 rounded-lg border border-border/50 bg-background/40 p-2">
                <p className="font-mono text-[8px] uppercase tracking-wide text-muted-foreground/40">
                    Sample event
                </p>
                <p className="mt-1 break-all font-mono text-[9px] leading-4 text-muted-foreground/70">
                    {Object.keys(sample).length > 0 ? JSON.stringify(sample) : "{}"}
                </p>
            </div>

            {error && (
                <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-destructive/25 bg-destructive/10 p-2 text-[10px] text-destructive">
                    <X className="mt-0.5 size-3 shrink-0" />
                    {error}
                </div>
            )}

            {result && !error && (
                <div className="mt-2 space-y-1.5">
                    {result.warnings.map((warning) => (
                        <div
                            key={warning}
                            className="flex items-start gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-[10px] text-amber-700 dark:text-amber-300"
                        >
                            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                            {warning}
                        </div>
                    ))}
                    {actions.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border/70 p-2 text-center text-[10px] text-muted-foreground/50">
                            No action would be queued.
                        </p>
                    ) : (
                        actions.map((action) => (
                            <div
                                key={action.queue_item_id}
                                className="rounded-lg border border-border/60 bg-background/40 p-2"
                            >
                                <div className="flex items-center gap-1.5">
                                    <Check className="size-3 text-emerald-500" />
                                    <span className="font-mono text-[9px] text-foreground/80">
                                        {action.action_type}
                                    </span>
                                    <span className="ml-auto font-mono text-[8px] text-muted-foreground/50">
                                        {action.duration === -1 ? "∞" : `${action.duration}s`}
                                    </span>
                                </div>
                                <p className="mt-1 truncate font-mono text-[9px] text-muted-foreground/60">
                                    {payloadSummary(action.payload)}
                                </p>
                                {action.modifiers && action.modifiers.length > 0 && (
                                    <p className="mt-1 font-mono text-[8px] text-violet-600 dark:text-violet-300">
                                        ×{String(action.modifiers[0]?.factor ?? "?")} ·{" "}
                                        {Array.isArray(action.modifiers[0]?.fields)
                                            ? (action.modifiers[0].fields as string[]).join(", ")
                                            : "modifier"}
                                    </p>
                                )}
                            </div>
                        ))
                    )}

                    {result.compiled?.[0] && result.compiled[0].ops.length > 0 && (
                        <div className="rounded-lg border border-border/60 bg-background/40 p-2">
                            <p className="font-mono text-[8px] uppercase tracking-wide text-muted-foreground/40">
                                Compiled plan · {result.compiled[0].ops.length} ops
                            </p>
                            <div className="mt-1 space-y-0.5">
                                {result.compiled[0].ops.map((op, index) => (
                                    <div
                                        key={`${op.node_id}-${index}`}
                                        className="flex items-center gap-2 font-mono text-[8px]"
                                    >
                                        <span className="w-4 text-muted-foreground/35">
                                            {String(index + 1).padStart(2, "0")}
                                        </span>
                                        <span className="text-violet-600 dark:text-violet-300">
                                            {op.op}
                                        </span>
                                        <span className="truncate text-muted-foreground/50">
                                            {op.node_id}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <Button
                type="button"
                size="sm"
                variant={hasRun ? "outline" : "default"}
                className="mt-3 w-full"
                onClick={() => void run()}
                disabled={loading || !eventType}
            >
                {loading ? (
                    <>
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                        Running…
                    </>
                ) : (
                    <>
                        <Play className="mr-1.5 size-3.5" />
                        {hasRun ? "Run again" : "Run dry"}
                    </>
                )}
            </Button>
            <p className="mt-2 text-center font-mono text-[8px] text-muted-foreground/35">
                Uses the draft values only · nothing is queued
            </p>
        </div>
    );
}
