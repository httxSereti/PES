import { useCallback, useState } from "react";
import {
    Activity,
    Library,
    Maximize2,
    Play,
    RefreshCw,
    Square,
    Vibrate,
    Wifi,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@pes/ui/components/button";
import { cn } from "@pes/ui/lib/utils";

import { LovenseKiosk } from "./lovense-kiosk";
import { LovensePlayer } from "./lovense-player";
import { LovenseSetup } from "./lovense-setup";
import { NowPlaying } from "./now-playing";
import { PatternEditor } from "./pattern-editor";
import { PatternLibrary } from "./pattern-library";
import { useLovenseController } from "./use-lovense-controller";
import { useWebSocket, useWebSocketEvent } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import type { LovensePatternDetail, LovensePatternSummary } from "@/types";

type LovenseTab = "play" | "patterns" | "toys";

export function Lovense() {
    const { sendCommand } = useWebSocket();
    const lovense = useAppSelector((state) => state.lovense);
    const [tab, setTab] = useState<LovenseTab>("play");
    const [kioskOpen, setKioskOpen] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editorDetail, setEditorDetail] =
        useState<LovensePatternDetail | null>(null);
    const [pendingEditId, setPendingEditId] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const controller = useLovenseController(
        lovense.devices,
        lovense.settings?.max_intensity_pct ?? 70,
        lovense.settings?.manual_hold_seconds ?? 60,
    );

    const refresh = useCallback(async () => {
        setRefreshing(true);
        try {
            const [patterns, health] = await Promise.all([
                sendCommand("lovense:pattern_list"),
                sendCommand("lovense:health"),
            ]);
            if (patterns.status !== "ok" || health.status !== "ok") {
                toast.error("Some Lovense data could not be refreshed");
            }
        } catch {
            // The live WebSocket snapshot will refresh the page after reconnection.
        } finally {
            setRefreshing(false);
        }
    }, [sendCommand]);
    const changed = useCallback(() => void refresh(), [refresh]);

    useWebSocketEvent("lovense:pattern_detail", (detail) => {
        if (detail.id !== pendingEditId) return;
        setEditorDetail(detail);
        setEditorOpen(true);
        setPendingEditId(null);
    });

    const openPattern = (pattern: LovensePatternSummary) => {
        const cached = lovense.details[pattern.id];
        if (cached) {
            setEditorDetail(cached);
            setEditorOpen(true);
            return;
        }
        setPendingEditId(pattern.id);
        void sendCommand("lovense:pattern_detail", {
            pattern_id: pattern.id,
        }).catch(() => {
            setPendingEditId(null);
            toast.error("Unable to load pattern");
        });
    };

    const createPattern = () => {
        setEditorDetail(null);
        setEditorOpen(true);
    };

    const openKiosk = async () => {
        setKioskOpen(true);
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen?.();
            }
        } catch {
            // The immersive overlay remains available when browser fullscreen is denied.
        }
    };

    const closeKiosk = useCallback(() => {
        setKioskOpen(false);
        if (document.fullscreenElement) {
            void document.exitFullscreen().catch(() => undefined);
        }
    }, []);

    const changeTab = (next: LovenseTab) => {
        if (next !== "play" && controller.manualActive) {
            void controller.stopTargets(controller.selectedDeviceIds);
        }
        setTab(next);
    };
    const openSetup = () => changeTab("toys");
    const openSetupFromKiosk = () => {
        closeKiosk();
        changeTab("toys");
    };

    const tabs: {
        id: LovenseTab;
        label: string;
        icon: typeof Play;
        count?: number;
    }[] = [
        { id: "play", label: "Player", icon: Play },
        {
            id: "patterns",
            label: "Patterns",
            icon: Library,
            count: lovense.patterns.length,
        },
        {
            id: "toys",
            label: "Toys",
            icon: Vibrate,
            count: lovense.devices.length,
        },
    ];

    return (
        <div className="relative mx-auto w-full max-w-[1500px] space-y-4 px-3 pb-24 sm:px-5 sm:pb-28 md:pb-16">
            <header className="flex flex-wrap items-center justify-between gap-3 px-1 pt-1">
                <div>
                    <div className="flex items-center gap-2.5">
                        <h1 className="font-syne text-2xl font-extrabold tracking-tight sm:text-[28px]">
                            Toy Player
                        </h1>
                        <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[9px] font-bold tracking-[0.14em] text-violet-500">
                            LIVE
                        </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                        Your toys. Your rhythm. One simple control surface.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="hidden items-center gap-3 rounded-xl border bg-card/60 px-3 py-2 text-[11px] text-muted-foreground sm:flex">
                        <span className="flex items-center gap-1.5">
                            <Wifi className="size-3.5 text-emerald-500" />
                            {lovense.health?.devices_online ?? 0}/
                            {lovense.health?.devices ?? 0} online
                        </span>
                        <span className="h-3 w-px bg-border" />
                        <span className="flex items-center gap-1.5">
                            <Activity className="size-3.5 text-fuchsia-500" />
                            {lovense.runs.length} playing
                        </span>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-10 rounded-xl"
                        aria-label="Refresh Lovense data"
                        disabled={refreshing}
                        onClick={() => void refresh()}
                    >
                        <RefreshCw
                            className={cn(
                                "size-4",
                                refreshing && "animate-spin",
                            )}
                        />
                    </Button>
                    {!kioskOpen &&
                        controller.activeDevice &&
                        tab === "play" && (
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="size-10 rounded-xl sm:hidden"
                                aria-label="Open immersive player"
                                onClick={() => void openKiosk()}
                            >
                                <Maximize2 className="size-4" />
                            </Button>
                        )}
                </div>
            </header>

            <NowPlaying
                runs={lovense.runs}
                patterns={lovense.patterns}
                details={lovense.details}
                onOpenLibrary={() => changeTab("patterns")}
            />

            <nav
                aria-label="Lovense sections"
                className="grid grid-cols-3 rounded-2xl border bg-card/65 p-1.5 shadow-sm"
            >
                {tabs.map((item) => {
                    const Icon = item.icon;
                    const active = tab === item.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            aria-current={active ? "page" : undefined}
                            onClick={() => changeTab(item.id)}
                            className={cn(
                                "flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-semibold transition-all sm:text-sm",
                                active
                                    ? "bg-violet-600 text-white shadow-lg shadow-violet-950/15"
                                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                            )}
                        >
                            <Icon
                                className={cn(
                                    "size-4",
                                    item.id === "play" &&
                                        active &&
                                        "fill-current",
                                )}
                            />
                            {item.label}
                            {item.count !== undefined && (
                                <span
                                    className={cn(
                                        "rounded-full px-1.5 py-0.5 font-mono text-[9px]",
                                        active
                                            ? "bg-white/15 text-white"
                                            : "bg-muted text-muted-foreground",
                                    )}
                                >
                                    {item.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </nav>

            <main>
                {tab === "play" && (
                    <LovensePlayer
                        controller={controller}
                        onManage={openSetup}
                        onOpenKiosk={() => void openKiosk()}
                    />
                )}
                {tab === "patterns" && (
                    <PatternLibrary
                        patterns={lovense.patterns}
                        details={lovense.details}
                        runs={lovense.runs}
                        selectedDeviceIds={controller.selectedDeviceIds}
                        onBeforePlay={controller.preparePattern}
                        onEdit={openPattern}
                        onCreate={createPattern}
                        onChanged={changed}
                    />
                )}
                {tab === "toys" && (
                    <LovenseSetup
                        devices={lovense.devices}
                        nodes={lovense.nodes}
                        intiface={lovense.intiface}
                        globalCap={lovense.settings?.max_intensity_pct ?? 70}
                        onChanged={changed}
                    />
                )}
            </main>

            <div
                className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-40 sm:right-5 md:bottom-6 md:right-6"
                style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
                <Button
                    type="button"
                    variant="destructive"
                    className="h-13 rounded-2xl bg-red-600 px-5 font-bold text-white shadow-[0_8px_35px_rgba(220,38,38,0.35)] hover:bg-red-500 sm:h-14 sm:px-6"
                    onClick={() => void controller.stopAll()}
                >
                    <Square className="size-4 fill-current" />
                    STOP ALL
                </Button>
            </div>

            <PatternEditor
                open={editorOpen}
                detail={editorDetail}
                devices={lovense.devices}
                onOpenChange={setEditorOpen}
                onSaved={changed}
            />

            {kioskOpen && (
                <LovenseKiosk
                    controller={controller}
                    onManage={openSetupFromKiosk}
                    onExit={closeKiosk}
                />
            )}
        </div>
    );
}
