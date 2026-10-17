import { useEffect, useState } from "react";
import { ChevronDown, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@pes/ui/components/button";
import { ButtonGroup } from "@pes/ui/components/button-group";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@pes/ui/components/dropdown-menu";
import { useAppSelector } from "@/store/hooks";
import { unitsSelectors } from "@/store/slices/unitsSlice";
import { useRampControl } from "@/hooks/useRampControl";
import { useRampDefaults, type RampDefaults } from "@/hooks/useRampDefaults";
import { useRampPresets } from "@/hooks/useRampPresets";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { RampTarget } from "@/types";
import { FIELD_LABELS } from "./ramp.constants";
import { describeDefaults } from "./ramp-format";
import { RampStartDialog } from "./ramp-start-dialog";

type RampChannelRowProps = {
    unitId: RampTarget["unit"];
    field: RampTarget["field"];
};

export function RampChannelRow({ unitId, field }: RampChannelRowProps) {
    const unitState = useAppSelector((state) =>
        unitsSelectors.selectById(state, unitId),
    );
    const { sendCommand } = useWebSocket();
    const { getDefaults, saveDefaults, clearDefaults } = useRampDefaults();
    const { presets, deletePreset, refresh } = useRampPresets();
    const { control } = useRampControl();
    const [open, setOpen] = useState(false);
    const [starting, setStarting] = useState(false);
    const [defaults, setDefaults] = useState<RampDefaults | null>(null);

    // Refresh the remembered settings on mount, when the target changes and
    // after the dialog closes (it saves the submitted settings).
    useEffect(() => {
        setDefaults(getDefaults(unitId, field));
    }, [getDefaults, unitId, field, open]);

    const value = unitState?.[field];

    const startRamp = async (settings: RampDefaults, presetName?: string) => {
        setStarting(true);
        try {
            const result = await sendCommand("ramps:start", {
                unit: unitId,
                field,
                ...settings,
            });
            if (result.status === "error") {
                toast.error(result.message ?? "Failed to start ramp");
                return;
            }
            // Whatever just started becomes this channel's new default.
            saveDefaults(unitId, field, settings);
            setDefaults(settings);
            toast.success(
                presetName ? `Ramp started · ${presetName}` : "Ramp started",
                {
                    description: `${unitId} · ${FIELD_LABELS[field]} — ${describeDefaults(settings)}`,
                    action: {
                        label: "Stop",
                        onClick: () => void control("ramps:stop", unitId, field),
                    },
                    closeButton: true,
                },
            );
        } catch (error) {
            console.error("Failed to start ramp:", error);
            toast.error("Failed to start ramp");
        } finally {
            setStarting(false);
        }
    };

    const quickStart = () => {
        if (!defaults) {
            setOpen(true);
            return;
        }
        void startRamp(defaults);
    };

    const startLabel = defaults ? `Start · ${defaults.mode.toUpperCase()}` : "Start";
    const startTitle = defaults
        ? `Start with your last settings: ${describeDefaults(defaults)}`
        : "Opens the ramp settings on first start";

    return (
        <div className="flex items-center justify-between gap-3 border-b border-border/40 py-2 last:border-b-0">
            <div className="flex min-w-0 items-center gap-2">
                <span className="w-16 shrink-0 font-mono text-xs text-primary/60">
                    {FIELD_LABELS[field]}
                </span>
                <span className="font-mono text-sm font-bold tabular-nums">
                    {value ?? "—"}
                </span>
            </div>

            <div className="flex min-w-0 items-center justify-end gap-2">
                <span className="hidden max-w-52 truncate font-mono text-[10px] uppercase text-primary/40 @md/unit:block">
                    {defaults ? describeDefaults(defaults) : "settings on first start"}
                </span>

                <ButtonGroup>
                    <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer"
                        title={startTitle}
                        disabled={starting}
                        onClick={quickStart}
                    >
                        <Play />
                        {startLabel}
                    </Button>
                    <DropdownMenu
                        onOpenChange={(isOpen) => {
                            // presets may have been saved from the dialog since
                            // this component last rendered
                            if (isOpen) refresh();
                        }}
                    >
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className="cursor-pointer px-1.5"
                                title="More start options"
                                disabled={starting}
                            >
                                <ChevronDown />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60">
                            <DropdownMenuItem
                                disabled={!defaults}
                                onSelect={() => {
                                    if (defaults) void startRamp(defaults);
                                }}
                            >
                                Start with last settings
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />
                            <DropdownMenuLabel>Presets</DropdownMenuLabel>
                            {presets.length === 0 ? (
                                <p className="px-2 pb-1.5 text-xs italic text-muted-foreground/60">
                                    None yet — save one from the ramp settings
                                </p>
                            ) : (
                                presets.map((preset) => (
                                    <DropdownMenuItem
                                        key={preset.id}
                                        onSelect={() =>
                                            void startRamp(preset.defaults, preset.name)
                                        }
                                    >
                                        <div className="flex min-w-0 flex-col">
                                            <span className="truncate text-xs font-medium">
                                                {preset.name}
                                            </span>
                                            <span className="truncate font-mono text-[10px] uppercase text-muted-foreground/60">
                                                {describeDefaults(preset.defaults)}
                                            </span>
                                        </div>
                                    </DropdownMenuItem>
                                ))
                            )}

                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => setOpen(true)}>
                                Custom start…
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                disabled={!defaults}
                                onSelect={() => {
                                    clearDefaults(unitId, field);
                                    setDefaults(null);
                                }}
                            >
                                Reset saved settings
                            </DropdownMenuItem>

                            {presets.length > 0 && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuSub>
                                        <DropdownMenuSubTrigger>
                                            Delete preset
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent>
                                            {presets.map((preset) => (
                                                <DropdownMenuItem
                                                    key={preset.id}
                                                    onSelect={() =>
                                                        deletePreset(preset.id)
                                                    }
                                                >
                                                    {preset.name}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </ButtonGroup>
            </div>

            <RampStartDialog
                unitId={unitId}
                field={field}
                currentValue={value}
                open={open}
                onOpenChange={setOpen}
            />
        </div>
    );
}
