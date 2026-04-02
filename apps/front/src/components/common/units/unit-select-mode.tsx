import { type FC } from "react"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { unitsSelectors, unitUpdated } from "@/store/slices/unitsSlice"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@pes/ui/components/select"
import { MODE_2B, type Mode2BEntry } from "@/types/units.types"
import { useWebSocket } from "@/hooks/useWebSocket"

type UnitSelectModeProps = {
    unitId: string;
};

export const UnitSelectMode: FC<UnitSelectModeProps> = ({ unitId }) => {
    const unit = useAppSelector(state => unitsSelectors.selectById(state, unitId));
    const { sendCommand } = useWebSocket();
    const dispatch = useAppDispatch()

    if (!unit)
        return null;

    const updateMode = async (value: string) => {
        const index = Number(value);
        const selected = MODE_2B[index]; // Mode2BEntry

        console.log(index)
        try {
            await sendCommand('units:update_mode', {
                [unitId]: {
                    mode: index,
                },
            });


            // optimistic update, we update app settings but in client update target settings
            dispatch(unitUpdated({
                id: unitId,
                changes: { mode: index }
            }));
        } catch (error) {
            console.error(`Failed to update mode to '${selected?.id}' on unit '${unitId}'`, error);

            // rollback optimistic update
            // dispatch(unitUpdated({
            //     id: unitId,
            //     changes: { [propertyKey]: currentLevel }
            // }));
        }
    };

    console.log(MODE_2B[unit.mode]?.id)

    return (
        <div className={`flex items-center justify-between`}>
            <div className="flex items-center gap-2">
                <span className={`text-[14px]`}>
                    Mode
                </span>
            </div>
            <Select value={String(unit.mode)} onValueChange={updateMode}>
                <SelectTrigger>
                    <SelectValue placeholder="Choose a mode" />
                </SelectTrigger>
                <SelectContent>
                    {MODE_2B.map((mode: Mode2BEntry, index: number) => (
                        <SelectItem key={mode.id} value={String(index)}>
                            {mode.id}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
}
