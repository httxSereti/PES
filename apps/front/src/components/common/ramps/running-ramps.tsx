import { useMemo, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@pes/ui/components/alert-dialog";
import { Button } from "@pes/ui/components/button";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { RampControlType } from "@/hooks/useRampControl";
import { useAppSelector } from "@/store/hooks";
import { rampsSelectors } from "@/store/slices/rampsSlice";
import type { Ramp, RampTarget } from "@/types";
import { unitFieldSortKey } from "./ramp.constants";
import { RunningRampCard } from "./running-ramp-card";

export function RunningRamps() {
    const ramps = useAppSelector((state) => rampsSelectors.selectAll(state));
    const { sendCommand } = useWebSocket();
    const [bulkPending, setBulkPending] = useState(false);
    const [stopAllOpen, setStopAllOpen] = useState(false);

    const sorted = useMemo(
        () =>
            [...ramps].sort((a, b) =>
                unitFieldSortKey(a.unit, a.field).localeCompare(
                    unitFieldSortKey(b.unit, b.field),
                ),
            ),
        [ramps],
    );

    const pausable = sorted.filter((ramp) => !ramp.paused);
    const resumable = sorted.filter((ramp) => ramp.paused);

    const bulkControl = async (type: RampControlType, targets: Ramp[]) => {
        if (targets.length === 0) return;
        setBulkPending(true);
        try {
            const sendForRamp = (ramp: Ramp) => {
                const unit = ramp.unit as RampTarget["unit"];
                const field = ramp.field as RampTarget["field"];
                switch (type) {
                    case "ramps:pause":
                        return sendCommand("ramps:pause", { unit, field });
                    case "ramps:resume":
                        return sendCommand("ramps:resume", { unit, field });
                    case "ramps:stop":
                        // No restore override: each ramp applies its
                        // configured end action (hold peak by default).
                        return sendCommand("ramps:stop", {
                            unit,
                            field,
                        });
                }
            };

            const results = await Promise.allSettled(targets.map(sendForRamp));
            const failed = results.filter(
                (result) =>
                    result.status === "rejected" ||
                    (result.status === "fulfilled" && result.value.status === "error"),
            ).length;
            const done = targets.length - failed;

            if (failed === 0) {
                const verb =
                    type === "ramps:stop"
                        ? "stopped"
                        : type === "ramps:pause"
                          ? "paused"
                          : "resumed";
                toast.success(`Ramp${done > 1 ? "s" : ""} ${verb}`, {
                    description: `${done} ramp${done > 1 ? "s" : ""} updated`,
                    closeButton: true,
                });
            } else {
                toast.error(
                    `${failed} ramp${failed > 1 ? "s" : ""} could not be updated`,
                    { description: `${done} succeeded`, closeButton: true },
                );
            }
        } finally {
            setBulkPending(false);
        }
    };

    if (sorted.length === 0) return null;

    const pauseAll = pausable.length > 0;

    return (
        <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-primary/40">
                        Running
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-primary/40">
                        {sorted.length}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer"
                        disabled={bulkPending}
                        onClick={() =>
                            void bulkControl(
                                pauseAll ? "ramps:pause" : "ramps:resume",
                                pauseAll ? pausable : resumable,
                            )
                        }
                    >
                        {pauseAll ? <Pause /> : <Play />}
                        {pauseAll ? "Pause all" : "Resume all"}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer text-destructive hover:text-destructive"
                        disabled={bulkPending}
                        onClick={() => setStopAllOpen(true)}
                    >
                        <Square />
                        Stop all
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {sorted.map((ramp) => (
                    <RunningRampCard
                        key={`${ramp.unit}.${ramp.field}`}
                        ramp={ramp}
                    />
                ))}
            </div>

            <AlertDialog open={stopAllOpen} onOpenChange={setStopAllOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Stop all running ramps?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This stops {sorted.length} ramp
                            {sorted.length > 1 ? "s" : ""}. Each field jumps to
                            its ramp&apos;s max value.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => void bulkControl("ramps:stop", sorted)}
                        >
                            <Square />
                            Stop all
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </section>
    );
}
