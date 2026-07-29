import { SensorMotion } from "@/components/common/sensors/motion/sensor-motion";
import { SensorSound } from "@/components/common/sensors/sound/sensor-sound";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import { sensorsSelectors } from "@/store/slices/sensorsSlice";
import type { MotionSensor, SoundSensor } from "@/types";
import { Button } from "@pes/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pes/ui/components/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@pes/ui/components/dropdown-menu";
import { Skeleton } from "@pes/ui/components/skeleton";
import { Edit, MoreVertical, Power, RefreshCw, Trash2, Volume2, Wifi, WifiOff } from "lucide-react";
import type { FC } from "react";
import { toast } from "sonner";

type SensorProps = {
    sensorId: string;
};

export const Sensor: FC<SensorProps> = ({ sensorId }) => {
    const sensor = useAppSelector(state => sensorsSelectors.selectById(state, sensorId));
    const enabled = useAppSelector(state => state.hardware[sensorId] ?? true);
    const { sendCommand } = useWebSocket();

    if (!sensor)
        return (
            <div className="flex flex-col space-y-3">
                <Skeleton className="h-[425px]  rounded-xl" />
            </div>
        )

    const dotColor =
        enabled !== true
            ? "bg-gray-400"
            : sensor?.sensor_online === true
                ? "bg-green-500"
                : "bg-red-500";

    const toggleStatus = async () => {
        try {
            const newStatus = !sensor.alarm_enable;

            await sendCommand('sensors:update', {
                [sensorId]: {
                    alarm_enable: newStatus,
                },
            });
        } catch (err: unknown) {
            const error: Error = err as Error;

            toast.error("Can't update Sensor", {
                description: (error as Error).message,
                position: "top-right",
            })

            console.error('Failed to update sensor:', error);
        }
    };

    const toggleConnection = async () => {
        try {
            await sendCommand('hardware:update_bt_sensors', {
                id: sensorId,
                enabled: !enabled,
            });
        } catch (err: unknown) {
            const error: Error = err as Error;

            toast.error("Can't update Sensor connexion", {
                description: error.message,
                position: "top-right",
            })
        }
    };

    const rescan = async () => {
        try {
            await sendCommand('hardware:rescan_bt_sensors', { id: sensorId });
        } catch (err: unknown) {
            const error: Error = err as Error;

            toast.error("Can't rescan Sensor", {
                description: error.message,
                position: "top-right",
            })
        }
    };

    const handleEdit = () => {
        console.log("Edit sensor:", sensorId);
    };

    const handleDelete = () => {
        console.log("Delete sensor:", sensorId);
    };

    return (
        <Card className="">
            <CardHeader className="flex flex-row justify-between items-center">
                <CardTitle className="flex gap-2">
                    <div className="p-2 rounded-lg accent-tile" >
                        <Volume2 size={18} className="accent-tile-icon" />
                    </div>
                    <div className="flex flex-col justify-center">
                        <div className="flex text-sm">
                            {sensor?.id}
                        </div>
                    </div>
                </CardTitle>

                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <span
                            className={`h-3 w-3 rounded-full ${dotColor} cursor-pointer hover:opacity-80 transition-opacity`}
                        />
                    </Button>

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
                            <DropdownMenuItem onClick={toggleStatus}>
                                <Power className="mr-2 h-4 w-4" />
                                <span>{sensor.alarm_enable ? "Disable" : "Enable"}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleEdit}>
                                <Edit className="mr-2 h-4 w-4" />
                                <span>Edit (soon)</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleDelete} className="text-red-600">
                                <Trash2 className="mr-2 h-4 w-4" />
                                <span>Delete (soon)</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

            </CardHeader>

            <CardContent>
                <div className="flex flex-col gap-5">
                    {sensor.sensor_type === "motion" ? (
                        <SensorMotion
                            sensorId={sensorId}
                            sensor={sensor as MotionSensor}
                        />
                    ) : (
                        <SensorSound
                            sensorId={sensorId}
                            sensor={sensor as SoundSensor}
                        />
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
