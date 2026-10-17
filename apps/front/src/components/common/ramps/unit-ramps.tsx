import { RAMP_FIELDS } from "./ramp.constants"
import { RampFieldRow } from "./ramp-field-row"

type UnitRampsProps = {
    unitId: string;
};

export function UnitRamps({ unitId }: UnitRampsProps) {
    return (
        <div className="flex flex-col gap-3.5 px-3 py-3 rounded-lg border border-border/35 bg-muted/20">
            <p className="font-mono text-[10px] tracking-widest uppercase text-primary/40 border-b pb-2">
                Ramp Settings
            </p>
            <div className="flex flex-col">
                {RAMP_FIELDS.map((field) => (
                    <RampFieldRow key={field} unitId={unitId} field={field} />
                ))}
            </div>
        </div>
    );
}
