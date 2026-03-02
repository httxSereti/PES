import { type FC } from "react"
import { Button } from "@pes/ui/components/button"
import { useAppSelector } from "@/store/hooks"
import { unitsSelectors } from "@/store/slices/unitsSlice"
import { PauseIcon } from "lucide-react"

type UnitQuickLevelProps = {
    unitId: string;
    selectedChannel: string;
};

export const UnitQuickLevel: FC<UnitQuickLevelProps> = ({ unitId, selectedChannel }) => {
    const unit = useAppSelector(state => unitsSelectors.selectById(state, unitId));

    if (!unit)
        return null;

    const channelColor: string = selectedChannel === "channelA" ? "text-violet-400" : "text-blue-400"

    return (
        <div className="flex flex-row justify-center w-full gap-2 flex-wrap">
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    className="cursor-pointer"
                >
                    <span className={`uppercase ${channelColor}`}>- 5</span>
                </Button>
                <Button
                    variant="outline"
                    className="cursor-pointer"
                >
                    <span className={`uppercase ${channelColor}`}>- 1</span>
                </Button>
            </div>

            <div className="flex">
                <Button
                    variant="outline"
                    className={`uppercase ${channelColor} cursor-pointer`}
                >
                    <PauseIcon />
                </Button>
            </div>

            <div className="flex gap-2">
                <Button
                    variant="outline"
                    className="cursor-pointer"
                >
                    <span className={`uppercase ${channelColor}`}>+ 1</span>
                </Button>
                <Button
                    variant="outline"
                    className="cursor-pointer"
                >
                    <span className={`uppercase ${channelColor}`}>+ 5</span>
                </Button>
            </div>
        </div>
    )
}
