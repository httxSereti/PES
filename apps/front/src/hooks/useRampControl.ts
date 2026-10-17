import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { CommandResult, RampTarget } from "@/types";

export type RampControlType = "ramps:pause" | "ramps:resume" | "ramps:stop";

/**
 * Single-target ramp control helper: tracks the in-flight command so the
 * buttons can be disabled (anti double-click) and surfaces server errors.
 */
export function useRampControl() {
    const { sendCommand } = useWebSocket();
    const [pending, setPending] = useState(false);

    const control = useCallback(
        async (
            type: RampControlType,
            unit: RampTarget["unit"],
            field: RampTarget["field"],
        ): Promise<boolean> => {
            setPending(true);
            try {
                let result: CommandResult;
                switch (type) {
                    case "ramps:pause":
                        result = await sendCommand("ramps:pause", { unit, field });
                        break;
                    case "ramps:resume":
                        result = await sendCommand("ramps:resume", { unit, field });
                        break;
                    case "ramps:stop":
                        // restore: true keeps the backend default (the field
                        // ends at the ramp's max value).
                        result = await sendCommand("ramps:stop", {
                            unit,
                            field,
                            restore: true,
                        });
                        break;
                }
                if (result.status === "error") {
                    toast.error(result.message ?? "Command failed");
                    return false;
                }
                return true;
            } catch (error) {
                console.error(`Failed to send ${type}:`, error);
                toast.error("Command failed");
                return false;
            } finally {
                setPending(false);
            }
        },
        [sendCommand],
    );

    return { control, pending };
}
