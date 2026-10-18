import { ChevronDown, ClipboardCopy } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@pes/ui/components/collapsible";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@pes/ui/components/select";
import { Switch } from "@pes/ui/components/switch";
import { cn } from "@pes/ui/lib/utils";

import { MODE_2B } from "@/types/units.types";
import type { UnitSettings } from "@/types/units.types";
import type { ProfileDetail } from "@/types";

import { LevelControl, ToggleChip, UsageLimitBar } from "./editor-controls";
import {
    ADJ_3_OPTIONS,
    ADJ_4_OPTIONS,
    LEVEL_MAP_OPTIONS,
    POWER_BIAS_OPTIONS,
    powerModeOf,
    type UnitDraft,
} from "./profile-document";
import type { ProfileEditorActions } from "./use-profile-editor";

const FALLBACK_LIMIT = { start: 15, warn: 40, max: 70 };

type EditorLevelsTabProps = {
    unit: UnitDraft;
    detail: ProfileDetail;
    live: UnitSettings | undefined;
    actions: ProfileEditorActions;
};

function ChannelCard({
    channel,
    unit,
    detail,
    actions,
}: {
    channel: "A" | "B";
    unit: UnitDraft;
    detail: ProfileDetail;
    actions: ProfileEditorActions;
}) {
    const isA = channel === "A";
    const usage = isA ? unit.ch_A_use : unit.ch_B_use;
    const level = isA ? unit.ch_A : unit.ch_B;
    const limit =
        detail.usage_limits[usage] ??
        detail.usage_limits.default ??
        FALLBACK_LIMIT;

    const usages = detail.usage_names.includes(usage)
        ? detail.usage_names
        : [usage, ...detail.usage_names];

    return (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-3.5">
            <div className="flex items-center justify-between gap-2">
                <span
                    className={cn(
                        "font-mono text-[10px] tracking-[0.5px] uppercase",
                        isA
                            ? "text-violet-600 dark:text-violet-400"
                            : "text-blue-600 dark:text-blue-400",
                    )}
                >
                    Channel {channel}
                </span>

                <Select
                    value={usage}
                    onValueChange={(value) =>
                        actions.patchUnit(
                            unit.id,
                            isA ? { ch_A_use: value } : { ch_B_use: value },
                        )
                    }
                >
                    <SelectTrigger
                        size="sm"
                        className="h-7 w-36 font-mono text-[11px]"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                        {usages.map((name) => (
                            <SelectItem
                                key={name}
                                value={name}
                                className="font-mono text-xs"
                            >
                                {name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <LevelControl
                value={level}
                aria-label={`Channel ${channel} level`}
                onChange={(value) =>
                    actions.patchUnit(
                        unit.id,
                        isA ? { ch_A: value } : { ch_B: value },
                    )
                }
            />

            <UsageLimitBar
                value={level}
                limit={limit}
                tone={isA ? "violet" : "blue"}
            />
        </div>
    );
}

/** Mode, waveform adjusts, power mode and the firmware-enumerated settings. */
export function EditorLevelsTab({
    unit,
    detail,
    live,
    actions,
}: EditorLevelsTabProps) {
    const modeData = MODE_2B[unit.mode] ?? MODE_2B[0];
    const powerMode = powerModeOf(unit);
    const adj2Label = modeData?.adj_2 ?? "";

    const setPowerMode = (mode: "L" | "H" | "D") => {
        actions.patchUnit(unit.id, {
            level_h: mode === "H",
            level_d: mode === "D",
        });
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[10px] tracking-widest uppercase text-primary/40">
                    {unit.id} · levels
                </p>
                {live && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => actions.copyLiveUnit(unit.id, live)}
                    >
                        <ClipboardCopy className="h-3.5 w-3.5" /> Copy live unit
                    </Button>
                )}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <ChannelCard
                    channel="A"
                    unit={unit}
                    detail={detail}
                    actions={actions}
                />
                <ChannelCard
                    channel="B"
                    unit={unit}
                    detail={detail}
                    actions={actions}
                />
            </div>

            <div className="flex flex-col gap-3.5 rounded-xl border bg-card p-3.5">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium">Mode</span>
                    <Select
                        value={String(unit.mode)}
                        onValueChange={(value) =>
                            actions.patchUnit(unit.id, { mode: Number(value) })
                        }
                    >
                        <SelectTrigger
                            size="sm"
                            className="h-8 w-40 font-mono text-xs"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper">
                            {MODE_2B.map((mode, index) => (
                                <SelectItem key={mode.id} value={String(index)}>
                                    {mode.id}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                        <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                            Adj 1 · {modeData?.adj_1 || "—"}
                        </span>
                        <LevelControl
                            value={unit.adj_1}
                            aria-label="Adj 1"
                            onChange={(value) =>
                                actions.patchUnit(unit.id, { adj_1: value })
                            }
                        />
                    </label>
                    {adj2Label && (
                        <label className="flex flex-col gap-1.5">
                            <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                                Adj 2 · {adj2Label}
                            </span>
                            <LevelControl
                                value={unit.adj_2}
                                aria-label="Adj 2"
                                onChange={(value) =>
                                    actions.patchUnit(unit.id, { adj_2: value })
                                }
                            />
                        </label>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                            Power
                        </span>
                        <div className="flex gap-1">
                            {(["L", "H", "D"] as const).map((mode) => (
                                <ToggleChip
                                    key={mode}
                                    active={powerMode === mode}
                                    className="w-8 justify-center"
                                    title={
                                        mode === "L"
                                            ? "Low power"
                                            : mode === "H"
                                              ? "High power"
                                              : "Dynamic"
                                    }
                                    onClick={() => setPowerMode(mode)}
                                >
                                    {mode}
                                </ToggleChip>
                            ))}
                        </div>
                    </div>

                    <label className="flex items-center gap-2">
                        <Switch
                            checked={unit.ch_link}
                            onCheckedChange={(checked) =>
                                actions.patchUnit(unit.id, { ch_link: checked })
                            }
                        />
                        <span className="text-[12px] text-muted-foreground">
                            Link A ⇄ B
                        </span>
                    </label>
                </div>
            </div>

            <Collapsible className="rounded-xl border bg-card">
                <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between px-3.5 py-3 text-[13px] font-medium">
                    Advanced 2B settings
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t px-3.5 py-3.5">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <EnumField
                            label="Ramp speed (adj 3)"
                            value={unit.adj_3}
                            options={ADJ_3_OPTIONS}
                            onChange={(value) =>
                                actions.patchUnit(unit.id, { adj_3: value })
                            }
                        />
                        <EnumField
                            label="Warp factor (adj 4)"
                            value={unit.adj_4}
                            options={ADJ_4_OPTIONS}
                            onChange={(value) =>
                                actions.patchUnit(unit.id, { adj_4: value })
                            }
                        />
                        <EnumField
                            label="Power bias"
                            value={unit.power_bias}
                            options={POWER_BIAS_OPTIONS}
                            onChange={(value) =>
                                actions.patchUnit(unit.id, {
                                    power_bias: value,
                                })
                            }
                        />
                        <EnumField
                            label="Power curve"
                            value={unit.level_map}
                            options={LEVEL_MAP_OPTIONS}
                            onChange={(value) =>
                                actions.patchUnit(unit.id, { level_map: value })
                            }
                        />
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}

function EnumField({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: number;
    options: Array<{ value: number; label: string }>;
    onChange: (value: number) => void;
}) {
    return (
        <label className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                {label}
            </span>
            <Select
                value={String(value)}
                onValueChange={(next) => onChange(Number(next))}
            >
                <SelectTrigger size="sm" className="h-8 w-28 font-mono text-xs">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                    {options.map((option) => (
                        <SelectItem
                            key={option.value}
                            value={String(option.value)}
                        >
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </label>
    );
}
