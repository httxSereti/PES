import { Plus, X } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@pes/ui/components/dropdown-menu";
import { cn } from "@pes/ui/lib/utils";

import { useAppSelector } from "@/store/hooks";
import { unitsSelectors } from "@/store/slices/unitsSlice";
import type { ProfileDetail } from "@/types";
import type { UnitSettings } from "@/types/units.types";

import {
    liveUnitBlock,
    UNIT_IDS,
    unitRampCount,
    type ProfileDraft,
    type UnitId,
} from "./profile-document";
import type { ProfileEditorActions } from "./use-profile-editor";

type EditorUnitRailProps = {
    draft: ProfileDraft;
    detail: ProfileDetail;
    liveUnits: Partial<Record<string, UnitSettings>>;
    selectedUnit: UnitId | null;
    onSelect: (id: UnitId) => void;
    actions: ProfileEditorActions;
};

/** Live status dot: gray = disabled, green = connected, red = no link. */
function StatusDot({ unitId }: { unitId: string }) {
    const enabled = useAppSelector((state) => state.hardware[unitId] ?? true);
    const unit = useAppSelector((state) =>
        unitsSelectors.selectById(state, unitId),
    );

    const color =
        !enabled || !unit
            ? "bg-slate-400"
            : unit.cnx_ok
              ? "bg-green-500"
              : "bg-red-500";

    const title = !enabled
        ? "Disabled in hardware settings"
        : unit?.cnx_ok
          ? "Connected"
          : "Not connected";

    return (
        <span
            title={title}
            className={cn("h-2 w-2 shrink-0 rounded-full", color)}
        />
    );
}

export function EditorUnitRail({
    draft,
    detail,
    liveUnits,
    selectedUnit,
    onSelect,
    actions,
}: EditorUnitRailProps) {
    return (
        <div className="flex shrink-0 items-stretch gap-2 overflow-x-auto border-b p-3 lg:w-[248px] lg:flex-col lg:overflow-y-auto lg:border-r lg:border-b-0">
            <p className="hidden px-1 pb-1 font-mono text-[10px] tracking-[0.5px] text-muted-foreground uppercase lg:block">
                Units · {Object.keys(draft.units).length}/{UNIT_IDS.length}
            </p>

            {UNIT_IDS.map((id) => {
                const unit = draft.units[id];
                const live = liveUnits[id];
                const defaults = detail.unit_defaults[id] ?? {};

                if (!unit) {
                    return (
                        <DropdownMenu key={id}>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-9 shrink-0 justify-start gap-1.5 border-dashed font-mono text-[11px] text-muted-foreground lg:w-full"
                                >
                                    <Plus className="h-3.5 w-3.5" /> {id}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuItem
                                    disabled={!live}
                                    onClick={() =>
                                        live &&
                                        actions.addUnit(id, liveUnitBlock(live))
                                    }
                                >
                                    Copy live settings
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={() =>
                                        actions.addUnit(id, defaults)
                                    }
                                >
                                    Use hardware defaults
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    );
                }

                const ramps = unitRampCount(unit);
                const selected = selectedUnit === id;

                return (
                    <div
                        key={id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selected}
                        onClick={() => onSelect(id)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onSelect(id);
                            }
                        }}
                        className={cn(
                            "group flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-l-2 px-2.5 py-2 transition lg:w-full",
                            selected
                                ? "border-l-purple-500 bg-muted/50"
                                : "border-l-transparent hover:bg-muted/30",
                        )}
                    >
                        <StatusDot unitId={id} />
                        <div className="flex min-w-0 flex-1 flex-col">
                            <span className="font-mono text-[11px] font-semibold">
                                {id}
                            </span>
                            <span className="truncate font-mono text-[10px] text-muted-foreground">
                                A {unit.ch_A} / B {unit.ch_B}
                            </span>
                        </div>
                        {ramps > 0 && (
                            <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                                {ramps}r
                            </span>
                        )}
                        <button
                            type="button"
                            title={`Remove ${id} from the profile`}
                            onClick={(event) => {
                                event.stopPropagation();
                                actions.removeUnit(id);
                            }}
                            className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground/50 opacity-0 transition group-hover:opacity-100 hover:bg-muted hover:text-foreground"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                );
            })}

            <p className="hidden px-1 pt-1 text-[10px] leading-snug text-muted-foreground/70 lg:block">
                Only the units in the profile are changed by an apply. Click a
                unit to edit it.
            </p>
        </div>
    );
}
