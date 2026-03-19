import { useWebSocket } from "@/hooks/useWebSocket"
import type { CoreStopMessage } from "@/types"
import { Button } from "@pes/ui/components/button"
import { CirclePower } from "lucide-react"
import { toast } from "sonner"

export function EmergencyStop() {
    const { sendCommand } = useWebSocket()

    const stopApplication = async () => {
        try {
            const data: CoreStopMessage = await sendCommand('core:stop');

            if (data.status === "ok") {
                toast.success("Emergency stop", {
                    description: "Successfully stopped all units and cleared queue",
                    position: "top-center",
                    closeButton: true
                })
                return
            }

            throw new Error("Command hasn't succeed!")
        } catch (error) {
            toast.error("Emergency stop failed", {
                description: "Failed to stop all units and clear queue",
                position: "top-center",
                closeButton: true
            })
            console.error('Emergency stop failed', error);
        }
    };

    return (
        <Button variant="ghost" size="icon" onClick={stopApplication}>
            <CirclePower className="h-[1.2rem] w-[1.2rem] scale-100" />
            <span className="sr-only">Stop Units</span>
        </Button>
    )
}