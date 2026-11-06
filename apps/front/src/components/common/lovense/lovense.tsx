import { useCallback, useMemo, useState } from "react";
import {
    Activity,
    BatteryCharging,
    Blocks,
    Copy,
    Cpu,
    Diamond,
    ExternalLink,
    Link2,
    Pencil,
    Play,
    Plus,
    Power,
    Radio,
    RefreshCw,
    Server,
    ShieldCheck,
    Square,
    Tag,
    Trash2,
    Vibrate,
    Wifi,
    WifiOff,
    type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@pes/ui/components/badge";
import { Button } from "@pes/ui/components/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@pes/ui/components/dialog";
import { Separator } from "@pes/ui/components/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@pes/ui/components/tabs";

import { AddNodeDialog } from "@/components/common/lovense/add-node-dialog";
import { DeviceCard } from "@/components/common/lovense/device-card";
import { PatternEditor } from "@/components/common/lovense/pattern-editor";
import { useWebSocket, useWebSocketEvent } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import { integrationsSelectors } from "@/store/slices/integrationsSlice";
import type {
    LovenseIntifaceStatus,
    LovenseNodeInfo,
    LovensePatternDetail,
    LovensePatternSummary,
    LovenseRunInfo,
} from "@/types";

function plural(count: number, word: string) {
    return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function StatChip({
    icon: Icon,
    label,
    tone = "text-muted-foreground",
}: {
    icon: LucideIcon;
    label: string;
    tone?: string;
}) {
    return (
        <div className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-[3px] text-[10px] text-muted-foreground">
            <Icon className={`size-3 ${tone}`} />
            {label}
        </div>
    );
}

function IntifaceCard({
    status,
    onStart,
    onStop,
    onRestart,
}: {
    status: LovenseIntifaceStatus | null;
    onStart: () => void;
    onStop: () => void;
    onRestart: () => void;
}) {
    if (!status) return null;
    const running = status.running;
    const external = status.external;
    const notFound = status.status === "not_found";
    const failed = status.status === "error";
    const starting = status.status === "starting";
    const downloading = status.status === "downloading";
    const busy = starting || downloading;
    const tone = running ? "emerald" : failed || notFound ? "amber" : "muted";

    return (
        <div className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-violet-500/25 bg-violet-500/10">
                    <Server className="size-[18px] text-violet-500 dark:text-violet-400" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">Intiface Engine</span>
                        <Badge
                            variant="outline"
                            className={`text-[9px] ${
                                tone === "emerald"
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                                    : tone === "amber"
                                      ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
                                      : ""
                            }`}
                        >
                            {status.status.toUpperCase()}
                        </Badge>
                        {external && (
                            <Badge variant="secondary" className="text-[9px]">
                                EXTERNAL
                            </Badge>
                        )}
                    </div>
                    <p className="text-[10.5px] text-muted-foreground">
                        {running
                            ? external
                                ? `Using the Intiface server already running on port ${status.port}`
                                : `Managed by PES on port ${status.port}${
                                      status.pid ? ` · PID ${status.pid}` : ""
                                  }`
                            : notFound
                              ? status.last_error ||
                                "Intiface Engine was not found on this machine."
                              : failed
                                ? status.last_error || "Intiface failed to start."
                                : downloading
                                  ? "Downloading the official Intiface Engine (SHA-256 verified)..."
                                  : starting
                                    ? "Starting Intiface Engine..."
                                    : "Stopped. Start it to let PES connect your toys."}
                    </p>
                    {notFound && (
                        <div className="mt-1 flex flex-wrap items-center gap-3">
                            <a
                                href="https://github.com/buttplugio/buttplug/releases?q=intiface-engine"
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[10.5px] text-violet-500 hover:underline"
                            >
                                Download Intiface Engine
                                <ExternalLink className="size-3" />
                            </a>
                            <a
                                href="https://intiface.com/central/"
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:underline"
                            >
                                Intiface Central
                                <ExternalLink className="size-3" />
                            </a>
                        </div>
                    )}
                    {status.path && (
                        <code className="mt-1 block truncate rounded border bg-muted/30 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                            {status.path}
                        </code>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    {running && !external ? (
                        <>
                            <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-7 px-2 text-[11px]"
                                onClick={onRestart}
                            >
                                <RefreshCw className="size-3" />
                                Restart
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className="h-7 px-2 text-[11px]"
                                onClick={onStop}
                            >
                                <Power className="size-3" />
                                Stop
                            </Button>
                        </>
                    ) : (
                        <Button
                            type="button"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            disabled={busy}
                            onClick={onStart}
                        >
                            <Power className="size-3" />
                            {running ? "Reconnect" : "Start"}
                        </Button>
                    )}
                </div>
            </div>
            {running && !external && (
                <p className="mt-2 text-[10px] text-muted-foreground/60">
                    PES found or downloaded the official Intiface Engine, starts it on
                    demand and stops it when PES shuts down. The auto-created “Local
                    Intiface” node is scanned automatically.
                </p>
            )}
        </div>
    );
}

function NodeCard({
    node,
    onScan,
    onReconnect,
    onRotate,
    onDelete,
}: {
    node: LovenseNodeInfo;
    onScan: () => void;
    onReconnect: () => void;
    onRotate: () => void;
    onDelete: () => void;
}) {
    const online = node.status === "online";
    return (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div className="flex items-start gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-violet-500/25 bg-violet-500/10">
                    {node.kind === "relay" ? (
                        <Radio className="size-[18px] text-violet-500 dark:text-violet-400" />
                    ) : (
                        <Link2 className="size-[18px] text-violet-500 dark:text-violet-400" />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{node.name}</span>
                        <Badge variant="outline" className="text-[9px]">
                            {node.kind.toUpperCase()}
                        </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                        {online ? (
                            <Wifi className="size-3 text-emerald-500" />
                        ) : (
                            <WifiOff className="size-3 text-muted-foreground/50" />
                        )}
                        <span>{online ? "Online" : node.last_error ?? "Offline"}</span>
                        {node.latency_ms != null && (
                            <>
                                <span>·</span>
                                <span className="tabular-nums">{node.latency_ms} ms</span>
                            </>
                        )}
                    </div>
                </div>
                {node.scanning && (
                    <Badge variant="secondary" className="animate-pulse text-[9px]">
                        SCANNING
                    </Badge>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
                <Badge variant="outline" className="gap-1 text-[9px]">
                    <Vibrate className="size-3" />
                    {plural(node.devices, "device")}
                </Badge>
                {node.kind === "direct" && node.url && (
                    <code className="truncate rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[9.5px]">
                        {node.url}
                    </code>
                )}
                {node.kind === "relay" && node.token_prefix && (
                    <code className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[9.5px]">
                        token {node.token_prefix}…
                    </code>
                )}
            </div>

            <div className="flex items-center gap-1.5">
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2 text-[11px]"
                    disabled={!online || node.scanning}
                    onClick={onScan}
                >
                    <RefreshCw className="size-3" />
                    Scan
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2 text-[11px]"
                    onClick={onReconnect}
                >
                    <Activity className="size-3" />
                    Reconnect
                </Button>
                {node.kind === "relay" && (
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-[11px]"
                        onClick={onRotate}
                    >
                        <ShieldCheck className="size-3" />
                        Token
                    </Button>
                )}
                <div className="flex-1" />
                <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="h-7 px-2 text-[11px]"
                    onClick={onDelete}
                >
                    <Trash2 className="size-3" />
                </Button>
            </div>
        </div>
    );
}

function PatternCard({
    pattern,
    run,
    onPlay,
    onStop,
    onEdit,
    onDelete,
}: {
    pattern: LovensePatternSummary;
    run?: LovenseRunInfo;
    onPlay: () => void;
    onStop: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    return (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div className="flex items-start gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-violet-500/25 bg-violet-500/10">
                    <Diamond className="size-[18px] text-violet-500 dark:text-violet-400" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{pattern.name}</span>
                        {pattern.built_in && (
                            <Badge variant="outline" className="text-[9px]">
                                BUILT-IN
                            </Badge>
                        )}
                    </div>
                    <p className="line-clamp-2 text-[10.5px] text-muted-foreground">
                        {pattern.description || "No description"}
                    </p>
                </div>
                {run && (
                    <Badge className="animate-pulse gap-1 text-[9px]">
                        <Activity className="size-3" />
                        LIVE
                    </Badge>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="text-[9px]">
                    {Math.round((pattern.duration_ms ?? 0) / 1000)}s
                </Badge>
                {pattern.tags.slice(0, 4).map(tag => (
                    <Badge key={tag} variant="outline" className="gap-0.5 text-[9px]">
                        <Tag className="size-2.5" />
                        {tag}
                    </Badge>
                ))}
            </div>

            <div className="flex items-center gap-1.5">
                {run ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="h-7 px-2 text-[11px]"
                        onClick={onStop}
                    >
                        <Square className="size-3" />
                        Stop
                    </Button>
                ) : (
                    <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={onPlay}
                    >
                        <Play className="size-3" />
                        Play
                    </Button>
                )}
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2 text-[11px]"
                    onClick={onEdit}
                >
                    <Pencil className="size-3" />
                    Edit
                </Button>
                <div className="flex-1" />
                {!pattern.built_in && (
                    <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="h-7 px-2 text-[11px]"
                        onClick={onDelete}
                    >
                        <Trash2 className="size-3" />
                    </Button>
                )}
            </div>
        </div>
    );
}

export function Lovense() {
    const { sendCommand } = useWebSocket();
    const lovense = useAppSelector(state => state.lovense);
    const lovenseEntry = useAppSelector(state =>
        integrationsSelectors.selectById(state, "lovense")
    );
    const [tab, setTab] = useState<"devices" | "patterns">("devices");
    const [addNodeOpen, setAddNodeOpen] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editorDetail, setEditorDetail] = useState<LovensePatternDetail | null>(null);
    const [pendingEditId, setPendingEditId] = useState<string | null>(null);
    const [tokenDialog, setTokenDialog] = useState<{
        nodeId: string;
        token: string;
    } | null>(null);

    const send = sendCommand as unknown as (
        type: string,
        payload?: Record<string, unknown>
    ) => Promise<{ status: string; message?: string | null; token?: string | null; node_id?: string | null }>;

    const nodeById = useMemo(
        () => new Map(lovense.nodes.map(node => [node.id, node])),
        [lovense.nodes]
    );

    const refresh = useCallback(async () => {
        await send("lovense:pattern_list");
        await send("lovense:health");
    }, [send]);

    const relayBase = useMemo(() => {
        const endpoint = lovenseEntry?.endpoint ?? "";
        if (endpoint.includes("/lovense/relay")) {
            return endpoint.replace(/\/$/, "");
        }
        const configured = import.meta.env.VITE_WS_URL as string | undefined;
        if (configured) {
            return `${configured.replace(/\/$/, "")}/lovense/relay`;
        }
        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        return `${protocol}://${window.location.host}/lovense/relay`;
    }, [lovenseEntry?.endpoint]);

    useWebSocketEvent("lovense:pattern_detail", detail => {
        if (detail.id === pendingEditId) {
            setEditorDetail(detail);
            setEditorOpen(true);
            setPendingEditId(null);
        }
    });

    const openPattern = (pattern: LovensePatternSummary) => {
        const cached = lovense.details[pattern.id];
        if (cached) {
            setEditorDetail(cached);
            setEditorOpen(true);
            return;
        }
        setPendingEditId(pattern.id);
        void send("lovense:pattern_detail", { pattern_id: pattern.id });
    };

    const stopAll = async () => {
        const result = await send("lovense:stop_all");
        if (result.status !== "ok") toast.error(result.message ?? "Stop failed");
        else toast.success("All Lovense outputs stopped");
    };

    const intifaceAction = async (
        type:
            | "lovense:intiface_start"
            | "lovense:intiface_stop"
            | "lovense:intiface_restart"
    ) => {
        const result = await send(type);
        if (result.status !== "ok") {
            toast.error(result.message ?? "Intiface command failed", { duration: 10000 });
        }
    };

    const rotateToken = async (nodeId: string) => {
        const result = await send("lovense:node_token", { node_id: nodeId });
        if (result.status !== "ok" || !result.token) {
            toast.error(result.message ?? "Failed to rotate token");
            return;
        }
        setTokenDialog({ nodeId, token: result.token });
    };

    const health = lovense.health;

    return (
        <div className="space-y-4">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3 px-5">
                <div>
                    <h1 className="font-syne text-xl font-extrabold sm:text-2xl lg:text-[26px]">
                        Lovense
                    </h1>
                    <div className="text-xs text-muted-foreground">
                        Buttplug devices, real-time control and patterns
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <StatChip
                        icon={Wifi}
                        label={`${health?.nodes_online ?? 0}/${health?.nodes ?? 0} nodes`}
                        tone="text-emerald-500"
                    />
                    <StatChip
                        icon={Vibrate}
                        label={`${health?.devices_online ?? 0}/${health?.devices ?? 0} devices`}
                        tone="text-violet-500"
                    />
                    <StatChip
                        icon={Activity}
                        label={`${plural(health?.runs ?? 0, "run")}`}
                    />
                    {health?.latency_ms != null && (
                        <StatChip
                            icon={BatteryCharging}
                            label={`${health.latency_ms} ms`}
                        />
                    )}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void refresh()}
                    >
                        <RefreshCw className="size-3.5" />
                        Refresh
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => void stopAll()}
                    >
                        <Square className="size-3.5" />
                        Stop all
                    </Button>
                </div>
            </div>

            <div className="px-5">
                <Tabs value={tab} onValueChange={value => setTab(value as typeof tab)}>
                    <TabsList className="mb-4">
                        <TabsTrigger value="devices">
                            Devices · {lovense.devices.length}
                        </TabsTrigger>
                        <TabsTrigger value="patterns">
                            Patterns · {lovense.patterns.length}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="devices" className="space-y-5">
                        <IntifaceCard
                            status={lovense.intiface}
                            onStart={() => void intifaceAction("lovense:intiface_start")}
                            onStop={() => void intifaceAction("lovense:intiface_stop")}
                            onRestart={() =>
                                void intifaceAction("lovense:intiface_restart")
                            }
                        />

                        <section className="space-y-3">
                            <div className="flex items-center gap-2">
                                <h2 className="text-xs font-semibold">Nodes</h2>
                                <span className="text-[11px] text-muted-foreground/60">
                                    Intiface servers
                                </span>
                                <div className="flex-1" />
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => setAddNodeOpen(true)}
                                >
                                    <Plus className="size-3" />
                                    Add node
                                </Button>
                            </div>
                            {lovense.nodes.length === 0 ? (
                                <div className="rounded-xl border border-dashed p-6 text-center">
                                    <Blocks className="mx-auto mb-2 size-6 text-muted-foreground/50" />
                                    <p className="text-sm font-medium">No Buttplug node yet</p>
                                    <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                                        Start Intiface Central, then add a direct node for
                                        ws://127.0.0.1:12345. For a remote machine, add a relay
                                        node and run the companion next to its Intiface.
                                    </p>
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="mt-3"
                                        onClick={() => setAddNodeOpen(true)}
                                    >
                                        <Plus className="size-3" />
                                        Add your first node
                                    </Button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                                    {lovense.nodes.map(node => (
                                        <NodeCard
                                            key={node.id}
                                            node={node}
                                            onScan={() =>
                                                void send("lovense:scan", {
                                                    node_id: node.id,
                                                })
                                            }
                                            onReconnect={() =>
                                                void send("lovense:node_reconnect", {
                                                    node_id: node.id,
                                                })
                                            }
                                            onRotate={() => void rotateToken(node.id)}
                                            onDelete={() => {
                                                if (
                                                    !window.confirm(
                                                        `Delete node "${node.name}" and its devices?`
                                                    )
                                                )
                                                    return;
                                                void send("lovense:node_delete", {
                                                    node_id: node.id,
                                                }).then(refresh);
                                            }}
                                        />
                                    ))}
                                </div>
                            )}
                        </section>

                        <Separator />

                        <section className="space-y-3">
                            <div className="flex items-center gap-2">
                                <h2 className="text-xs font-semibold">Devices</h2>
                                <span className="text-[11px] text-muted-foreground/60">
                                    {plural(lovense.devices.length, "device")} discovered
                                </span>
                                <div className="flex-1" />
                                {lovense.nodes.length > 0 && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        onClick={() =>
                                            lovense.nodes.forEach(node =>
                                                void send("lovense:scan", {
                                                    node_id: node.id,
                                                })
                                            )
                                        }
                                    >
                                        <RefreshCw className="size-3" />
                                        Scan all
                                    </Button>
                                )}
                            </div>
                            {lovense.devices.length === 0 ? (
                                <div className="rounded-xl border border-dashed p-6 text-center">
                                    <Cpu className="mx-auto mb-2 size-6 text-muted-foreground/50" />
                                    <p className="text-sm font-medium">No device connected</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Start a scan from a node. Turn the toy on and keep it
                                        close to the machine running Intiface.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                                    {lovense.devices.map(device => (
                                        <DeviceCard
                                            key={device.id}
                                            device={device}
                                            nodeName={nodeById.get(device.node_id)?.name}
                                            globalCap={lovense.settings?.max_intensity_pct ?? 70}
                                            onChanged={() => void refresh()}
                                        />
                                    ))}
                                </div>
                            )}
                        </section>
                    </TabsContent>

                    <TabsContent value="patterns" className="space-y-5">
                        <section className="space-y-3">
                            <div className="flex items-center gap-2">
                                <h2 className="text-xs font-semibold">Active runs</h2>
                                <span className="text-[11px] text-muted-foreground/60">
                                    {plural(lovense.runs.length, "run")}
                                </span>
                                <div className="flex-1" />
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => {
                                        setEditorDetail(null);
                                        setEditorOpen(true);
                                    }}
                                >
                                    <Plus className="size-3" />
                                    New pattern
                                </Button>
                            </div>
                            {lovense.runs.length === 0 ? (
                                <p className="text-xs italic text-muted-foreground/60">
                                    No pattern is running.
                                </p>
                            ) : (
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    {lovense.runs.map(run => (
                                        <div
                                            key={run.id}
                                            className="flex items-center gap-3 rounded-xl border bg-card p-3"
                                        >
                                            <Activity className="size-4 animate-pulse text-violet-500" />
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-xs font-semibold">
                                                    {run.pattern_name}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground">
                                                    {Math.round(run.elapsed_s)}s ·{" "}
                                                    {run.loops} loop
                                                    {run.loops === 1 ? "" : "s"} ·{" "}
                                                    {run.origin}
                                                </div>
                                            </div>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="destructive"
                                                className="h-7 px-2 text-[11px]"
                                                onClick={() =>
                                                    void send("lovense:pattern_stop", {
                                                        run_id: run.id,
                                                    })
                                                }
                                            >
                                                <Square className="size-3" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <Separator />

                        <section className="space-y-3">
                            <div className="flex items-center gap-2">
                                <h2 className="text-xs font-semibold">Library</h2>
                                <span className="text-[11px] text-muted-foreground/60">
                                    {plural(lovense.patterns.length, "pattern")}
                                </span>
                            </div>
                            {lovense.patterns.length === 0 ? (
                                <p className="text-xs italic text-muted-foreground/60">
                                    No pattern saved yet.
                                </p>
                            ) : (
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                                    {lovense.patterns.map(pattern => (
                                        <PatternCard
                                            key={pattern.id}
                                            pattern={pattern}
                                            run={lovense.runs.find(
                                                run => run.pattern_id === pattern.id
                                            )}
                                            onPlay={() =>
                                                void send("lovense:pattern_play", {
                                                    pattern_id: pattern.id,
                                                    targets: { all: true },
                                                    duration: -1,
                                                    replace: true,
                                                })
                                            }
                                            onStop={() =>
                                                void send("lovense:pattern_stop", {
                                                    pattern_id: pattern.id,
                                                })
                                            }
                                            onEdit={() => openPattern(pattern)}
                                            onDelete={() => {
                                                if (
                                                    !window.confirm(
                                                        `Delete pattern "${pattern.name}"?`
                                                    )
                                                )
                                                    return;
                                                void send("lovense:pattern_delete", {
                                                    pattern_id: pattern.id,
                                                }).then(refresh);
                                            }}
                                        />
                                    ))}
                                </div>
                            )}
                        </section>
                    </TabsContent>
                </Tabs>
            </div>

            <AddNodeDialog
                open={addNodeOpen}
                onOpenChange={setAddNodeOpen}
                onSaved={() => void refresh()}
            />

            <PatternEditor
                open={editorOpen}
                detail={editorDetail}
                onOpenChange={setEditorOpen}
                onSaved={() => void refresh()}
            />

            <Dialog
                open={tokenDialog !== null}
                onOpenChange={open => !open && setTokenDialog(null)}
            >
                <DialogContent className="sm:max-w-[560px]">
                    <DialogHeader>
                        <DialogTitle>Companion token</DialogTitle>
                        <DialogDescription>
                            This token is shown once. Rotating it disconnects the current
                            companion.
                        </DialogDescription>
                    </DialogHeader>
                    {tokenDialog && (
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
                                    Node
                                </span>
                                <code className="block rounded border bg-muted/30 p-2 font-mono text-[11px]">
                                    {tokenDialog.nodeId}
                                </code>
                            </div>
                            <div className="space-y-1">
                                <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
                                    Command
                                </span>
                                <pre className="overflow-auto rounded border bg-muted/30 p-2 text-[10.5px] leading-relaxed">
                                    {`uv run --with websockets python apps/app/companion/lovense_companion.py --server ${relayBase}/${tokenDialog.nodeId} --token ${tokenDialog.token} --intiface ws://127.0.0.1:12345`}
                                </pre>
                            </div>
                            <Badge variant="outline" className="gap-1 text-[10px]">
                                <ShieldCheck className="size-3 text-emerald-500" />
                                Store the token on the companion machine
                            </Badge>
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void navigator.clipboard.writeText(tokenDialog?.token ?? "")}
                        >
                            <Copy className="size-3" />
                            Copy token
                        </Button>
                        <Button type="button" onClick={() => setTokenDialog(null)}>
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
