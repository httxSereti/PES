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
import { UnitStopButton } from "./unit-stop-button"
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
            id={`unit-${unitId.toLowerCase()}`}
            onClick={(event) => dispatch(unitSelected({ unitId, additive: event.altKey }))}
            className={cn(
                "scroll-mt-32 cursor-pointer gap-3 overflow-hidden py-0 transition-all",
                highlighted && "border-primary/60 shadow-md",
                selected && "ring-2 ring-violet-500/60",
            )}
        >
            <CardHeader className="flex flex-row items-center justify-between gap-2 px-4 pt-4 pb-0">
                <CardTitle className="flex min-w-0 items-center gap-2">
                    <div className="accent-tile flex size-8 shrink-0 items-center justify-center rounded-lg">
                        <Computer size={16} className="accent-tile-icon" />
                    </div>
                    <div className="flex min-w-0 flex-col justify-center">
                        <div className="font-mono-dm flex items-center gap-2 text-[13px] font-semibold">
                            {unit?.id}
                            <Kbd
                                className={cn(
                                    "h-5 min-w-5 px-1 font-mono text-[10px]",
                                    selected && "bg-violet-500! text-white!",
                                )}
                            >
                                {shortcutNumber}
                            </Kbd>
                        </div>
                    </div>
                </CardTitle>

                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                        <span
                            className={`size-2.5 rounded-full ${dotColor} cursor-pointer transition-opacity hover:opacity-80`}
                        />
                    </Button>

                    <UnitStopButton unitId={unitId} />

                    <UnitDropdown unitId={unitId} />
                </div>

            </CardHeader>

            <CardContent className="px-4 pb-4 pt-3">
                <div className="flex flex-col justify-center gap-3">
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

                    <div className="flex flex-col gap-2.5 rounded-lg border border-border/35 bg-muted/20 px-3 py-3">
                        <p className="font-mono text-[10px] tracking-widest text-primary/40 uppercase border-b pb-1.5">Unit Settings</p>

                        <div className="grid grid-cols-2 divide-x divide-border/60 border-b border-border/60 py-1">
                            {(["adj_1", "adj_2"] as const).map((adj_name) => {
                                const val = adj_name === 'adj_1' ? unit?.adj_1 : unit?.adj_2;
                                return (
                                    <div key={adj_name} className="flex items-center justify-center px-1 py-1.5">
                                        <div className="flex w-full flex-col">
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
