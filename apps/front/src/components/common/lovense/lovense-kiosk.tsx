import { useEffect, useRef } from "react";
import { Minimize2, ShieldCheck, Square, Vibrate } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { LovensePlayer } from "./lovense-player";
import type { LovenseController } from "./use-lovense-controller";

interface WakeLockSentinelLike {
    release: () => Promise<void>;
}

interface LovenseKioskProps {
    controller: LovenseController;
    onManage: () => void;
    onExit: () => void;
}

export function LovenseKiosk({
    controller,
    onManage,
    onExit,
}: LovenseKioskProps) {
    const hadFullscreenRef = useRef(Boolean(document.fullscreenElement));

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const fullscreenChanged = () => {
            if (!document.fullscreenElement && hadFullscreenRef.current)
                onExit();
            hadFullscreenRef.current = Boolean(document.fullscreenElement);
        };
        document.addEventListener("fullscreenchange", fullscreenChanged);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("fullscreenchange", fullscreenChanged);
        };
    }, [onExit]);

    useEffect(() => {
        let sentinel: WakeLockSentinelLike | null = null;
        let cancelled = false;
        const wakeLock = (
            navigator as Navigator & {
                wakeLock?: {
                    request: (type: "screen") => Promise<WakeLockSentinelLike>;
                };
            }
        ).wakeLock;
        if (wakeLock) {
            void wakeLock
                .request("screen")
                .then((lock) => {
                    if (cancelled) void lock.release();
                    else sentinel = lock;
                })
                .catch(() => undefined);
        }
        return () => {
            cancelled = true;
            if (sentinel) void sentinel.release().catch(() => undefined);
        };
    }, []);

    return (
        <div className="fixed inset-0 z-[100] flex h-dvh flex-col overflow-y-auto overscroll-none bg-background text-foreground">
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(124,58,237,0.13),transparent_42%)]" />
            <header
                className="relative z-10 flex shrink-0 items-center gap-3 border-b border-violet-500/15 bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-6"
                style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
            >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-500">
                    <Vibrate className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h1 className="font-syne text-sm font-extrabold sm:text-base">
                            Toy Player
                        </h1>
                        <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold tracking-widest text-emerald-500">
                            IMMERSIVE
                        </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {controller.selectedDevices.length > 0
                            ? controller.selectedDevices
                                  .map((device) => device.display_name)
                                  .join(" + ")
                            : "No toy selected"}
                    </p>
                </div>
                <div className="hidden items-center gap-1.5 text-[10px] text-muted-foreground sm:flex">
                    <ShieldCheck className="size-3.5 text-emerald-500" />
                    Server limits active
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 rounded-xl"
                    onClick={onExit}
                    aria-label="Exit immersive mode"
                >
                    <Minimize2 className="size-5" />
                </Button>
            </header>

            <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col p-3 sm:p-5">
                <LovensePlayer
                    controller={controller}
                    onManage={onManage}
                    immersive
                />
            </main>

            <footer
                className="sticky bottom-0 z-20 mt-auto flex items-center gap-3 border-t border-red-500/15 bg-background/90 p-3 backdrop-blur-xl sm:px-6"
                style={{
                    paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
                }}
            >
                <p className="hidden flex-1 text-xs text-muted-foreground sm:block">
                    Touch controls stop on interruption. This button stops every
                    toy and pattern.
                </p>
                <Button
                    type="button"
                    variant="destructive"
                    className="h-14 w-full rounded-2xl bg-red-600 text-base font-bold text-white shadow-[0_8px_35px_rgba(220,38,38,0.25)] hover:bg-red-500 sm:ml-auto sm:w-auto sm:min-w-64"
                    onClick={() => void controller.stopAll()}
                >
                    <Square className="size-5 fill-current" />
                    STOP ALL
                </Button>
            </footer>
        </div>
    );
}
