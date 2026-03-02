import { useState, type FC } from "react"
import { Button } from "@pes/ui/components/button"
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@pes/ui/components/card"
import { useAppSelector } from "@/store/hooks"
import { unitsSelectors } from "@/store/slices/unitsSlice"
import { UnitDropdown } from "@/components/common/units/unit-dropdown"
import { Computer } from "lucide-react"
import { UnitGraph } from "@/components/common/units/unit-graph"
import { UnitQuickLevel } from "@/components/common/units/unit-quick-level"
import { UnitSelectChannel } from "@/components/common/units/unit-select-channel"

type UnitProps = {
    unitId: string;
};

export const Unit: FC<UnitProps> = ({ unitId }) => {
    const [currentChannel, setCurrentChannel] = useState<"channelA" | "channelB">("channelA");
    const unit = useAppSelector(state => unitsSelectors.selectById(state, unitId));

    const dotColor =
        unit?.cnx_ok === true
            ? "bg-green-500"
            : "bg-red-500";

    return (
        <Card className="">
            <CardHeader className="flex flex-row justify-between items-center">
                <CardTitle className="flex gap-2">
                    <div className="p-2 rounded-lg bg-[#161226] border border-purple-800/40" >
                        <Computer size={18} className="text-violet-400" />
                    </div>
                    <div className="flex flex-col justify-center">
                        <div className="flex text-sm">
                            {unit?.id}
                        </div>
                    </div>
                </CardTitle>

                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <span
                            className={`h-3 w-3 rounded-full ${dotColor} cursor-pointer hover:opacity-80 transition-opacity`}
                        />
                    </Button>

                    <UnitDropdown unitId={unitId} />
                </div>

            </CardHeader>

            <CardContent>
                <div className="flex flex-col gap-4 justify-center">
                    <UnitGraph unitId={unitId} />

                    <UnitSelectChannel
                        unitId={unitId}
                        currentChannel={currentChannel}
                        setCurrentChannel={setCurrentChannel}
                    />

                    <UnitQuickLevel
                        unitId={unitId}
                        selectedChannel={currentChannel}
                    />
                </div>
            </CardContent>
        </Card>
    )
}
