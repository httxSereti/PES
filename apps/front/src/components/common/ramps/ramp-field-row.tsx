import { useState } from "react"
import { Button } from "@pes/ui/components/button"
import { Pause, Play, Square } from "lucide-react"
import { toast } from "sonner"
import { useAppSelector } from "@/store/hooks"
import { unitsSelectors } from "@/store/slices/unitsSlice"
import { rampsSelectors } from "@/store/slices/rampsSlice"
import { useWebSocket } from "@/hooks/useWebSocket"
import { RampMode, type RampStartPayload } from "@/types"
import { RampStartDialog } from "./ramp-start-dialog"

const FIELD_LABELS: Record<RampStartPayload["field"], string> = {
    ch_A: "Channel A",
    ch_B: "Channel B",
    adj_1: "Adj 1",
    adj_2: "Adj 2",
};

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
        <div className="flex items-center justify-between gap-2 py-2 border-b border-border/60 last:border-b-0">
            <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-primary/60">{FIELD_LABELS[field]}</span>
                    <span className="font-mono text-sm font-bold">{value ?? "—"}</span>
                </div>
                {ramp ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono uppercase text-primary/40">
                            {ramp.mode === RampMode.WAVE ? "wave" : "reset"} · step {ramp.step} · {ramp.timer}s
                        </span>
                        {ramp.duration > 0 && (
                            <span className="text-[10px] font-mono text-primary/40">max {ramp.duration}s</span>
                        )}
                        {ramp.paused && (
                            <span className="text-[10px] font-mono uppercase text-amber-500">paused</span>
                        )}
                    </div>
                ) : null}
            </div>

            <div className="flex items-center gap-1 shrink-0">
                {ramp ? (
                    <>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 cursor-pointer"
                            title={ramp.paused ? "Resume" : "Pause"}
                            onClick={() => control(ramp.paused ? "ramps:resume" : "ramps:pause")}
                        >
                            {ramp.paused ? <Play size={14} /> : <Pause size={14} />}
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 cursor-pointer"
                            title="Stop"
                            onClick={() => control("ramps:stop")}
                        >
                            <Square size={14} />
                        </Button>
                    </>
                ) : (
                    <Button variant="outline" size="sm" className="h-7 cursor-pointer" onClick={() => setOpen(true)}>
                        Start
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
