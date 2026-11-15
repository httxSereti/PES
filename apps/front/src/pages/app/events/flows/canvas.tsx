import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link, useParams } from "react-router";
import {
    ArrowLeft,
    GitBranch,
    GitCompare,
    Loader2,
    Plus,
    RotateCcw,
    Save,
    SlidersHorizontal,
    Trash2,
    Workflow,
    X,
    Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@pes/ui/components/button";
import { Input } from "@pes/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@pes/ui/components/select";
import { Textarea } from "@pes/ui/components/textarea";
import { cn } from "@pes/ui/lib/utils";

import { useActionCatalog } from "@/components/common/events/trigger-rules/form/action-groups";
import { useFlowGraph, type FlowGraph, type GraphDiffResponse, type GraphEdge, type GraphNode } from "@/hooks/useFlowGraph";
import { useAppSelector } from "@/store/hooks";
import { integrationsSelectors } from "@/store/slices/integrationsSlice";
import { triggerRulesSelectors } from "@/store/slices/triggerRulesSlice";

const NODE_W = 220;
const NODE_H = 96;
const COLUMN_WIDTH = 280;
const DEFAULT_Y = 120;

const ADVANCED_NODE_TYPES = [
    "trigger.webhook",
    "trigger.manual",
    "trigger.schedule",
    "data.actor",
    "data.state",
    "data.variable",
    "data.constant",
    "data.json",
    "data.template",
    "data.math",
    "data.compare",
    "data.select",
    "data.random",
    "data.now",
    "data.coalesce",
    "logic.switch",
    "logic.all",
    "logic.any",
    "logic.not",
    "logic.sequence",
    "logic.parallel",
    "logic.delay",
    "logic.repeat",
    "logic.foreach",
    "logic.cooldown",
    "logic.throttle",
    "logic.dedupe",
    "logic.window",
    "logic.stop",
    "effect.level",
    "effect.mult",
    "effect.profile",
    "effect.chaster_time",
    "effect.lovense",
    "effect.puryfi",
    "effect.training",
    "effect.discord",
    "effect.webhook",
    "effect.emit_event",
    "effect.notify",
    "terminal.log",
    "terminal.alert",
] as const;

const CONDITION_OPS = [
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "contains",
    "icontains",
    "starts_with",
    "ends_with",
    "in",
    "not_in",
    "exists",
    "is_null",
    "between",
] as const;

function text(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function edgeKey(edge: GraphEdge): string {
    return `${edge.source}->${edge.target}:${edge.source_port ?? "out"}->${edge.target_port ?? "in"}`;
}

function ensurePositions(graph: FlowGraph): FlowGraph {
    return {
        ...graph,
        nodes: graph.nodes.map((node, index) => ({
            ...node,
            position: node.position ?? { x: 40 + index * COLUMN_WIDTH, y: DEFAULT_Y },
        })),
        edges: graph.edges.map((edge) => ({
            ...edge,
            source_port: edge.source_port ?? "out",
            target_port: edge.target_port ?? "in",
        })),
    };
}

function nodeTitle(node: GraphNode): string {
    if (node.type === "trigger.event") return "When event";
    if (node.type === "trigger.manual") return "Manual trigger";
    if (node.type === "trigger.schedule") return "Schedule trigger";
    if (node.type === "trigger.webhook") return "Webhook trigger";
    if (node.type === "logic.guard") return "If condition";
    if (node.type === "flow.call" || node.type === "logic.subflow") {
        return text(node.config.rule_name) || "Call sub-flow";
    }
    if (node.type === "effect.action" || node.type.startsWith("effect.")) {
        return text(node.config.action_type) || node.type.replace("effect.", "Effect · ");
    }
    return node.type
        .split(".")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" · ");
}

function nodeDetail(node: GraphNode): string {
    if (node.type === "trigger.event") {
        const events = node.config.event_types;
        return Array.isArray(events) ? events.join(", ") : "event";
    }
    if (node.type === "logic.guard") {
        const condition = asRecord(node.config.condition ?? node.config);
        return `${text(condition.field) || "field"} ${text(condition.op) || "eq"} ${String(condition.value ?? "")}`;
    }
    if (node.type === "flow.call" || node.type === "logic.subflow") {
        return text(node.config.rule_id) || "choose a rule";
    }
    if (node.type.startsWith("effect.")) {
        const payload = asRecord(node.config.payload);
        const entries = Object.entries(payload);
        return (
            entries
                .slice(0, 3)
                .map(([key, value]) => `${key}=${String(value)}`)
                .join(" · ") || "effect"
        );
    }
    const config = asRecord(node.config);
    const entries = Object.entries(config);
    return (
        entries
            .slice(0, 3)
            .map(([key, value]) => `${key}=${String(value)}`)
            .join(" · ") || node.type
    );
}

function nodeTone(node: GraphNode) {
    if (node.type.startsWith("trigger.")) {
        return {
            border: "border-violet-500/35",
            bg: "bg-violet-500/[0.07]",
            text: "text-violet-600 dark:text-violet-300",
            Icon: Zap,
        };
    }
    if (node.type.startsWith("logic.")) {
        return {
            border: "border-emerald-500/30",
            bg: "bg-emerald-500/[0.06]",
            text: "text-emerald-600 dark:text-emerald-300",
            Icon: GitBranch,
        };
    }
    if (node.type.startsWith("data.")) {
        return {
            border: "border-cyan-500/30",
            bg: "bg-cyan-500/[0.06]",
            text: "text-cyan-600 dark:text-cyan-300",
            Icon: SlidersHorizontal,
        };
    }
    if (node.type.startsWith("terminal.")) {
        return {
            border: "border-zinc-500/30",
            bg: "bg-zinc-500/[0.06]",
            text: "text-zinc-600 dark:text-zinc-300",
            Icon: Workflow,
        };
    }
    if (node.type === "flow.call" || node.type === "logic.subflow") {
        return {
            border: "border-sky-500/30",
            bg: "bg-sky-500/[0.06]",
            text: "text-sky-600 dark:text-sky-300",
            Icon: Workflow,
        };
    }
    return {
        border: "border-amber-500/30",
        bg: "bg-amber-500/[0.06]",
        text: "text-amber-600 dark:text-amber-300",
        Icon: SlidersHorizontal,
    };
}

function chainTail(graph: FlowGraph): GraphNode | null {
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    let current = graph.nodes.find((node) => node.type.startsWith("trigger.")) ?? null;
    const seen = new Set<string>();
    while (current) {
        if (seen.has(current.id)) break;
        seen.add(current.id);
        const next = graph.edges.find((edge) => edge.source === current?.id);
        if (!next) break;
        current = byId.get(next.target) ?? null;
    }
    return current;
}

function newNode(type: GraphNode["type"], index: number): GraphNode {
    const id = `${type.replace(".", "_")}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    if (type === "trigger.event") {
        return {
            id,
            type,
            config: { event_types: [] },
            position: { x: 40, y: DEFAULT_Y },
        };
    }
    if (type.startsWith("trigger.")) {
        return {
            id,
            type,
            config: type === "trigger.webhook" ? { event_type: "webhook.received" } : {},
            position: { x: 40 + index * COLUMN_WIDTH, y: DEFAULT_Y },
        };
    }
    if (type === "logic.guard") {
        return {
            id,
            type,
            config: {
                condition: { field: "actor.display_name", op: "eq", value: "", case_sensitive: true },
            },
            position: { x: 40 + index * COLUMN_WIDTH, y: DEFAULT_Y },
        };
    }
    if (type === "flow.call" || type === "logic.subflow") {
        return {
            id,
            type,
            config: { rule_id: "", rule_name: "" },
            position: { x: 40 + index * COLUMN_WIDTH, y: DEFAULT_Y },
        };
    }
    if (type.startsWith("data.")) {
        return {
            id,
            type,
            config: {},
            position: { x: 40 + index * COLUMN_WIDTH, y: DEFAULT_Y },
        };
    }
    if (type.startsWith("logic.") || type.startsWith("terminal.")) {
        return {
            id,
            type,
            config: {},
            position: { x: 40 + index * COLUMN_WIDTH, y: DEFAULT_Y },
        };
    }
    if (type.startsWith("effect.")) {
        return {
            id,
            type,
            config: {
                action_type: type === "effect.action" ? "LEVEL" : undefined,
                payload: { units: "1", channels: "A", value: "+5" },
                duration: 30,
                cumulative: false,
                modifiers: [],
            },
            position: { x: 40 + index * COLUMN_WIDTH, y: DEFAULT_Y },
        };
    }
    return {
        id,
        type,
        config: {
            action_type: "LEVEL",
            payload: { units: "1", channels: "A", value: "+5" },
            duration: 30,
            cumulative: false,
            modifiers: [],
        },
        position: { x: 40 + index * COLUMN_WIDTH, y: DEFAULT_Y },
    };
}

function applyEdge(graph: FlowGraph, source: string, target: string): FlowGraph {
    if (source === target) return graph;
    const edges = graph.edges.filter(
        (edge) => edge.source !== source && edge.target !== target,
    );
    return {
        ...graph,
        edges: [...edges, { source, target, source_port: "out", target_port: "in" }],
    };
}

function NodeInspector({
    node,
    graph,
    rules,
    currentRuleId,
    onPatch,
    onDelete,
    onConnect,
}: {
    node: GraphNode;
    graph: FlowGraph;
    rules: Array<{ id: string; name: string }>;
    currentRuleId: string | undefined;
    onPatch: (patch: Partial<GraphNode>, config?: Record<string, unknown>) => void;
    onDelete: () => void;
    onConnect: (sourcePort: string, target: string, targetPort: string) => void;
}) {
    const { actions } = useActionCatalog();
    const integrations = useAppSelector(integrationsSelectors.selectAll);
    const eventOptions = useMemo(
        () =>
            integrations
                .flatMap((integration) => integration.events)
                .slice(0, 300),
        [integrations],
    );
    const [payloadText, setPayloadText] = useState(() =>
        JSON.stringify(asRecord(node.config.payload), null, 2),
    );
    const [modifiersText, setModifiersText] = useState(() =>
        JSON.stringify(Array.isArray(node.config.modifiers) ? node.config.modifiers : [], null, 2),
    );
    const [configText, setConfigText] = useState(() => JSON.stringify(node.config, null, 2));
    const [targetNode, setTargetNode] = useState("");
    const [connectPort, setConnectPort] = useState(
        node.type === "logic.guard" ? "true" : node.type === "logic.switch" ? "default" : "out",
    );
    const [connectTargetPort, setConnectTargetPort] = useState("in");

    useEffect(() => {
        setPayloadText(JSON.stringify(asRecord(node.config.payload), null, 2));
        setModifiersText(
            JSON.stringify(Array.isArray(node.config.modifiers) ? node.config.modifiers : [], null, 2),
        );
        setConfigText(JSON.stringify(node.config, null, 2));
    }, [node.id, node.config]);

    const isActionEffect =
        node.type.startsWith("effect.") &&
        node.type !== "effect.emit_event" &&
        node.type !== "effect.notify";
    const eventTypes = Array.isArray(node.config.event_types)
        ? node.config.event_types.map(String)
        : [];
    const condition = asRecord(node.config.condition ?? node.config);

    function commitJson(value: string, key: "payload" | "modifiers", fallback: unknown) {
        try {
            const parsed = JSON.parse(value);
            if (key === "payload" && (typeof parsed !== "object" || Array.isArray(parsed))) {
                throw new Error("payload must be a JSON object");
            }
            if (key === "modifiers" && !Array.isArray(parsed)) {
                throw new Error("modifiers must be a JSON list");
            }
            onPatch({}, { ...node.config, [key]: parsed });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Invalid JSON");
            if (key === "payload") setPayloadText(JSON.stringify(fallback, null, 2));
            else setModifiersText(JSON.stringify(fallback, null, 2));
        }
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40">
                        {node.type}
                    </p>
                    <p className="truncate text-sm font-medium">{nodeTitle(node)}</p>
                </div>
                {node.type !== "trigger.event" && (
                    <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete node">
                        <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                )}
            </div>

            {node.type === "trigger.event" && (
                <div className="space-y-2">
                    <p className="text-[10px] text-muted-foreground/60">
                        Events that can start this flow. Drag from the right port to connect the next node.
                    </p>
                    <div className="max-h-48 space-y-1 overflow-auto rounded-lg border border-border/60 p-2">
                        {eventOptions.map((event) => {
                            const checked = eventTypes.includes(event.id);
                            return (
                                <label
                                    key={event.id}
                                    className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-[10px] hover:bg-muted/30"
                                >
                                    <input
                                        type="checkbox"
                                        className="mt-0.5 size-3 accent-violet-500"
                                        checked={checked}
                                        onChange={() =>
                                            onPatch(
                                                {},
                                                {
                                                    ...node.config,
                                                    event_types: checked
                                                        ? eventTypes.filter((id) => id !== event.id)
                                                        : [...eventTypes, event.id],
                                                },
                                            )
                                        }
                                    />
                                    <span className="min-w-0">
                                        <span className="block truncate">{event.label}</span>
                                        <span className="block truncate font-mono text-[8px] text-muted-foreground/40">
                                            {event.id}
                                        </span>
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            )}

            {node.type === "trigger.webhook" && (
                <div className="space-y-1.5">
                    <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40">
                        webhook event pattern
                    </p>
                    <Input
                        value={String(node.config.event_type ?? "webhook.received")}
                        onChange={(event) =>
                            onPatch({}, { ...node.config, event_type: event.target.value })
                        }
                        className="h-8 font-mono text-[10px]"
                    />
                    <p className="text-[9px] text-muted-foreground/45">
                        Exact event id or wildcard pattern.
                    </p>
                </div>
            )}

            {(node.type === "trigger.manual" || node.type === "trigger.schedule") && (
                <div className="space-y-2">
                    {node.type === "trigger.schedule" && (
                        <div className="space-y-1">
                            <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40">
                                interval (seconds)
                            </p>
                            <Input
                                type="number"
                                min={30}
                                value={Number(node.config.interval_seconds ?? 60)}
                                onChange={(event) =>
                                    onPatch(
                                        {},
                                        {
                                            ...node.config,
                                            interval_seconds: Number(event.target.value),
                                        },
                                    )
                                }
                                className="h-8 font-mono text-[10px]"
                            />
                        </div>
                    )}
                    <p className="text-[10px] text-muted-foreground/60">
                        This trigger is not event-driven. Run it with the <span className="font-mono">Run now</span>{" "}
                        button or <span className="font-mono">POST /api/events/rules/{graph.created_from}/run</span>
                        {node.type === "trigger.schedule"
                            ? " or let the internal scheduler tick when EVENTS_V3_SCHEDULER=true."
                            : "."}
                    </p>
                </div>
            )}

            {node.type === "logic.guard" && (
                <div className="space-y-2">
                    <Input
                        value={text(condition.field)}
                        onChange={(event) =>
                            onPatch(
                                {},
                                {
                                    ...node.config,
                                    condition: { ...condition, field: event.target.value },
                                },
                            )
                        }
                        placeholder="actor.display_name"
                        className="h-8 font-mono text-[10px]"
                    />
                    <Select
                        value={text(condition.op) || "eq"}
                        onValueChange={(value) =>
                            onPatch(
                                {},
                                {
                                    ...node.config,
                                    condition: { ...condition, op: value },
                                },
                            )
                        }
                    >
                        <SelectTrigger className="h-8 text-[10px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {CONDITION_OPS.map((op) => (
                                <SelectItem key={op} value={op}>
                                    {op}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input
                        value={String(condition.value ?? "")}
                        onChange={(event) =>
                            onPatch(
                                {},
                                {
                                    ...node.config,
                                    condition: { ...condition, value: event.target.value },
                                },
                            )
                        }
                        placeholder="value"
                        className="h-8 font-mono text-[10px]"
                    />
                </div>
            )}

            {isActionEffect && (
                <div className="space-y-2">
                    {node.type === "effect.action" && (
                        <Select
                            value={text(node.config.action_type) || "LEVEL"}
                            onValueChange={(value) =>
                                onPatch({}, { ...node.config, action_type: value })
                            }
                        >
                            <SelectTrigger className="h-8 text-[10px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                                {Object.values(actions)
                                    .sort((a, b) => a.label.localeCompare(b.label))
                                    .map((action) => (
                                        <SelectItem key={action.id} value={action.id}>
                                            {action.label}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                        <Input
                            type="number"
                            value={Number(node.config.duration ?? -1)}
                            onChange={(event) =>
                                onPatch(
                                    {},
                                    { ...node.config, duration: Number(event.target.value) },
                                )
                            }
                            placeholder="duration"
                            className="h-8 font-mono text-[10px]"
                        />
                        <label className="flex items-center gap-2 rounded-md border border-border/60 px-2 text-[10px] text-muted-foreground">
                            <input
                                type="checkbox"
                                className="size-3 accent-amber-500"
                                checked={Boolean(node.config.cumulative)}
                                onChange={(event) =>
                                    onPatch(
                                        {},
                                        { ...node.config, cumulative: event.target.checked },
                                    )
                                }
                            />
                            cumulative
                        </label>
                    </div>
                    <div>
                        <p className="mb-1 font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40">
                            payload
                        </p>
                        <Textarea
                            value={payloadText}
                            onChange={(event) => setPayloadText(event.target.value)}
                            onBlur={() => commitJson(payloadText, "payload", node.config.payload ?? {})}
                            className="min-h-24 font-mono text-[10px]"
                        />
                    </div>
                    <div>
                        <p className="mb-1 font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40">
                            modifiers
                        </p>
                        <Textarea
                            value={modifiersText}
                            onChange={(event) => setModifiersText(event.target.value)}
                            onBlur={() =>
                                commitJson(modifiersText, "modifiers", node.config.modifiers ?? [])
                            }
                            className="min-h-16 font-mono text-[10px]"
                        />
                    </div>
                </div>
            )}

            {(node.type === "flow.call" || node.type === "logic.subflow") && (
                <div className="space-y-2">
                    <p className="text-[10px] text-muted-foreground/60">
                        Inlines the selected rule’s conditions and actions when the graph is applied.
                    </p>
                    <Select
                        value={text(node.config.rule_id)}
                        onValueChange={(value) => {
                            const target = rules.find((rule) => rule.id === value);
                            onPatch(
                                {},
                                {
                                    ...node.config,
                                    rule_id: value,
                                    rule_name: target?.name ?? "",
                                },
                            );
                        }}
                    >
                        <SelectTrigger className="h-8 text-[10px]">
                            <SelectValue placeholder="Choose a rule" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                            {rules
                                .filter((rule) => rule.id !== currentRuleId)
                                .map((rule) => (
                                    <SelectItem key={rule.id} value={rule.id}>
                                        {rule.name}
                                    </SelectItem>
                                ))}
                        </SelectContent>
                    </Select>
                    <Input
                        value={String(node.config.version ?? "")}
                        onChange={(event) =>
                            onPatch(
                                {},
                                {
                                    ...node.config,
                                    version: event.target.value
                                        ? Number(event.target.value)
                                        : undefined,
                                },
                            )
                        }
                        type="number"
                        min={1}
                        placeholder="version (optional, current if empty)"
                        className="h-8 font-mono text-[10px]"
                    />
                    <p className="text-[9px] text-muted-foreground/45">
                        Empty version = current graph. A pinned version is loaded from the version snapshot.
                    </p>
                </div>
            )}

            {!node.type.startsWith("trigger.") &&
                node.type !== "logic.guard" &&
                !isActionEffect &&
                node.type !== "flow.call" &&
                node.type !== "logic.subflow" && (
                    <div>
                        <p className="mb-1 font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40">
                            node config (JSON)
                        </p>
                        <Textarea
                            value={configText}
                            onChange={(event) => setConfigText(event.target.value)}
                            onBlur={() => {
                                try {
                                    const parsed = JSON.parse(configText);
                                    if (typeof parsed !== "object" || Array.isArray(parsed)) {
                                        throw new Error("config must be a JSON object");
                                    }
                                    onPatch({}, parsed as Record<string, unknown>);
                                } catch (error) {
                                    toast.error(error instanceof Error ? error.message : "Invalid JSON");
                                    setConfigText(JSON.stringify(node.config, null, 2));
                                }
                            }}
                            className="min-h-32 font-mono text-[10px]"
                        />
                    </div>
                )}

            <div className="space-y-1.5 border-t border-border/60 pt-2">
                <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40">
                    connect branch
                </p>
                <div className="grid grid-cols-[72px_72px_minmax(0,1fr)] gap-1.5">
                    <Input
                        value={connectPort}
                        onChange={(event) => setConnectPort(event.target.value)}
                        placeholder="out"
                        className="h-8 font-mono text-[10px]"
                    />
                    <Input
                        value={connectTargetPort}
                        onChange={(event) => setConnectTargetPort(event.target.value)}
                        placeholder="in"
                        className="h-8 font-mono text-[10px]"
                    />
                    <Select value={targetNode} onValueChange={setTargetNode}>
                        <SelectTrigger className="h-8 text-[10px]">
                            <SelectValue placeholder="Target node" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                            {graph.nodes
                                .filter((candidate) => candidate.id !== node.id)
                                .map((candidate) => (
                                    <SelectItem key={candidate.id} value={candidate.id}>
                                        {candidate.id} · {nodeTitle(candidate)}
                                    </SelectItem>
                                ))}
                        </SelectContent>
                    </Select>
                </div>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={!targetNode}
                    onClick={() => {
                        if (targetNode) {
                            onConnect(
                                connectPort.trim() || "out",
                                targetNode,
                                connectTargetPort.trim() || "in",
                            );
                        }
                        setTargetNode("");
                    }}
                >
                    Connect port
                </Button>
                <p className="text-[8.5px] text-muted-foreground/40">
                    Source / target ports: <span className="font-mono">true</span>,{" "}
                    <span className="font-mono">false</span>, <span className="font-mono">case:value</span>,{" "}
                    <span className="font-mono">default</span>, <span className="font-mono">amplifier</span>,{" "}
                    <span className="font-mono">condition</span>.
                </p>
            </div>

            <p className="font-mono text-[8px] text-muted-foreground/35">
                graph {graph.id} · {graph.nodes.length} nodes
            </p>
        </div>
    );
}

export default function FlowCanvasPage() {
    const { id } = useParams();
    const rules = useAppSelector(triggerRulesSelectors.selectAll);
    const {
        graph,
        setGraph,
        version,
        warnings,
        versions,
        loading,
        saving,
        error,
        load,
        save,
        diff,
        restore,
        runManual,
    } = useFlowGraph(id);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [connecting, setConnecting] = useState<string | null>(null);
    const [drag, setDrag] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
    const [diffData, setDiffData] = useState<GraphDiffResponse | null>(null);
    const [diffFrom, setDiffFrom] = useState<string>("");
    const [diffTo, setDiffTo] = useState<string>("current");
    const [advancedType, setAdvancedType] = useState<string>(ADVANCED_NODE_TYPES[0]);
    const canvasRef = useRef<HTMLDivElement>(null);

    const selected = graph?.nodes.find((node) => node.id === selectedId) ?? null;
    const diffMode = Boolean(diffData);
    const hasManualTrigger = Boolean(
        graph?.nodes.some(
            (node) => node.type === "trigger.manual" || node.type === "trigger.schedule",
        ),
    );

    useEffect(() => {
        if (!diffFrom && versions.length > 0) {
            const preferred = versions[1]?.version ?? versions[0]?.version;
            if (preferred !== undefined) setDiffFrom(String(preferred));
        }
    }, [versions, diffFrom]);

    useEffect(() => {
        if (!drag) return;
        function move(event: PointerEvent) {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect || !drag) return;
            const x = Math.max(0, event.clientX - rect.left - drag.offsetX);
            const y = Math.max(0, event.clientY - rect.top - drag.offsetY);
            setGraph((current) =>
                current
                    ? {
                          ...current,
                          nodes: current.nodes.map((node) =>
                              node.id === drag.id
                                  ? { ...node, position: { x, y } }
                                  : node,
                          ),
                      }
                    : current,
            );
        }
        function up() {
            setDrag(null);
        }
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        return () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
    }, [drag, setGraph]);

    const display = useMemo(() => {
        if (diffData) {
            const base = ensurePositions(diffData.to_graph);
            const removed = diffData.diff.nodes.removed.map((node) => ({
                ...node,
                position: node.position ?? {
                    x: 40,
                    y: DEFAULT_Y + 140,
                },
            }));
            return {
                nodes: [...base.nodes, ...removed],
                edges: [...base.edges, ...diffData.diff.edges.removed],
            };
        }
        return graph ? ensurePositions(graph) : { nodes: [], edges: [] };
    }, [diffData, graph]);

    const diffStatus = useMemo(() => {
        const nodes = new Map<string, "added" | "removed" | "changed">();
        const edges = new Map<string, "added" | "removed">();
        if (!diffData) return { nodes, edges };
        for (const node of diffData.diff.nodes.added) nodes.set(node.id, "added");
        for (const node of diffData.diff.nodes.removed) nodes.set(node.id, "removed");
        for (const node of diffData.diff.nodes.changed) nodes.set(node.id, "changed");
        for (const edge of diffData.diff.edges.added) edges.set(edgeKey(edge), "added");
        for (const edge of diffData.diff.edges.removed) edges.set(edgeKey(edge), "removed");
        return { nodes, edges };
    }, [diffData]);

    const bounds = useMemo(() => {
        const maxX = Math.max(900, ...display.nodes.map((node) => (node.position?.x ?? 0) + NODE_W + 80));
        const maxY = Math.max(600, ...display.nodes.map((node) => (node.position?.y ?? 0) + NODE_H + 120));
        return { width: maxX, height: maxY };
    }, [display.nodes]);

    function patchNode(nodeId: string, patch: Partial<GraphNode>, config?: Record<string, unknown>) {
        setGraph((current) =>
            current
                ? {
                      ...current,
                      nodes: current.nodes.map((node) =>
                          node.id === nodeId
                              ? { ...node, ...patch, config: config ?? node.config }
                              : node,
                      ),
                  }
                : current,
        );
    }

    function addNode(type: GraphNode["type"], position?: { x: number; y: number }) {
        if (!graph || diffMode) return;
        if (type === "trigger.event" && graph.nodes.some((node) => node.type === "trigger.event")) {
            toast.error("This flow already has a trigger node");
            return;
        }
        const tail = chainTail(graph);
        const node = newNode(type, graph.nodes.length);
        if (position) node.position = position;
        setGraph((current) => {
            if (!current) return current;
            const withNode = { ...current, nodes: [...current.nodes, node] };
            return tail ? applyEdge(withNode, tail.id, node.id) : withNode;
        });
        setSelectedId(node.id);
    }

    function deleteNode(nodeId: string) {
        if (!graph || diffMode) return;
        const node = graph.nodes.find((item) => item.id === nodeId);
        if (!node || node.type === "trigger.event") return;
        const incoming = graph.edges.find((edge) => edge.target === nodeId);
        const outgoing = graph.edges.find((edge) => edge.source === nodeId);
        let edges = graph.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
        if (incoming && outgoing) {
            edges = [
                ...edges.filter((edge) => edge.source !== incoming.source),
                {
                    source: incoming.source,
                    target: outgoing.target,
                    source_port: "out",
                    target_port: "in",
                },
            ];
        }
        setGraph({
            ...graph,
            nodes: graph.nodes.filter((item) => item.id !== nodeId),
            edges,
        });
        setSelectedId(null);
    }

    function removeEdge(edge: GraphEdge) {
        if (!graph || diffMode) return;
        setGraph({
            ...graph,
            edges: graph.edges.filter((item) => edgeKey(item) !== edgeKey(edge)),
        });
    }

    function connectFrom(
        sourceId: string,
        sourcePort: string,
        targetId: string,
        targetPort: string,
    ) {
        if (!graph || diffMode || sourceId === targetId) return;
        setGraph({
            ...graph,
            edges: [
                ...graph.edges.filter(
                    (edge) =>
                        !(edge.source === sourceId && edge.source_port === sourcePort && edge.target === targetId) &&
                        edge.target !== targetId,
                ),
                {
                    source: sourceId,
                    target: targetId,
                    source_port: sourcePort || "out",
                    target_port: targetPort || "in",
                },
            ],
        });
    }

    function completeConnection(target: string) {
        if (!graph || !connecting || diffMode) {
            setConnecting(null);
            return;
        }
        setGraph(applyEdge(graph, connecting, target));
        setConnecting(null);
    }

    async function handleSave() {
        if (!graph) return;
        const result = await save(graph, true);
        if (result) {
            toast.success(
                result.runtime_only
                    ? `Runtime-only flow saved as version ${result.version}`
                    : `Flow saved as version ${result.version}`,
            );
            setDiffData(null);
            setSelectedId(null);
        }
    }

    async function handleDiff() {
        const from = Number(diffFrom);
        if (!from) {
            toast.error("Choose a version to compare");
            return;
        }
        try {
            const to = diffTo === "current" ? undefined : Number(diffTo);
            const result = await diff(from, to);
            if (result) {
                setDiffData(result);
                setSelectedId(null);
                setConnecting(null);
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to compare versions");
        }
    }

    async function handleRestore(target: number) {
        if (!window.confirm(`Restore graph version ${target}? It will be applied to the rule.`)) return;
        const result = await restore(target);
        if (result) {
            toast.success(`Restored as version ${result.version}`);
            setDiffData(null);
        }
    }

    if (loading && !graph) {
        return (
            <div className="flex items-center justify-center py-20 text-muted-foreground/50">
                <Loader2 className="mr-2 size-4 animate-spin" />
                Loading flow graph…
            </div>
        );
    }

    if (!graph) {
        return (
            <div className="px-5 py-16 text-center">
                <p className="text-sm text-destructive">{error ?? "Flow not found"}</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link to="/app/events/flows">Back to flows</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-3 px-4 md:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="ghost" size="sm">
                        <Link to={`/app/events/flows/${id}`}>
                            <ArrowLeft className="mr-1.5 size-3.5" />
                            Composer
                        </Link>
                    </Button>
                    <span className="font-mono text-[9px] text-muted-foreground/35">
                        {graph.nodes.length} nodes · {graph.edges.length} edges · v{version || 0}
                    </span>
                    {diffMode && (
                        <span className="rounded border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 font-mono text-[8px] text-sky-600 dark:text-sky-300">
                            diff v{diffData?.from_version} → v{diffData?.to_version}
                        </span>
                    )}
                    {diffMode && (
                        <span className="flex items-center gap-2 font-mono text-[8px] text-muted-foreground/50">
                            <span className="text-emerald-600 dark:text-emerald-400">added</span>
                            <span className="text-destructive">removed</span>
                            <span className="text-amber-600 dark:text-amber-400">changed</span>
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    {hasManualTrigger && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                                const result = await runManual({});
                                if (result) {
                                    toast.success(
                                        `Manual run: ${result.counts.actions} action(s), ${result.counts.emissions} emission(s)`,
                                    );
                                }
                            }}
                            disabled={saving || diffMode}
                        >
                            <Zap className="mr-1.5 size-3.5" />
                            Run now
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            if (window.confirm("Rebuild the canvas from the current rule? Unsaved edits will be lost.")) {
                                void load(true);
                                setDiffData(null);
                            }
                        }}
                        disabled={loading || saving}
                    >
                        <RotateCcw className="mr-1.5 size-3.5" />
                        Rebuild from rule
                    </Button>
                    <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving || diffMode}>
                        {saving ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Save className="mr-1.5 size-3.5" />}
                        Save & apply
                    </Button>
                </div>
            </div>

            {error && (
                <p className="rounded-lg border border-destructive/25 bg-destructive/10 p-2 text-xs text-destructive">
                    {error}
                </p>
            )}
            {warnings.length > 0 && (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-2 text-[10px] text-amber-700 dark:text-amber-300">
                    {warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                    ))}
                </div>
            )}

            <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)_300px]">
                <div className="space-y-3">
                    <div className="rounded-xl border border-border/70 p-2.5">
                        <p className="mb-2 font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40">
                            Palette
                        </p>
                        <div className="space-y-1.5">
                            {(
                                [
                                    ["trigger.event", "Trigger", Zap],
                                    ["logic.guard", "Condition", GitBranch],
                                    ["effect.action", "Action", SlidersHorizontal],
                                    ["flow.call", "Sub-flow", Workflow],
                                ] as const
                            ).map(([type, label, Icon]) => (
                                <Button
                                    key={type}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="w-full justify-start"
                                    onClick={() => addNode(type)}
                                    draggable
                                    onDragStart={(event) => {
                                        event.dataTransfer.setData("application/x-pes-node", type);
                                        event.dataTransfer.effectAllowed = "copy";
                                    }}
                                    disabled={diffMode || (type === "trigger.event" && graph.nodes.some((node) => node.type === "trigger.event"))}
                                >
                                    <Icon className="mr-2 size-3.5" />
                                    {label}
                                    <Plus className="ml-auto size-3 opacity-50" />
                                </Button>
                            ))}
                        </div>
                        <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
                            <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40">
                                All FlowSpec nodes
                            </p>
                            <Select value={advancedType} onValueChange={setAdvancedType}>
                                <SelectTrigger className="h-8 text-[10px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="max-h-72">
                                    {ADVANCED_NODE_TYPES.map((type) => (
                                        <SelectItem key={type} value={type}>
                                            {type}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={() => addNode(advancedType)}
                                disabled={diffMode}
                            >
                                <Plus className="mr-1.5 size-3.5" />
                                Add {advancedType}
                            </Button>
                        </div>
                        <p className="mt-2 text-[9px] text-muted-foreground/40">
                            Click or drag a block onto the canvas. New nodes are appended after the current chain.
                        </p>
                    </div>

                    <div className="rounded-xl border border-border/70 p-2.5">
                        <p className="mb-2 flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40">
                            <GitCompare className="size-3" />
                            Versions
                        </p>
                        {versions.length === 0 ? (
                            <p className="text-[10px] text-muted-foreground/50">No saved version yet.</p>
                        ) : (
                            <>
                                <div className="space-y-1.5">
                                    <Select value={diffFrom} onValueChange={setDiffFrom}>
                                        <SelectTrigger className="h-8 text-[10px]">
                                            <SelectValue placeholder="From version" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {versions.map((entry) => (
                                                <SelectItem key={entry.id} value={String(entry.version)}>
                                                    v{entry.version} · {entry.nodes} nodes
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Select value={diffTo} onValueChange={setDiffTo}>
                                        <SelectTrigger className="h-8 text-[10px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="current">Current</SelectItem>
                                            {versions.map((entry) => (
                                                <SelectItem key={entry.id} value={String(entry.version)}>
                                                    v{entry.version}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <div className="flex gap-1.5">
                                        <Button type="button" size="sm" variant="outline" className="flex-1" onClick={() => void handleDiff()}>
                                            <GitCompare className="mr-1.5 size-3.5" />
                                            Compare
                                        </Button>
                                        {diffData && (
                                            <Button type="button" size="icon-sm" variant="ghost" onClick={() => setDiffData(null)} aria-label="Exit diff">
                                                <X className="size-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                <div className="mt-2 max-h-40 space-y-1 overflow-auto">
                                    {versions.slice(0, 8).map((entry) => (
                                        <div key={entry.id} className="flex items-center justify-between gap-1 rounded px-1 py-0.5 text-[9px] hover:bg-muted/30">
                                            <span className="font-mono text-muted-foreground/60">
                                                v{entry.version}
                                                {entry.current ? " · current" : ""}
                                            </span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon-sm"
                                                onClick={() => void handleRestore(entry.version)}
                                                disabled={saving}
                                                aria-label={`Restore v${entry.version}`}
                                            >
                                                <RotateCcw className="size-3" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="min-w-0 rounded-xl border border-border/70 bg-[#080808] p-2">
                    <div className="mb-2 flex items-center gap-2">
                        <Workflow className="size-3.5 text-violet-500" />
                        <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                            {diffMode ? "Visual diff" : "Flow canvas"}
                        </p>
                        <span className="rounded border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[8px] text-violet-600 dark:text-violet-300">
                            {diffMode ? "compare" : "editable"}
                        </span>
                    </div>
                    <div className="overflow-auto">
                        <div
                            ref={canvasRef}
                            className="relative"
                            style={{
                                width: bounds.width,
                                height: bounds.height,
                                backgroundImage:
                                    "radial-gradient(circle, rgba(63,63,70,0.55) 1px, transparent 1px)",
                                backgroundSize: "24px 24px",
                            }}
                            onClick={() => {
                                if (connecting) setConnecting(null);
                            }}
                            onDragOver={(event) => {
                                if (event.dataTransfer.types.includes("application/x-pes-node")) {
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "copy";
                                }
                            }}
                            onDrop={(event) => {
                                const type = event.dataTransfer.getData("application/x-pes-node") as GraphNode["type"];
                                if (!type) return;
                                event.preventDefault();
                                const rect = canvasRef.current?.getBoundingClientRect();
                                if (!rect) return;
                                addNode(type, {
                                    x: Math.max(0, event.clientX - rect.left - NODE_W / 2),
                                    y: Math.max(0, event.clientY - rect.top - NODE_H / 2),
                                });
                            }}
                        >
                            <svg className="pointer-events-none absolute inset-0" width={bounds.width} height={bounds.height} aria-hidden="true">
                                {display.edges.map((edge) => {
                                    const from = display.nodes.find((node) => node.id === edge.source);
                                    const to = display.nodes.find((node) => node.id === edge.target);
                                    if (!from?.position || !to?.position) return null;
                                    const x1 = from.position.x + NODE_W;
                                    const y1 = from.position.y + NODE_H / 2;
                                    const x2 = to.position.x;
                                    const y2 = to.position.y + NODE_H / 2;
                                    const mid = Math.max(48, (x2 - x1) / 2);
                                    const status = diffStatus.edges.get(edgeKey(edge));
                                    return (
                                        <g key={edgeKey(edge)}>
                                            <path
                                                className="pointer-events-auto cursor-pointer"
                                                d={`M ${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`}
                                                fill="none"
                                                stroke="transparent"
                                                strokeWidth={14}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    removeEdge(edge);
                                                }}
                                            />
                                            <path
                                                d={`M ${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`}
                                                fill="none"
                                                stroke={
                                                    status === "added"
                                                        ? "#22c55e"
                                                        : status === "removed"
                                                          ? "#ef4444"
                                                          : "#7c3aed"
                                                }
                                                strokeWidth={1.8}
                                                strokeDasharray={status === "removed" ? "6 4" : undefined}
                                                opacity={0.8}
                                            />
                                        </g>
                                    );
                                })}
                            </svg>

                            {display.nodes.map((node) => {
                                const tone = nodeTone(node);
                                const status = diffStatus.nodes.get(node.id);
                                const position = node.position ?? { x: 40, y: DEFAULT_Y };
                                return (
                                    <div
                                        key={node.id}
                                        className={cn(
                                            "absolute rounded-xl border p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-colors",
                                            tone.border,
                                            tone.bg,
                                            status === "added" && "border-emerald-500/70 ring-1 ring-emerald-500/40",
                                            status === "removed" && "border-destructive/70 opacity-60 ring-1 ring-destructive/30",
                                            status === "changed" && "border-amber-500/70 ring-1 ring-amber-500/40",
                                            selectedId === node.id && "ring-2 ring-violet-500/60",
                                            diffMode && "cursor-default",
                                        )}
                                        style={{
                                            left: position.x,
                                            top: position.y,
                                            width: NODE_W,
                                            height: NODE_H,
                                        }}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            if (!diffMode) {
                                                setSelectedId(node.id);
                                                setConnecting(null);
                                            }
                                        }}
                                        onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
                                            if (diffMode || event.button !== 0) return;
                                            const target = event.target as HTMLElement;
                                            if (target.dataset.port === "in" || target.dataset.port === "out") return;
                                            const rect = canvasRef.current?.getBoundingClientRect();
                                            if (!rect) return;
                                            setSelectedId(node.id);
                                            setDrag({
                                                id: node.id,
                                                offsetX: event.clientX - rect.left - position.x,
                                                offsetY: event.clientY - rect.top - position.y,
                                            });
                                        }}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <tone.Icon className={cn("size-3", tone.text)} />
                                            <span className={cn("min-w-0 flex-1 truncate font-mono text-[8px] uppercase tracking-widest", tone.text)}>
                                                {node.type}
                                            </span>
                                            {status && (
                                                <span className="rounded border border-current px-1 font-mono text-[7px] uppercase">
                                                    {status}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-1 truncate text-[11px] font-medium text-foreground">
                                            {nodeTitle(node)}
                                        </p>
                                        <p className="mt-0.5 truncate font-mono text-[8.5px] text-muted-foreground/60">
                                            {nodeDetail(node)}
                                        </p>

                                        {!diffMode && node.type !== "trigger.event" && (
                                            <button
                                                type="button"
                                                data-port="in"
                                                aria-label="Connect input"
                                                className="absolute -left-2 top-1/2 size-4 -translate-y-1/2 rounded-full border border-border bg-background"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    completeConnection(node.id);
                                                }}
                                            />
                                        )}
                                        {!diffMode && (
                                            <button
                                                type="button"
                                                data-port="out"
                                                aria-label="Start connection"
                                                className={cn(
                                                    "absolute -right-2 top-1/2 size-4 -translate-y-1/2 rounded-full border bg-background",
                                                    connecting === node.id
                                                        ? "border-violet-500 bg-violet-500"
                                                        : "border-border",
                                                )}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setConnecting((current) => (current === node.id ? null : node.id));
                                                }}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    {connecting && (
                        <p className="mt-2 text-[10px] text-violet-600 dark:text-violet-300">
                            Click the input port of the target node to finish the connection.
                        </p>
                    )}
                </div>

                <div className="rounded-xl border border-border/70 p-3">
                    {selected && !diffMode ? (
                        <NodeInspector
                            key={selected.id}
                            node={selected}
                            graph={graph}
                            rules={rules}
                            currentRuleId={id}
                            onPatch={(patch, config) => patchNode(selected.id, patch, config)}
                            onDelete={() => deleteNode(selected.id)}
                            onConnect={(port, target, targetPort) =>
                                connectFrom(selected.id, port, target, targetPort)
                            }
                        />
                    ) : (
                        <div className="space-y-2 text-[10px] text-muted-foreground/60">
                            <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40">
                                Inspector
                            </p>
                            {diffMode ? (
                                <p>Diff mode is read-only. Exit the comparison to edit the graph.</p>
                            ) : (
                                <>
                                    <p>Select a node to edit its configuration.</p>
                                    <p>Drag a node to move it. Click an output port then an input port to connect nodes.</p>
                                    <p>Click an edge to delete it.</p>
                                </>
                            )}
                            {selected && diffMode && (
                                <p className="rounded border border-border/60 p-2 font-mono text-[9px]">
                                    {selected.type} · {selected.id}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
