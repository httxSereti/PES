import { useMemo, useState } from "react";
import { Copy, Link2, Radio, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@pes/ui/components/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@pes/ui/components/dialog";
import { Input } from "@pes/ui/components/input";
import { Label } from "@pes/ui/components/label";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import { integrationsSelectors } from "@/store/slices/integrationsSlice";

type NodeKind = "direct" | "relay";

export function AddNodeDialog({
    open,
    onOpenChange,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}) {
    const { sendCommand } = useWebSocket();
    const entry = useAppSelector(state =>
        integrationsSelectors.selectById(state, "lovense")
    );
    const [name, setName] = useState("");
    const [kind, setKind] = useState<NodeKind>("direct");
    const [url, setUrl] = useState("ws://127.0.0.1:12345");
    const [saving, setSaving] = useState(false);
    const [pairing, setPairing] = useState<{
        nodeId: string;
        token: string;
        command: string;
    } | null>(null);

    const relayBase = useMemo(() => {
        const endpoint = entry?.endpoint ?? "";
        if (endpoint.includes("/lovense/relay")) {
            return endpoint.replace(/\/$/, "");
        }
        const configured = import.meta.env.VITE_WS_URL as string | undefined;
        if (configured) {
            return `${configured.replace(/\/$/, "")}/lovense/relay`;
        }
        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        return `${protocol}://${window.location.host}/lovense/relay`;
    }, [entry?.endpoint]);

    const reset = () => {
        setName("");
        setKind("direct");
        setUrl("ws://127.0.0.1:12345");
        setPairing(null);
    };

    const save = async () => {
        if (!name.trim()) {
            toast.error("Give the node a name");
            return;
        }
        setSaving(true);
        try {
            const result = await sendCommand("lovense:node_save", {
                name: name.trim(),
                kind,
                url: kind === "direct" ? url.trim() : null,
                enabled: true,
            });
            if (result.status !== "ok") {
                toast.error(result.message ?? "Failed to save node");
                return;
            }
            const nodeId = result.node_id ?? "";
            if (kind === "relay" && result.token) {
                const server = `${relayBase}/${nodeId}`;
                setPairing({
                    nodeId,
                    token: result.token,
                    command: `uv run --with websockets python apps/app/companion/lovense_companion.py --server ${server} --token ${result.token} --intiface ws://127.0.0.1:12345`,
                });
            } else {
                toast.success("Node saved");
                reset();
                onOpenChange(false);
            }
            onSaved();
        } finally {
            setSaving(false);
        }
    };

    const copy = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success("Copied");
        } catch {
            toast.error("Failed to copy");
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={next => {
                if (!next) reset();
                onOpenChange(next);
            }}
        >
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>Add a Buttplug node</DialogTitle>
                    <DialogDescription>
                        A node is an Intiface Central / Engine server. Use a direct URL when
                        PES can reach it, or a relay node when the devices are behind NAT.
                    </DialogDescription>
                </DialogHeader>

                {pairing ? (
                    <div className="space-y-4">
                        <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs">
                            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                            <div className="space-y-1">
                                <p className="font-medium">Relay node created</p>
                                <p className="text-muted-foreground">
                                    Run this on the machine that has Bluetooth. The token is
                                    shown once; rotate it from the node card if you lose it.
                                </p>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Companion command</Label>
                            <div className="flex items-start gap-2">
                                <pre className="max-h-40 flex-1 overflow-auto rounded-lg border bg-muted/40 p-2.5 text-[10.5px] leading-relaxed">
                                    {pairing.command}
                                </pre>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => void copy(pairing.command)}
                                >
                                    <Copy className="size-3" />
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Node token</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    readOnly
                                    value={pairing.token}
                                    className="font-mono text-[11px]"
                                />
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => void copy(pairing.token)}
                                >
                                    <Copy className="size-3" />
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label>Name</Label>
                            <Input
                                value={name}
                                placeholder="PC Camille"
                                onChange={event => setName(event.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setKind("direct")}
                                className={`rounded-lg border p-3 text-left transition-colors ${
                                    kind === "direct"
                                        ? "border-violet-500/50 bg-violet-500/10"
                                        : "hover:bg-muted/40"
                                }`}
                            >
                                <Link2 className="mb-1 size-4 text-violet-500" />
                                <div className="text-xs font-medium">Direct</div>
                                <div className="text-[10.5px] text-muted-foreground">
                                    PES connects to Intiface
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setKind("relay")}
                                className={`rounded-lg border p-3 text-left transition-colors ${
                                    kind === "relay"
                                        ? "border-violet-500/50 bg-violet-500/10"
                                        : "hover:bg-muted/40"
                                }`}
                            >
                                <Radio className="mb-1 size-4 text-violet-500" />
                                <div className="text-xs font-medium">Relay</div>
                                <div className="text-[10.5px] text-muted-foreground">
                                    Companion connects out
                                </div>
                            </button>
                        </div>

                        {kind === "direct" ? (
                            <div className="space-y-1.5">
                                <Label>Intiface URL</Label>
                                <Input
                                    value={url}
                                    placeholder="ws://127.0.0.1:12345"
                                    onChange={event => setUrl(event.target.value)}
                                    className="font-mono text-[11px]"
                                />
                                <p className="text-[10.5px] text-muted-foreground">
                                    Start the Intiface server first. For a remote server, use a
                                    VPN rather than exposing Intiface publicly.
                                </p>
                            </div>
                        ) : (
                            <p className="text-[11px] text-muted-foreground">
                                The companion will run next to the remote Intiface and connect
                                to PES. No port forwarding needed.
                            </p>
                        )}
                    </div>
                )}

                <DialogFooter>
                    {pairing ? (
                        <Button
                            type="button"
                            onClick={() => {
                                reset();
                                onOpenChange(false);
                            }}
                        >
                            Done
                        </Button>
                    ) : (
                        <>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => onOpenChange(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="button" disabled={saving} onClick={() => void save()}>
                                {saving ? "Saving..." : "Add node"}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
