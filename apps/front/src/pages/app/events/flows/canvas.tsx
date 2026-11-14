import { Link, useParams } from "react-router";
import { ArrowLeft, GitBranch, Loader2, Pencil, SlidersHorizontal, Workflow, Zap } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { cn } from "@pes/ui/lib/utils";

import { useFlowSpec, type FlowSpecNode } from "@/hooks/useFlowSpec";
import { useAppSelector } from "@/store/hooks";
import { triggerRulesSelectors } from "@/store/slices/triggerRulesSlice";

const NODE_W = 232;
const NODE_H = 86;
const COL_GAP = 88;
const ROW_GAP = 28;
const X0 = 40;
const Y0 = 84;

const COLUMN_BY_TYPE: Record<string, number> = {
    "trigger.event": 0,
    "logic.guard": 1,
    "effect.action": 2,
};

function text(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function nodeTitle(node: FlowSpecNode): string {
    if (node.type === "trigger.event") return "When event";
    if (node.type === "logic.guard") return "If condition";
    if (node.type === "effect.action") return text(node.config.action_type) || "Then action";
    return node.type;
}

function nodeDetail(node: FlowSpecNode): string {
    if (node.type === "trigger.event") {
        const events = node.config.event_types;
        return Array.isArray(events) ? events.join(", ") : "event";
    }
    if (node.type === "logic.guard") {
        const condition = node.config.condition;
        if (condition && typeof condition === "object") {
            const c = condition as Record<string, unknown>;
            return `${String(c.field ?? "field")} ${String(c.op ?? "eq")} ${String(c.value ?? "")}`;
        }
        return "condition";
    }
    if (node.type === "effect.action") {
        const payload = node.config.payload;
        const entries = payload && typeof payload === "object" ? Object.entries(payload) : [];
        const summary = entries
            .slice(0, 3)
            .map(([key, value]) => `${key}=${String(value)}`)
            .join(" · ");
        return summary || "action";
    }
    return "";
}

function nodeTone(node: FlowSpecNode) {
    if (node.type === "trigger.event") {
        return {
            border: "border-violet-500/35",
            bg: "bg-violet-500/[0.07]",
            text: "text-violet-600 dark:text-violet-300",
            Icon: Zap,
        };
    }
    if (node.type === "logic.guard") {
        return {
            border: "border-emerald-500/30",
            bg: "bg-emerald-500/[0.06]",
            text: "text-emerald-600 dark:text-emerald-300",
            Icon: GitBranch,
        };
    }
    return {
        border: "border-amber-500/30",
        bg: "bg-amber-500/[0.06]",
        text: "text-amber-600 dark:text-amber-300",
        Icon: SlidersHorizontal,
    };
}

export default function FlowCanvasPage() {
    const { id } = useParams();
    const rule = useAppSelector((state) => (id ? triggerRulesSelectors.selectById(state, id) : undefined));
    const { spec, compiled, loading, error } = useFlowSpec(id);

    if (loading && !spec) {
        return (
            <div className="flex items-center justify-center py-20 text-muted-foreground/50">
                <Loader2 className="mr-2 size-4 animate-spin" />
                Compiling flow…
            </div>
        );
    }

    if (error || !spec) {
        return (
            <div className="px-5 py-16 text-center">
                <p className="text-sm text-destructive">{error ?? "Flow not found"}</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link to="/app/events/flows">Back to flows</Link>
                </Button>
            </div>
        );
    }

    const positions: Record<string, { x: number; y: number }> = {};
    const rowByType: Record<string, number> = {};
    for (const node of spec.nodes) {
        const column = COLUMN_BY_TYPE[node.type] ?? 0;
        const row = rowByType[node.type] ?? 0;
        positions[node.id] = {
            x: X0 + column * (NODE_W + COL_GAP),
            y: Y0 + row * (NODE_H + ROW_GAP),
        };
        rowByType[node.type] = row + 1;
    }

    const maxRows = Math.max(1, ...Object.values(rowByType));
    const width = X0 * 2 + 3 * NODE_W + 2 * COL_GAP;
    const height = Y0 + maxRows * (NODE_H + ROW_GAP) + 40;

    return (
        <div className="space-y-4 px-4 md:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Button asChild variant="ghost" size="sm">
                        <Link to={`/app/events/flows/${id}`}>
                            <ArrowLeft className="mr-1.5 size-3.5" />
                            Back to editor
                        </Link>
                    </Button>
                    <span className="font-mono text-[9px] text-muted-foreground/35">
                        {spec.nodes.length} nodes · {spec.edges.length} edges
                        {compiled ? ` · ${compiled.ops.length} ops` : ""}
                    </span>
                </div>
                {rule && (
                    <Button asChild variant="outline" size="sm">
                        <Link to={`/app/events/flows/${rule.id}`}>
                            <Pencil className="mr-1.5 size-3.5" />
                            Edit in Composer
                        </Link>
                    </Button>
                )}
            </div>

            <div className="rounded-xl border border-border/70 bg-[#080808] p-3">
                <div className="mb-2 flex items-center gap-2">
                    <Workflow className="size-3.5 text-violet-500" />
                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                        Flow canvas
                    </p>
                    <span className="rounded border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[8px] text-violet-600 dark:text-violet-300">
                        compiled
                    </span>
                </div>
                <div className="overflow-auto">
                    <div className="relative" style={{ width, height }}>
                        <svg
                            className="pointer-events-none absolute inset-0"
                            width={width}
                            height={height}
                            aria-hidden="true"
                        >
                            {spec.edges.map((edge, index) => {
                                const from = positions[edge.source];
                                const to = positions[edge.target];
                                if (!from || !to) return null;
                                const x1 = from.x + NODE_W;
                                const y1 = from.y + NODE_H / 2;
                                const x2 = to.x;
                                const y2 = to.y + NODE_H / 2;
                                const mid = Math.max(48, (x2 - x1) / 2);
                                return (
                                    <path
                                        key={`${edge.source}-${edge.target}-${index}`}
                                        d={`M ${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`}
                                        fill="none"
                                        stroke={to.x > from.x ? "#7c3aed" : "#3f3f46"}
                                        strokeWidth={1.5}
                                        opacity={0.75}
                                    />
                                );
                            })}
                        </svg>

                        {spec.nodes.map((node) => {
                            const pos = positions[node.id];
                            const tone = nodeTone(node);
                            if (!pos) return null;
                            return (
                                <div
                                    key={node.id}
                                    className={cn(
                                        "absolute rounded-xl border p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.25)]",
                                        tone.border,
                                        tone.bg,
                                    )}
                                    style={{
                                        left: pos.x,
                                        top: pos.y,
                                        width: NODE_W,
                                        height: NODE_H,
                                    }}
                                >
                                    <div className="flex items-center gap-1.5">
                                        <tone.Icon className={cn("size-3", tone.text)} />
                                        <span
                                            className={cn("font-mono text-[8px] uppercase tracking-widest", tone.text)}
                                        >
                                            {node.type}
                                        </span>
                                    </div>
                                    <p className="mt-1 truncate text-[11px] font-medium text-foreground">
                                        {nodeTitle(node)}
                                    </p>
                                    <p className="mt-0.5 truncate font-mono text-[8.5px] text-muted-foreground/60">
                                        {nodeDetail(node)}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {compiled && compiled.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-2 text-[10px] text-amber-700 dark:text-amber-300">
                    {compiled.warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                    ))}
                </div>
            )}
        </div>
    );
}
