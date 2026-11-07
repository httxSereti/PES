import { useMemo, useState } from "react";
import {
    Activity,
    Check,
    ChevronRight,
    Copy,
    ExternalLink,
    Link2,
    Plus,
    Power,
    Radio,
    RefreshCw,
    Server,
    ShieldCheck,
    Trash2,
    Vibrate,
    Wifi,
    WifiOff,
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
import { cn } from "@pes/ui/lib/utils";

import { AddNodeDialog } from "./add-node-dialog";
import { DeviceCard } from "./device-card";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import { integrationsSelectors } from "@/store/slices/integrationsSlice";
import type {
    LovenseDeviceInfo,
    LovenseIntifaceStatus,
    LovenseNodeInfo,
} from "@/types";

interface LovenseSetupProps {
    devices: LovenseDeviceInfo[];
    nodes: LovenseNodeInfo[];
    intiface: LovenseIntifaceStatus | null;
    globalCap: number;
    onChanged: () => void;
}

export function LovenseSetup({
    devices,
    nodes,
    intiface,
    globalCap,
    onChanged,
}: LovenseSetupProps) {
    const { send, sendCommand } = useWebSocket();
    const [addNodeOpen, setAddNodeOpen] = useState(false);
    const [tokenDialog, setTokenDialog] = useState<{
        nodeId: string;
        token: string;
    } | null>(null);
    const lovenseEntry = useAppSelector((state) =>
        integrationsSelectors.selectById(state, "lovense"),
    );
    const nodeById = useMemo(
        () => new Map(nodes.map((node) => [node.id, node])),
        [nodes],
    );
    const onlineNodes = nodes.filter((node) => node.status === "online");
    const scanning = nodes.some((node) => node.scanning);
    const engineRunning = Boolean(intiface?.running);

    const relayBase = useMemo(() => {
        const endpoint = lovenseEntry?.endpoint ?? "";
        if (endpoint.includes("/lovense/relay"))
            return endpoint.replace(/\/$/, "");
        const configured = import.meta.env.VITE_WS_URL as string | undefined;
        if (configured) return `${configured.replace(/\/$/, "")}/lovense/relay`;
        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        return `${protocol}://${window.location.host}/lovense/relay`;
    }, [lovenseEntry?.endpoint]);

    const intifaceAction = async (
        type:
            | "lovense:intiface_start"
            | "lovense:intiface_stop"
            | "lovense:intiface_restart",
    ) => {
        try {
            const result = await sendCommand(type);
            if (result.status !== "ok") {
                toast.error(result.message ?? "Intiface command failed", {
                    duration: 10000,
                });
                return;
            }
            onChanged();
        } catch {
            toast.error("Intiface command timed out", { duration: 10000 });
        }
    };

    const scanAll = () => {
        if (onlineNodes.length === 0) {
            toast.error("No Intiface node is online");
            return;
        }
        for (const node of onlineNodes)
            send("lovense:scan", { node_id: node.id, seconds: null });
        toast.success("Scanning for nearby toys…");
    };

    const rotateToken = async (nodeId: string) => {
        const result = await sendCommand("lovense:node_token", {
            node_id: nodeId,
        });
        if (result.status !== "ok" || !result.token) {
            toast.error(result.message ?? "Failed to rotate token");
            return;
        }
        setTokenDialog({ nodeId, token: result.token });
    };

    const copy = async (value: string, label: string) => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success(`${label} copied`);
        } catch {
            toast.error("Unable to copy");
        }
    };

    return (
        <div className="space-y-5">
            <section className="overflow-hidden rounded-[24px] border border-violet-500/20 bg-card/80">
                <div className="bg-gradient-to-br from-violet-500/[0.1] to-transparent p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                        <span
                            className={cn(
                                "grid size-12 shrink-0 place-items-center rounded-2xl border",
                                engineRunning
                                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-500"
                                    : "border-violet-500/25 bg-violet-500/10 text-violet-500",
                            )}
                        >
                            <Server className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="font-syne text-lg font-extrabold">
                                    Connection center
                                </h2>
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        "text-[9px]",
                                        engineRunning
                                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                                            : "text-muted-foreground",
                                    )}
                                >
                                    {(
                                        intiface?.status ?? "unknown"
                                    ).toUpperCase()}
                                </Badge>
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                {engineRunning
                                    ? `Intiface is ready on port ${intiface?.port ?? 12345}. Turn on your toy and scan.`
                                    : intiface?.status === "downloading"
                                      ? "Downloading the official Intiface Engine…"
                                      : intiface?.last_error ||
                                        "PES uses Intiface to connect Lovense and other Buttplug-compatible toys."}
                            </p>
                        </div>
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-2">
                        {[
                            { label: "Engine", done: engineRunning },
                            {
                                label: "Scan",
                                done: scanning || devices.length > 0,
                            },
                            {
                                label: "Play",
                                done: devices.some((device) => device.online),
                            },
                        ].map((step, index) => (
                            <div
                                key={step.label}
                                className={cn(
                                    "flex min-h-14 items-center justify-center gap-2 rounded-xl border px-2 text-[11px] font-medium",
                                    step.done
                                        ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-600 dark:text-emerald-400"
                                        : "bg-background/35 text-muted-foreground",
                                )}
                            >
                                <span
                                    className={cn(
                                        "grid size-5 place-items-center rounded-full border text-[9px]",
                                        step.done &&
                                            "border-emerald-500/30 bg-emerald-500/15",
                                    )}
                                >
                                    {step.done ? (
                                        <Check className="size-3" />
                                    ) : (
                                        index + 1
                                    )}
                                </span>
                                {step.label}
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                        {!engineRunning ? (
                            <Button
                                type="button"
                                className="h-11 flex-1 rounded-xl bg-violet-600 text-white"
                                disabled={
                                    intiface?.status === "starting" ||
                                    intiface?.status === "downloading"
                                }
                                onClick={() =>
                                    void intifaceAction(
                                        "lovense:intiface_start",
                                    )
                                }
                            >
                                <Power className="size-4" />
                                {intiface?.status === "starting"
                                    ? "Starting…"
                                    : "Start Intiface"}
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                className="h-11 flex-1 rounded-xl bg-violet-600 text-white"
                                disabled={onlineNodes.length === 0 || scanning}
                                onClick={scanAll}
                            >
                                <RefreshCw
                                    className={cn(
                                        "size-4",
                                        scanning && "animate-spin",
                                    )}
                                />
                                {scanning ? "Scanning…" : "Scan for toys"}
                            </Button>
                        )}
                        {engineRunning && !intiface?.external && (
                            <>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-11 rounded-xl"
                                    onClick={() =>
                                        void intifaceAction(
                                            "lovense:intiface_restart",
                                        )
                                    }
                                >
                                    <Activity className="size-4" />
                                    Restart
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="size-11 rounded-xl"
                                    aria-label="Stop Intiface"
                                    onClick={() =>
                                        void intifaceAction(
                                            "lovense:intiface_stop",
                                        )
                                    }
                                >
                                    <Power className="size-4 text-red-500" />
                                </Button>
                            </>
                        )}
                    </div>
                    {intiface?.status === "not_found" && (
                        <a
                            href="https://intiface.com/central/"
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex items-center gap-1.5 text-xs text-violet-500 hover:underline"
                        >
                            Get Intiface Central
                            <ExternalLink className="size-3" />
                        </a>
                    )}
                </div>
            </section>

            <section className="space-y-3">
                <div className="flex items-center gap-3">
                    <div className="flex-1">
                        <h2 className="text-sm font-semibold">Your toys</h2>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {devices.filter((device) => device.online).length}{" "}
                            online · {devices.length} discovered
                        </p>
                    </div>
                    {onlineNodes.length > 0 && (
                        <Button
                            type="button"
                            variant="outline"
                            className="h-10 rounded-xl"
                            onClick={scanAll}
                            disabled={scanning}
                        >
                            <RefreshCw
                                className={cn(
                                    "size-3.5",
                                    scanning && "animate-spin",
                                )}
                            />
                            Scan
                        </Button>
                    )}
                </div>
                {devices.length === 0 ? (
                    <div className="grid min-h-56 place-items-center rounded-[22px] border border-dashed p-7 text-center">
                        <div className="max-w-sm">
                            <Vibrate className="mx-auto mb-3 size-7 text-violet-500/50" />
                            <p className="text-sm font-semibold">
                                No toys discovered yet
                            </p>
                            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                                Turn your toy on, keep it near the machine
                                running Intiface, then start a scan.
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                className="mt-4"
                                onClick={scanAll}
                            >
                                Scan now
                                <ChevronRight className="size-3.5" />
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                        {devices.map((device) => (
                            <DeviceCard
                                key={device.id}
                                device={device}
                                nodeName={nodeById.get(device.node_id)?.name}
                                globalCap={globalCap}
                                onChanged={onChanged}
                            />
                        ))}
                    </div>
                )}
            </section>

            <details className="group rounded-[22px] border bg-card/60">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4">
                    <span className="grid size-9 place-items-center rounded-xl bg-muted text-muted-foreground">
                        <Server className="size-4" />
                    </span>
                    <span className="flex-1">
                        <span className="block text-xs font-semibold">
                            Advanced connections
                        </span>
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                            {nodes.length} Intiface{" "}
                            {nodes.length === 1 ? "node" : "nodes"}, direct URLs
                            and relay companions
                        </span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
                </summary>
                <div className="space-y-3 border-t p-4">
                    <div className="flex items-center justify-between gap-3">
                        <p className="max-w-lg text-[11px] leading-relaxed text-muted-foreground">
                            Only change these settings if PES cannot reach
                            Intiface automatically. Never expose an
                            unauthenticated Intiface server publicly.
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            className="h-9 shrink-0"
                            onClick={() => setAddNodeOpen(true)}
                        >
                            <Plus className="size-3.5" />
                            Add node
                        </Button>
                    </div>
                    {nodes.map((node) => {
                        const online = node.status === "online";
                        return (
                            <article
                                key={node.id}
                                className="rounded-2xl border bg-background/40 p-3.5"
                            >
                                <div className="flex items-start gap-3">
                                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-500">
                                        {node.kind === "relay" ? (
                                            <Radio className="size-4" />
                                        ) : (
                                            <Link2 className="size-4" />
                                        )}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="truncate text-xs font-semibold">
                                                {node.name}
                                            </h3>
                                            <Badge
                                                variant="outline"
                                                className="text-[8px]"
                                            >
                                                {node.kind.toUpperCase()}
                                            </Badge>
                                        </div>
                                        <p className="mt-1 flex items-center gap-1.5 truncate text-[10px] text-muted-foreground">
                                            {online ? (
                                                <Wifi className="size-3 text-emerald-500" />
                                            ) : (
                                                <WifiOff className="size-3" />
                                            )}
                                            {online
                                                ? `Online${node.latency_ms != null ? ` · ${node.latency_ms} ms` : ""}`
                                                : (node.last_error ??
                                                  "Offline")}
                                        </p>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground">
                                        {node.devices} toys
                                    </span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        disabled={!online || node.scanning}
                                        onClick={() =>
                                            send("lovense:scan", {
                                                node_id: node.id,
                                                seconds: null,
                                            })
                                        }
                                    >
                                        <RefreshCw
                                            className={cn(
                                                "size-3.5",
                                                node.scanning && "animate-spin",
                                            )}
                                        />
                                        Scan
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            void sendCommand(
                                                "lovense:node_reconnect",
                                                {
                                                    node_id: node.id,
                                                },
                                            )
                                        }
                                    >
                                        <Activity className="size-3.5" />
                                        Reconnect
                                    </Button>
                                    {node.kind === "relay" && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() =>
                                                void rotateToken(node.id)
                                            }
                                        >
                                            <ShieldCheck className="size-3.5" />
                                            Token
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        className="ml-auto text-red-500"
                                        aria-label={`Delete ${node.name}`}
                                        onClick={() => {
                                            if (
                                                !window.confirm(
                                                    `Delete node “${node.name}” and its devices?`,
                                                )
                                            )
                                                return;
                                            void sendCommand(
                                                "lovense:node_delete",
                                                {
                                                    node_id: node.id,
                                                },
                                            ).then((result) => {
                                                if (result.status !== "ok")
                                                    toast.error(
                                                        result.message ??
                                                            "Unable to delete node",
                                                    );
                                                onChanged();
                                            });
                                        }}
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            </article>
                        );
                    })}
                </div>
            </details>

            <AddNodeDialog
                open={addNodeOpen}
                onOpenChange={setAddNodeOpen}
                onSaved={onChanged}
            />

            <Dialog
                open={tokenDialog !== null}
                onOpenChange={(open) => !open && setTokenDialog(null)}
            >
                <DialogContent className="sm:max-w-[560px]">
                    <DialogHeader>
                        <DialogTitle>Companion token</DialogTitle>
                        <DialogDescription>
                            This token is shown once. Rotating it disconnects
                            the current companion.
                        </DialogDescription>
                    </DialogHeader>
                    {tokenDialog && (
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                                    Command
                                </span>
                                <pre className="max-h-48 overflow-auto rounded-xl border bg-muted/30 p-3 text-[10px] leading-relaxed">
                                    {`uv run --with websockets python apps/app/companion/lovense_companion.py --server ${relayBase}/${tokenDialog.nodeId} --token ${tokenDialog.token} --intiface ws://127.0.0.1:12345`}
                                </pre>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full"
                                onClick={() =>
                                    void copy(
                                        `uv run --with websockets python apps/app/companion/lovense_companion.py --server ${relayBase}/${tokenDialog.nodeId} --token ${tokenDialog.token} --intiface ws://127.0.0.1:12345`,
                                        "Command",
                                    )
                                }
                            >
                                <Copy className="size-4" />
                                Copy companion command
                            </Button>
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            onClick={() => setTokenDialog(null)}
                        >
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
