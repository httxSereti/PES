import { useState } from "react";
import { Clock, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@pes/ui/components/button";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import { selectPendingProfiles } from "@/store/slices/profilesSlice";
import type { PendingProfile } from "@/types";

import { formatClock } from "./profile-shape";

/** `-1` means the profile runs until stopped. */
function durationLabel(duration: number): string {
    return duration === -1 ? "until stopped" : formatClock(duration);
}

function originLabel(origin: string): string {
    return origin.startsWith("manual:") ? `by ${origin.slice(7)}` : origin;
}

type PendingProfilesProps = {
    canCancel: boolean;
};

/** Waiting profile applies — each one can be cancelled before it starts. */
export function PendingProfiles({ canCancel }: PendingProfilesProps) {
    const pending = useAppSelector(selectPendingProfiles);
    const { sendCommand } = useWebSocket();
    const [cancellingId, setCancellingId] = useState<string | null>(null);

    if (pending.length === 0) return null;

    const cancel = async (item: PendingProfile) => {
        setCancellingId(item.id);
        try {
            const result = await sendCommand("profiles:stop", {
                queue_item_id: item.id,
            });
            if (result.status === "ok") {
                toast.success(`Cancelled queued "${item.name}"`, {
                    position: "bottom-right",
                });
                return;
            }
            toast.error("Failed to cancel apply", {
                description: result.message ?? undefined,
                position: "bottom-right",
            });
        } catch (error) {
            toast.error("Failed to cancel apply", {
                description:
                    error instanceof Error ? error.message : undefined,
                position: "bottom-right",
            });
        } finally {
            setCancellingId(null);
        }
    };

    return (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3">
            <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.5px] text-muted-foreground uppercase">
                <Clock className="h-3.5 w-3.5" />
                Queued applies ({pending.length})
            </div>

            <div className="mt-2 flex flex-col divide-y divide-border/60">
                {pending.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 py-2">
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">
                                <span className="font-mono font-semibold">
                                    {item.name}
                                </span>
                                <span className="text-muted-foreground">
                                    {` at ${item.level_pct}%`}
                                </span>
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                                {durationLabel(item.duration)}
                                {item.units.length > 0 &&
                                    ` · ${item.units.join(", ")}`}
                                {item.origin && ` · ${originLabel(item.origin)}`}
                            </p>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            disabled={!canCancel || cancellingId === item.id}
                            title={
                                canCancel
                                    ? "Cancel this queued apply"
                                    : "Requires permission to control units"
                            }
                            onClick={() => void cancel(item)}
                        >
                            <X className="h-3.5 w-3.5" />
                            {cancellingId === item.id ? "Cancelling..." : "Cancel"}
                        </Button>
                    </div>
                ))}
            </div>
        </div>
    );
}
