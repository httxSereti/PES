import { type FC } from "react"
import { cn } from "@pes/ui/lib/utils"
import { useAppSelector } from "@/store/hooks"
import { unitsSelectors } from "@/store/slices/unitsSlice"
import type { UnitChannel } from "@/store/slices/unitsUiSlice"

type UnitSelectChannelProps = {
    unitId: string;
    currentChannel: UnitChannel;
    setCurrentChannel: (channel: UnitChannel) => void;
};

export const UnitSelectChannel: FC<UnitSelectChannelProps> = ({ unitId, currentChannel, setCurrentChannel }) => {
    const unit = useAppSelector(state => unitsSelectors.selectById(state, unitId));

    if (!unit)
        return null;

    const channels = [
        {
            key: "channelA" as const,
            letter: "A",
            use: unit.ch_A_use,
            activeClass: "border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-300",
        },
        {
            key: "channelB" as const,
            letter: "B",
            use: unit.ch_B_use,
            activeClass: "border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300",
        },
    ];

    return (
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-border/40 bg-muted/20 p-1">
            {channels.map((channel) => {
                const active = currentChannel === channel.key;
                return (
                    <button
                        key={channel.key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setCurrentChannel(channel.key)}
                        className={cn(
                            "font-mono-dm flex h-8 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2 text-[10px] uppercase transition-colors",
                            active
                                ? channel.activeClass
                                : "border-transparent text-muted-foreground hover:text-foreground",
                        )}
                    >
                        <span className="shrink-0 opacity-60">{channel.letter} |</span>
                        <span className="truncate">{channel.use}</span>
                    </button>
                );
            })}
        </div>
    )
}
