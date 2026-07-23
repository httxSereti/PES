import { Sensor } from "@/components/common/sensors/sensor";
import { useAppSelector } from "@/store/hooks";
import { sensorsSelectors } from "@/store/slices/sensorsSlice";
import { Wifi } from "lucide-react";
import type { FC } from "react";

export const Sensors: FC = () => {
    const sensors = useAppSelector(state => sensorsSelectors.selectAll(state));

    return (
        <div className="space-y-4">
            <div className="px-5 mb-8 flex justify-between gap-4">
                <div className="flex-col">
                    <h1 className="font-syne text-xl sm:text-2xl lg:text-[26px] font-extrabold">
                        Sensors
                    </h1>
                    <div className="text-muted-foreground text-xs">Realtime sensors</div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md accent-tile">
                        <Wifi size={11} className="accent-tile-icon" />
                        <span className="font-mono-dm text-[11px] accent-tile-icon tracking-[0.06em]">{sensors.filter(s => s.sensor_online).length}/{sensors.length}</span>
                    </div>
                </div>
            </div>
            <div className="w-full px-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">
                <Sensor sensorId="sound" />
                <Sensor sensorId="motion1" />
                <Sensor sensorId="motion2" />
            </div>
        </div>
    );
}