import { useState } from "react"
import { Button } from "@pes/ui/components/button"
import { Pause, Play, Square } from "lucide-react"
import { toast } from "sonner"
import { useAppSelector } from "@/store/hooks"
import { unitsSelectors } from "@/store/slices/unitsSlice"
import { rampsSelectors } from "@/store/slices/rampsSlice"
import { useWebSocket } from "@/hooks/useWebSocket"
import { type RampStartPayload } from "@/types"
import { FIELD_LABELS } from "./ramp.constants"
import { RampStartDialog } from "./ramp-start-dialog"

type RampFieldRowProps = {
    unitId: string;
    field: RampStartPayload["field"];
};

export function RampFieldRow({ unitId, field }: RampFieldRowProps) {
    const [open, setOpen] = useState(false);
    const { sendCommand } = useWebSocket();
    // the UI only renders the 3 known units
    const unit = unitId as RampStartPayload["unit"];
    const unitState = useAppSelector((state) => unitsSelectors.selectById(state, unitId));
    const ramp = useAppSelector((state) => rampsSelectors.selectById(state, `${unitId}.${field}`));

    const value = unitState?.[field];

    const control = async (type: "ramps:pause" | "ramps:resume" | "ramps:stop") => {
        try {
            const result = await sendCommand(type, { unit: unit, field });
            if (result.status === "error") {
                toast.error(result.message ?? "Command failed");
            }
        } catch (error) {
            console.error(`Failed to send ${type}:`, error);
            toast.error("Command failed");
        }
    };

    return (
        <div className="flex items-center justify-between gap-2 border-b border-border/60 py-1.5 last:border-b-0">
            <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-primary/60">{FIELD_LABELS[field]}</span>
                    <span className="font-mono text-xs font-bold">{value ?? "—"}</span>
                </div>
                {ramp ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[9px] text-primary/40 uppercase">
                            {ramp.mode} · step {ramp.step}{ramp.step_unit === "absolute" ? "" : "%"} · {ramp.timer}s
                        </span>
                        {ramp.duration > 0 && (
                            <span className="font-mono text-[9px] text-primary/40">max {ramp.duration}s</span>
                        )}
                        {ramp.paused && (
                            <span className="font-mono text-[9px] text-amber-500 uppercase">paused</span>
                        )}
                    </div>
                ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-1">
                {ramp ? (
                    <>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-6 w-6 cursor-pointer"
                            title={ramp.paused ? "Resume" : "Pause"}
                            onClick={() => control(ramp.paused ? "ramps:resume" : "ramps:pause")}
                        >
                            {ramp.paused ? <Play size={12} /> : <Pause size={12} />}
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-6 w-6 cursor-pointer"
                            title="Stop"
                            onClick={() => control("ramps:stop")}
                        >
                            <Square size={12} />
                        </Button>
                    </>
                ) : (
                    <Button variant="outline" size="sm" className="h-6 cursor-pointer px-2 text-[10px]" onClick={() => setOpen(true)}>
                        Custom start
                    </Button>
                )}
            </div>

            <RampStartDialog
                unitId={unit}
                field={field}
                currentValue={value}
                open={open}
                onOpenChange={setOpen}
            />
        </div>
    );
}
