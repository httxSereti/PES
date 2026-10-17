import type { RampTarget } from "@/types";

/** Ramp targets shown by the UI, in canonical order. */
export const UNIT_IDS: RampTarget["unit"][] = ["UNIT1", "UNIT2", "UNIT3"];

export const RAMP_FIELDS: RampTarget["field"][] = ["ch_A", "ch_B", "adj_1", "adj_2"];

export const FIELD_LABELS: Record<RampTarget["field"], string> = {
    ch_A: "Channel A",
    ch_B: "Channel B",
    adj_1: "Adj 1",
    adj_2: "Adj 2",
};

export function fieldLabel(field: string): string {
    return FIELD_LABELS[field as RampTarget["field"]] ?? field;
}

/** Sort key placing ramps in UNIT1..3, ch_A..adj_2 order. */
export function unitFieldSortKey(unit: string, field: string): string {
    const unitIndex = UNIT_IDS.indexOf(unit as RampTarget["unit"]);
    const fieldIndex = RAMP_FIELDS.indexOf(field as RampTarget["field"]);
    return `${unitIndex === -1 ? UNIT_IDS.length : unitIndex}.${fieldIndex === -1 ? RAMP_FIELDS.length : fieldIndex}`;
}
