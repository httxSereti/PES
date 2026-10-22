import { RAMP_FIELDS } from "./ramp.constants"
import { RampFieldRow } from "./ramp-field-row"

type UnitRampsProps = {
    unitId: string;
};

export function UnitRamps({ unitId }: UnitRampsProps) {
    return (
        <div className="flex flex-col gap-1 rounded-lg border border-border/35 bg-muted/20 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-1.5">
                <p className="font-mono text-[10px] tracking-widest text-primary/50 uppercase">
                    Ramp studio
                </p>
                <span className="font-mono text-[8px] tracking-wide text-muted-foreground/45 uppercase">
                    per channel
                </span>
            </div>
            <div className="flex flex-col">
                {RAMP_FIELDS.map((field) => (
                    <RampFieldRow key={field} unitId={unitId} field={field} />
                ))}
            </div>
        </div>
    );
}
