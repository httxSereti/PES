import { Activity } from "lucide-react";

import { cn } from "@pes/ui/lib/utils";

import { useAppSelector } from "@/store/hooks";

import { RAMP_FIELDS } from "./ramp.constants";
import { RampFieldRow } from "./ramp-field-row";

type UnitRampsProps = {
    unitId: string;
};

export function UnitRamps({ unitId }: UnitRampsProps) {
    const active = useAppSelector((state) =>
        RAMP_FIELDS.reduce(
            (count, field) =>
                count + (state.ramps.entities[`${unitId}.${field}`] ? 1 : 0),
            0,
        ),
    );

    return (
        <div className="flex flex-col rounded-xl border border-border/45 bg-muted/15 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
                <p className="flex items-center gap-1.5 font-mono text-[10px] font-medium tracking-[0.14em] text-primary/60 uppercase">
                    <Activity className="size-3 text-primary/45" />
                    Ramp studio
                </p>
                <span className="flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground/80">
                    <span
                        className={cn(
                            "size-1.5 rounded-full",
                            active > 0
                                ? "bg-emerald-500"
                                : "bg-muted-foreground/30",
                        )}
                    />
                    {active > 0 ? `${active} / 4 active` : "no active ramps"}
                </span>
            </div>

            <div className="flex flex-col divide-y divide-border/50">
                {RAMP_FIELDS.map((field) => (
                    <RampFieldRow key={field} unitId={unitId} field={field} />
                ))}
            </div>
        </div>
    );
}
