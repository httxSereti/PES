import { useRef, useState } from "react";
import { toast } from "sonner";

import type { HardwareUnitId } from "@/types";
import { useWebSocket } from "@/hooks/useWebSocket";

/**
 * Stop a single unit safely: cancel all four ramp fields and set both
 * channel levels to zero. The backend emits `units:update`, and active ramps
 * emit `ramps:remove`, so the UI reconciles from the server.
 */
export function useUnitStop(unitId: string) {
    const { sendCommand } = useWebSocket();
    const [stopping, setStopping] = useState(false);
    const busy = useRef(false);

    const stop = async (event?: { stopPropagation: () => void }) => {
        event?.stopPropagation();

        if (busy.current)
            return;

        busy.current = true;
        setStopping(true);
        try {
            const result = await sendCommand("units:stop", {
                id: unitId as HardwareUnitId,
            });

            if (result.status !== "ok")
                throw new Error(result.message ?? "Command failed");

            toast.success(`${unitId} stopped`, {
                description: "Every ramp was cancelled and both channels are at 0.",
                position: "top-center",
            });
        } catch (error) {
            toast.error(`Failed to stop ${unitId}`, {
                description: error instanceof Error ? error.message : "Unknown error",
                position: "top-center",
            });
        } finally {
            busy.current = false;
            setStopping(false);
        }
    };

    return { stopping, stop };
}
