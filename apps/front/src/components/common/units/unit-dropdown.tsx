import { type FC } from "react"
import { Button } from "@pes/ui/components/button"
import { useAppSelector } from "@/store/hooks"
import { unitsSelectors } from "@/store/slices/unitsSlice"
import { useWebSocket } from "@/hooks/useWebSocket"
import type { HardwareUnitId } from "@/types"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@pes/ui/components/dropdown-menu"
import { Link, MoreVertical, PowerOff, RefreshCw, Wifi, WifiOff } from "lucide-react"
import { toast } from "sonner"

type UnitDropdownProps = {
    unitId: string;
};

/** unitId arrives as a route-level string; hardware commands need the literal id. */
const asHardwareUnitId = (id: string): HardwareUnitId => id as HardwareUnitId;

export const UnitDropdown: FC<UnitDropdownProps> = ({ unitId }) => {
    const unit = useAppSelector(state => unitsSelectors.selectById(state, unitId));
    const enabled = useAppSelector(state => state.hardware[unitId] ?? true);
    const { sendCommand } = useWebSocket();

    if (!unit)
        return null;

    const toggleConnection = async () => {
        try {
            await sendCommand('hardware:update_mk2bt', { id: asHardwareUnitId(unitId), enabled: !enabled });
        } catch (err: unknown) {
            const error: Error = err as Error;

            toast.error("Can't update Unit connexion", {
                description: error.message,
                position: "top-right",
            })
        }
    };

    const rescan = async () => {
        try {
            await sendCommand('hardware:rescan_mk2bt', { id: asHardwareUnitId(unitId) });
        } catch (err: unknown) {
            const error: Error = err as Error;

            toast.error("Can't rescan Unit", {
                description: error.message,
                position: "top-right",
            })
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={toggleConnection}>
                    {enabled
                        ? <WifiOff className="mr-2 h-4 w-4" />
                        : <Wifi className="mr-2 h-4 w-4" />}
                    <span>{enabled ? "Disable connexion" : "Enable connexion"}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={rescan} disabled={!enabled}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    <span>Relaunch scan</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                    <Link className="mr-2 h-4 w-4" />
                    <span>Link Channel A & B</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-red-600">
                    <PowerOff className="mr-2 h-4 w-4" />
                    <span>Stop {unit.id}</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
