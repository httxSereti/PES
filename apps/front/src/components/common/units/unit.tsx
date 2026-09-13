import { type FC } from "react"
import { Button } from "@pes/ui/components/button"
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@pes/ui/components/card"
import { Kbd } from "@pes/ui/components/kbd"
import { cn } from "@pes/ui/lib/utils"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { unitsSelectors } from "@/store/slices/unitsSlice"
import { channelSet, selectUnitChannel, unitSelected, type UnitChannel } from "@/store/slices/unitsUiSlice"
import { UnitDropdown } from "@/components/common/units/unit-dropdown"
import { Computer } from "lucide-react"
import { UnitGraph } from "@/components/common/units/unit-graph"
import { UnitQuickLevel } from "@/components/common/units/unit-quick-level"
import { UnitSelectChannel } from "@/components/common/units/unit-select-channel"
import { UnitSelectMode } from "@/components/common/units/unit-select-mode"
import { UnitPowerMode } from "@/components/common/units/unit-power-mode"
import { UnitAdj } from "./unit-adj"
import { UnitRamps } from "@/components/common/ramps/unit-ramps"

type UnitProps = {
    unitId: string;
};

export const Unit: FC<UnitProps> = ({ unitId }) => {
    const dispatch = useAppDispatch();
    const unit = useAppSelector(state => unitsSelectors.selectById(state, unitId));
    const enabled = useAppSelector(state => state.hardware[unitId] ?? true);
    const currentChannel = useAppSelector(state => selectUnitChannel(state, unitId));
    const selected = useAppSelector(state => state.unitsUi.selectedUnitIds.includes(unitId));
    const highlighted = useAppSelector(state => state.unitsUi.highlightedUnitId === unitId);

    const shortcutNumber = unitId.replace(/\D/g, "");

    const setCurrentChannel = (channel: UnitChannel) => {
        dispatch(channelSet({ unitIds: [unitId], channel }));
    };

    const dotColor =
        enabled !== true
            ? "bg-gray-400"
            : unit?.cnx_ok === true
                ? "bg-green-500"
                : "bg-red-500";

    return (
        <Card
            onClick={(event) => dispatch(unitSelected({ unitId, additive: event.altKey }))}
            className={cn(
                "cursor-pointer transition-all",
                highlighted && "border-primary/60 shadow-md",
                selected && "ring-2 ring-violet-500/70",
            )}
        >
            <CardHeader className="flex flex-row justify-between items-center">
                <CardTitle className="flex gap-2">
                    <div className="p-2 rounded-lg accent-tile" >
                        <Computer size={18} className="accent-tile-icon" />
                    </div>
                    <div className="flex flex-col justify-center">
                        <div className="flex items-center gap-2 text-sm">
                            {unit?.id}
                            <Kbd
                                className={cn(
                                    "font-mono",
                                    selected && "bg-violet-500! text-white!",
                                )}
                            >
                                {shortcutNumber}
                            </Kbd>
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

                    <div className="flex flex-col gap-3.5 px-3 py-3 rounded-lg border border-border/35 bg-muted/20">
                        <p className="font-mono text-[10px] tracking-widest uppercase text-primary/40 border-b pb-2">Unit Settings</p>

                        <div className="grid grid-cols-2 divide-x divide-border/60 py-2 border-b border-border/60">
                            {(["adj_1", "adj_2"] as const).map((adj_name) => {
                                const val = adj_name === 'adj_1' ? unit?.adj_1 : unit?.adj_2;
                                return (
                                    <div key={adj_name} className="flex justify-center items-center px-1 py-2">
                                        <div className="flex flex-col gap-2.5">
                                            <UnitAdj unitId={unitId} adjId={adj_name} val={val} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <UnitPowerMode unitId={unitId} />
                        <UnitSelectMode unitId={unitId} />

                    </div>

                    <UnitRamps unitId={unitId} />
                </div>
            </CardContent>
        </Card>
    )
}
