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
} from "@/store/slices/unitsUiSlice";
import { useUnitHotkeys } from "@/hooks/useUnitHotkeys";
import { Wifi } from "lucide-react";

export const Units: FC = () => {
    const dispatch = useAppDispatch();
    const units = useAppSelector(state => unitsSelectors.selectAll(state));
    const selectedUnitIds = useAppSelector(selectSelectedUnitIds);
    const highlightedUnitId = useAppSelector(selectHighlightedUnitId);
    const channelByUnit = useAppSelector(selectChannelByUnit);
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

    return (
        <div className="space-y-4">
            <div className="px-5 mb-8 flex justify-between gap-4">
                <div className="flex-col">
                    <h1 className="font-syne text-xl sm:text-2xl lg:text-[26px] font-extrabold">
                        Units
                    </h1>
                    <div className="text-muted-foreground text-xs">Realtime EStim Units</div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md accent-tile">
                        <Wifi size={11} className="accent-tile-icon" />
                        <span className="font-mono-dm text-[11px] accent-tile-icon tracking-[0.06em]">{units.filter(s => s.cnx_ok).length}/{units.length}</span>
                    </div>
                    <UnitsShortcuts open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
                </div>
            </div>

            <div className="px-5 -mt-4 mb-5 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="font-mono-dm uppercase tracking-widest text-primary/40">Selected</span>
                {selectedUnitIds.length === 0 && (
                    <span className="text-muted-foreground">none</span>
                )}
                {selectedUnitIds.map(id => {
                    const channel = channelByUnit[id] ?? "channelA";
                    const isHighlighted = highlightedUnitId === id;
                    return (
                        <span
                            key={id}
                            className={`font-mono-dm rounded border px-2 py-0.5 ${isHighlighted
                                ? "border-primary/60 text-foreground"
                                : "border-border/60 text-muted-foreground"
                                }`}
                        >
                            {id} · {channel === "channelA" ? "A" : "B"}
                        </span>
                    );
                })}
                <span className="ml-auto hidden text-muted-foreground sm:inline">
                    Press{" "}
                    <kbd className="rounded bg-muted px-1 font-sans">?</kbd>{" "}
                    for shortcuts
                </span>
            </div>

            <div className="w-full px-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">
                <Unit unitId="UNIT1" />
                <Unit unitId="UNIT2" />
                <Unit unitId="UNIT3" />
            </div>
        </div>
    );
}
