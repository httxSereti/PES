import { useMemo } from "react";
import { Link } from "react-router";
import { Card, CardContent } from "@pes/ui/components/card";
import { cn } from "@pes/ui/lib/utils";
import { useAppSelector } from "@/store/hooks";
import { rampsSelectors } from "@/store/slices/rampsSlice";
import { unitsSelectors } from "@/store/slices/unitsSlice";
import type { RampTarget } from "@/types";
import { RAMP_FIELDS, UNIT_IDS } from "./ramp.constants";
import { RampChannelRow } from "./ramp-channel-row";

export function IdleChannels() {
    const ramps = useAppSelector((state) => rampsSelectors.selectAll(state));

    const activeFields = useMemo(
        () => new Set(ramps.map((ramp) => `${ramp.unit}.${ramp.field}`)),
        [ramps],
    );

    const idleCount = UNIT_IDS.reduce(
        (count, unitId) =>
            count +
            RAMP_FIELDS.filter((field) => !activeFields.has(`${unitId}.${field}`))
                .length,
        0,
    );

    return (
        <section className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-primary/40">
                    Channels
                </span>
                <span className="font-mono text-[10px] tabular-nums text-primary/40">
                    {idleCount} idle
                </span>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {UNIT_IDS.map((unitId) => (
                    <UnitChannelGroup
                        key={unitId}
                        unitId={unitId}
                        activeFields={activeFields}
                    />
                ))}
            </div>
        </section>
    );
}

type UnitChannelGroupProps = {
    unitId: RampTarget["unit"];
    activeFields: Set<string>;
};

function UnitChannelGroup({ unitId, activeFields }: UnitChannelGroupProps) {
    const unit = useAppSelector((state) =>
        unitsSelectors.selectById(state, unitId),
    );
    const enabled = useAppSelector((state) => state.hardware[unitId] ?? true);

    const connected = unit?.cnx_ok === true;
    const idleFields = RAMP_FIELDS.filter(
        (field) => !activeFields.has(`${unitId}.${field}`),
    );

    const dotColor = !enabled
        ? "bg-gray-400"
        : connected
          ? "bg-emerald-500"
          : "bg-red-500";
    const status = !enabled ? "disabled" : connected ? "connected" : "offline";

    return (
        <Card className="gap-2 py-4 @container/unit">
            <CardContent className="flex flex-col px-4">
                <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                    <div className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", dotColor)} />
                        <span className="text-sm font-semibold">{unitId}</span>
                    </div>
                    <span className="font-mono text-[10px] uppercase text-primary/40">
                        {status}
                    </span>
                </div>

                {(!enabled || !connected) && (
                    <p className="border-b border-border/40 py-2 text-[11px] text-muted-foreground">
                        {enabled
                            ? "Unit offline — ramps keep running in software."
                            : "Turned off in hardware settings — ramps keep running in software."}{" "}
                        <Link
                            to="/app/units"
                            className="text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
                        >
                            Open Units →
                        </Link>
                    </p>
                )}

                {idleFields.length === 0 ? (
                    <p className="py-3 text-xs italic text-muted-foreground/60">
                        All channels running
                    </p>
                ) : (
                    idleFields.map((field) => (
                        <RampChannelRow
                            key={field}
                            unitId={unitId}
                            field={field}
                        />
                    ))
                )}
            </CardContent>
        </Card>
    );
}
