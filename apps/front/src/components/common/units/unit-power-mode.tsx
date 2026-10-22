import { type FC } from "react"
import { cn } from "@pes/ui/lib/utils"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { unitsSelectors, unitUpdated } from "@/store/slices/unitsSlice"
import { useWebSocket } from "@/hooks/useWebSocket"

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
        <div className="flex items-center justify-between gap-2">
            <span className="font-mono-dm text-[10px] text-muted-foreground uppercase tracking-wider">
                Power
            </span>
            <div className="flex items-center gap-0.5 rounded-md border border-border/40 bg-muted/20 p-0.5">
                {(['L', 'H', 'D'] as const).map((m) => {
                    const isSelected = currentMode === m;
                    return (
                        <button
                            key={m}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => updatePowerMode(m)}
                            className={cn(
                                "font-mono-dm h-6 w-7 cursor-pointer rounded-none border-b-2 text-[10px] transition-colors",
                                isSelected
                                    ? "border-violet-500 text-foreground"
                                    : "border-transparent text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {m}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
