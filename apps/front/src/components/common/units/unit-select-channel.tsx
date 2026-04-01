import { type FC } from "react"
import { Button } from "@pes/ui/components/button"
import { useAppSelector } from "@/store/hooks"
import { unitsSelectors } from "@/store/slices/unitsSlice"

type UnitSelectChannelProps = {
    unitId: string;
    currentChannel: string;
    setCurrentChannel: React.Dispatch<React.SetStateAction<"channelA" | "channelB">>;
};

export const UnitSelectChannel: FC<UnitSelectChannelProps> = ({ unitId, currentChannel, setCurrentChannel }) => {
    const unit = useAppSelector(state => unitsSelectors.selectById(state, unitId));

    if (!unit)
        return null;

    return (
        <div className="flex justify-center gap-2">
            <Button
                variant="ghost"
                className={`cursor-pointer bg-muted${currentChannel === "channelA" ? "" : "/40"}`}
                onClick={() => { setCurrentChannel("channelA") }}
            >
                <span className="text-zinc-400">A |</span>
                <span className="text-violet-400 uppercase">{unit?.ch_A_use}</span>
            </Button>
            <Button
                variant="ghost"
                className={`cursor-pointer bg-muted${currentChannel === "channelB" ? "" : "/40"}`}
                onClick={() => { setCurrentChannel("channelB") }}
            >
                <span className="text-zinc-400">B |</span>
                <span className="text-blue-400 uppercase">{unit?.ch_B_use}</span>
            </Button>
        </div>
    )
}
