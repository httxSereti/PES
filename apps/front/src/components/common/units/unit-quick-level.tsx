import { type FC } from "react"
import { Button } from "@pes/ui/components/button"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { unitsSelectors, unitUpdated } from "@/store/slices/unitsSlice"
import { useWebSocket } from "@/hooks/useWebSocket"
import calculateMagicNumber from "@/utilities/calculate_magic_number"

type UnitQuickLevelProps = {
    unitId: string;
    selectedChannel: "channelA" | "channelB";
};

export const UnitQuickLevel: FC<UnitQuickLevelProps> = ({ unitId, selectedChannel }) => {
    const { sendCommand } = useWebSocket();
    const dispatch = useAppDispatch()
    const unit = useAppSelector(state => unitsSelectors.selectById(state, unitId));

    const propertyKey: string = selectedChannel == "channelA" ? "ch_A" : "ch_B"
    const updateLevel = async (operators: string) => {
        if (!unit)
            return

        const currentLevel: number = selectedChannel === "channelA" ? unit.ch_A : unit.ch_B

        try {

            await sendCommand('units:level_update', {
                [unitId]: {
                    [propertyKey]: operators,
                },
            });

            // optimistic update, we update app settings but in client update target settings
            dispatch(unitUpdated({
                id: unitId,
                changes: { [propertyKey]: calculateMagicNumber(currentLevel, operators) }
            }));
        } catch (error) {
            console.error(`Failed to update property '${propertyKey}' using '${operators}' on unit '${unitId}'`, error);

            // rollback optimistic update
            dispatch(unitUpdated({
                id: unitId,
                changes: { [propertyKey]: currentLevel }
            }));
        }
    };

    if (!unit)
        return null;

    const channelColor: string = selectedChannel === "channelA" ? "text-violet-400" : "text-blue-400"

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-row justify-center w-full gap-2 flex-wrap">
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() => updateLevel("-5")}
                    >
                        <span className={`uppercase ${channelColor}`}>- 5</span>
                    </Button>
                    <Button
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() => updateLevel("-1")}

                    >
                        <span className={`uppercase ${channelColor}`}>- 1</span>
                    </Button>
                </div>

                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() => updateLevel("+1")}
                    >
                        <span className={`uppercase ${channelColor}`}>+ 1</span>
                    </Button>
                    <Button
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() => updateLevel("+5")}
                    >
                        <span className={`uppercase ${channelColor}`}>+ 5</span>
                    </Button>
                </div>
            </div>
            <div className="flex flex-row justify-center w-full gap-2 flex-wrap">
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() => updateLevel("%-10")}
                    >
                        <span className={`uppercase ${channelColor}`}>- 10%</span>
                    </Button>
                    <Button
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() => updateLevel("%-5")}

                    >
                        <span className={`uppercase ${channelColor}`}>- 5%</span>
                    </Button>
                </div>

                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() => updateLevel("%+5")}
                    >
                        <span className={`uppercase ${channelColor}`}>+ 5%</span>
                    </Button>
                    <Button
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() => updateLevel("%+10")}
                    >
                        <span className={`uppercase ${channelColor}`}>+ 10%</span>
                    </Button>
                </div>
            </div>
        </div>

    )
}
