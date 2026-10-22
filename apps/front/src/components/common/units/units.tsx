import { useEffect, type FC } from "react";
import { Unit } from "@/components/common/units/unit";
import { UnitsShortcuts } from "@/components/common/units/units-shortcuts";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { unitsSelectors } from "@/store/slices/unitsSlice";
import {
    selectChannelByUnit,
    selectHighlightedUnitId,
    selectSelectedUnitIds,
    selectionReconciled,
    unitSelected,
} from "@/store/slices/unitsUiSlice";
import { useUnitHotkeys } from "@/hooks/useUnitHotkeys";
import { ActiveProfileBanner } from "@/components/common/profiles/active-profile-banner";
import { cn } from "@pes/ui/lib/utils";
import { Wifi } from "lucide-react";

export const Units: FC = () => {
    const dispatch = useAppDispatch();
    const units = useAppSelector(state => unitsSelectors.selectAll(state));
    const selectedUnitIds = useAppSelector(selectSelectedUnitIds);
    const highlightedUnitId = useAppSelector(selectHighlightedUnitId);
    const channelByUnit = useAppSelector(selectChannelByUnit);
    const hardware = useAppSelector(state => state.hardware);
    const { shortcutsOpen, setShortcutsOpen } = useUnitHotkeys();

    // Prune stale selections and apply the default (only connected unit, else lowest id).
    useEffect(() => {
        const available = units.map(unit => unit.id);
        const connected = units.filter(unit => unit.cnx_ok).map(unit => unit.id);

        const kept = selectedUnitIds.filter(id => available.includes(id));
        let nextSelected = kept;
        if (nextSelected.length === 0) {
            const fallback = (connected.length > 0 ? connected : available).slice().sort();
            const first = fallback[0];
            nextSelected = first ? [first] : [];
        }

        const nextHighlighted = highlightedUnitId && available.includes(highlightedUnitId)
            ? highlightedUnitId
            : nextSelected[0] ?? available[0] ?? null;

        const selectionChanged =
            nextSelected.length !== selectedUnitIds.length ||
            nextSelected.some((id, index) => id !== selectedUnitIds[index]);

        if (selectionChanged || nextHighlighted !== highlightedUnitId)
            dispatch(selectionReconciled({ selectedUnitIds: nextSelected, highlightedUnitId: nextHighlighted }));
    }, [units, selectedUnitIds, highlightedUnitId, dispatch]);

    const jumpToUnit = (unitId: string) => {
        dispatch(unitSelected({ unitId }));
        document
            .getElementById(`unit-${unitId.toLowerCase()}`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 px-5">
                <div className="flex-col">
                    <h1 className="font-syne text-xl font-extrabold sm:text-2xl lg:text-[26px]">
                        Units
                    </h1>
                    <div className="text-muted-foreground text-xs">Realtime EStim Units</div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <div className="accent-tile flex items-center gap-2 rounded-md px-3 py-1.5">
                        <Wifi size={11} className="accent-tile-icon" />
                        <span className="font-mono-dm accent-tile-icon text-[11px] tracking-[0.06em]">
                            {units.filter(s => s.cnx_ok).length}/{units.length}
                        </span>
                    </div>
                    <UnitsShortcuts open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 px-5 text-[11px]">
                <span className="font-mono-dm text-primary/40 uppercase tracking-widest">Selected</span>
                {selectedUnitIds.length === 0 && (
                    <span className="text-muted-foreground">none</span>
                )}
                {selectedUnitIds.map(id => {
                    const channel = channelByUnit[id] ?? "channelA";
                    const isHighlighted = highlightedUnitId === id;
                    return (
                        <span
                            key={id}
                            className={cn(
                                "font-mono-dm rounded border px-2 py-0.5",
                                isHighlighted
                                    ? "border-primary/60 text-foreground"
                                    : "border-border/60 text-muted-foreground",
                            )}
                        >
                            {id} · {channel === "channelA" ? "A" : "B"}
                        </span>
                    );
                })}
                <span className="ml-auto hidden text-muted-foreground lg:inline">
                    Alt+click to multi-select · Press{" "}
                    <kbd className="rounded bg-muted px-1 font-sans">?</kbd>{" "}
                    for shortcuts
                </span>
                <span className="ml-auto text-muted-foreground lg:hidden">tap a card to select</span>
            </div>

            <div className="px-5">
                <ActiveProfileBanner />
            </div>

            {/* Mobile-only shortcut to reach the 3 stacked cards without a long scroll. */}
            <div className="sticky top-12 z-30 bg-background/95 px-5 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:hidden">
                <div className="flex gap-1 rounded-lg border border-border/50 bg-muted/25 p-1">
                    {units.map(unit => {
                        const enabled = hardware[unit.id] ?? true;
                        const active = highlightedUnitId === unit.id;
                        return (
                            <button
                                key={unit.id}
                                type="button"
                                aria-label={`Jump to ${unit.id}`}
                                aria-pressed={active}
                                onClick={() => jumpToUnit(unit.id)}
                                className={cn(
                                    "font-mono-dm flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-[10px] tracking-wide transition-colors",
                                    active
                                        ? "border-violet-500/30 bg-violet-500/10 text-violet-700 shadow-sm dark:text-violet-300"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                <span
                                    className={cn(
                                        "size-1.5 rounded-full",
                                        !enabled ? "bg-gray-400" : unit.cnx_ok ? "bg-green-500" : "bg-red-500",
                                    )}
                                />
                                {unit.id}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 px-5 pb-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                <Unit unitId="UNIT1" />
                <Unit unitId="UNIT2" />
                <Unit unitId="UNIT3" />
            </div>
        </div>
    );
};
