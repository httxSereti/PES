import { useEffect, useState } from "react";
import { Bookmark, Square } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@pes/ui/components/button";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import { selectActiveProfile } from "@/store/slices/profilesSlice";

function formatRemaining(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return minutes > 0
        ? `${minutes}m ${rest.toString().padStart(2, "0")}s`
        : `${rest}s`;
}

export function ActiveProfileBanner() {
    const active = useAppSelector(selectActiveProfile);
    const { sendCommand } = useWebSocket();
    const [now, setNow] = useState(() => Date.now());
    const [stopping, setStopping] = useState(false);

    useEffect(() => {
        if (!active?.ends_at) return;
        setNow(Date.now());
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [active?.ends_at]);

    if (!active) return null;

    const remaining = active.ends_at
        ? Math.max(
              0,
              Math.round((new Date(active.ends_at).getTime() - now) / 1000)
          )
        : null;

    const stopProfile = async () => {
        setStopping(true);
        try {
            const result = await sendCommand("profiles:stop");
            if (result.status === "ok") {
                toast.success(`Profile "${active.name}" stopped`, {
                    description: "Previous settings restored.",
                    position: "bottom-right",
                });
                return;
            }
            toast.error("Failed to stop profile", {
                description: result.message ?? undefined,
                position: "bottom-right",
            });
        } catch (error) {
            toast.error("Failed to stop profile", {
                description: error instanceof Error ? error.message : undefined,
                position: "bottom-right",
            });
        } finally {
            setStopping(false);
        }
    };

    return (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <Bookmark className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
                <p className="truncate text-sm">
                    Active profile:{" "}
                    <span className="font-mono font-semibold">{active.name}</span>{" "}
                    <span className="text-muted-foreground">
                        at {active.level_pct}%
                    </span>
                </p>
                <p className="text-xs text-muted-foreground">
                    {remaining !== null
                        ? `Reverts in ${formatRemaining(remaining)}`
                        : "Runs until stopped or superseded by another action"}
                </p>
            </div>

            <Button
                variant="outline"
                size="sm"
                className="ml-auto shrink-0"
                disabled={stopping}
                onClick={stopProfile}
            >
                <Square className="h-3.5 w-3.5" />
                {stopping ? "Stopping..." : "Stop"}
            </Button>
        </div>
    );
}
