import { type FC } from "react"
import { Button } from "@pes/ui/components/button"
import { cn } from "@pes/ui/lib/utils"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { unitsSelectors } from "@/store/slices/unitsSlice"
import { undoPushed } from "@/store/slices/unitsUiSlice"
import { useWebSocket } from "@/hooks/useWebSocket"

type UnitQuickLevelProps = {
    unitId: string;
    selectedChannel: "channelA" | "channelB";
};

const LEVEL_STEPS = [
    { label: "−5", operator: "-5" },
    { label: "−1", operator: "-1" },
    { label: "+1", operator: "+1" },
    { label: "+5", operator: "+5" },
    { label: "−10%", operator: "%-10" },
    { label: "−5%", operator: "%-5" },
    { label: "+5%", operator: "%+5" },
    { label: "+10%", operator: "%+10" },
] as const;

export const UnitQuickLevel: FC<UnitQuickLevelProps> = ({ unitId, selectedChannel }) => {
    const dispatch = useAppDispatch();
    const { sendCommand } = useWebSocket();
    const unit = useAppSelector(state => unitsSelectors.selectById(state, unitId));

    const propertyKey: string = selectedChannel == "channelA" ? "ch_A" : "ch_B"
    const updateLevel = async (operators: string) => {
        if (!unit)
            return

        try {
            dispatch(undoPushed({
                unitId,
                channel: selectedChannel,
                previous: selectedChannel === "channelA" ? unit.ch_A : unit.ch_B,
            }));

            await sendCommand('units:update_level', {
                [unitId]: {
                    [propertyKey]: operators,
                },
            });
        } catch (error) {
            console.error(`Failed to update property '${propertyKey}' using '${operators}' on unit '${unitId}'`, error);
        }
    };

    if (!unit)
        return null;

    const channelColor: string = selectedChannel === "channelA"
        ? "text-violet-600 dark:text-violet-400"
        : "text-blue-600 dark:text-blue-400"

    return (
        <div className="grid grid-cols-4 gap-1.5">
            {LEVEL_STEPS.map(({ label, operator }) => (
                <Button
                    key={operator}
                    variant="outline"
                    aria-label={`${label} on ${unitId}`}
                    className={cn(
                        "font-mono-dm h-8 cursor-pointer px-1 text-[10px] font-semibold tracking-tight",
                        channelColor,
                    )}
                    onClick={() => updateLevel(operator)}
                >
                    {label}
                </Button>
            ))}
        </div>
    )
}
