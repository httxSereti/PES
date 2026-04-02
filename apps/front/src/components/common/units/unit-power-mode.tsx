import { type FC } from "react"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { unitsSelectors, unitUpdated } from "@/store/slices/unitsSlice"
import { useWebSocket } from "@/hooks/useWebSocket"
import { Button } from "@pes/ui/components/button";

type UnitPowerModeProps = {
    unitId: string;
};

export const UnitPowerMode: FC<UnitPowerModeProps> = ({ unitId }) => {
    const unit = useAppSelector(state => unitsSelectors.selectById(state, unitId));
    const { sendCommand } = useWebSocket();
    const dispatch = useAppDispatch()

    if (!unit)
        return null;

    const currentMode = unit.level_d ? 'D' : (unit.level_h ? 'H' : 'L');

    const updatePowerMode = async (powerModeStr: 'L' | 'H' | 'D') => {
        try {
            await sendCommand('units:update_power_mode', {
                [unitId]: {
                    power_mode: powerModeStr,
                },
            });

            // optimistic update
            dispatch(unitUpdated({
                id: unitId,
                changes: {
                    level_h: powerModeStr === 'H',
                    level_d: powerModeStr === 'D'
                }
            }));
        } catch (error) {
            console.error(`Failed to update power mode to '${powerModeStr}' on unit '${unitId}'`, error);
        }
    };

    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <span className="text-[14px]">
                    Power Mode
                </span>
            </div>
            <div className="flex gap-2">
                {(['L', 'H', 'D'] as const).map((m) => {
                    const isSelected = currentMode === m;
                    return (
                        <Button
                            key={m}
                            variant={isSelected ? "default" : "ghost"}
                            onClick={() => updatePowerMode(m)}
                            className={`w-8 h-8 rounded-md flex items-center justify-center font-medium transition-colors text-sm`}
                        >
                            {m}
                        </Button>
                    )
                })}
            </div>
        </div>
    )
}
