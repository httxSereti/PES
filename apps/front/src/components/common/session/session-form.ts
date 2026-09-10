import * as z from "zod"

import type { Session } from "@/types"

export type SessionUnitId = Session["unit_ids"][number]
export type SessionSensorId = Session["sensor_ids"][number]

export const sessionFormSchema = z.object({
    type: z.enum(["testing", "solo_play", "multiplayer"]),
    name: z.string().min(1, "Name is required").max(64, "Name is too long"),
    description: z.string().max(512, "Description is too long"),
    unitIds: z
        .array(z.enum(["UNIT1", "UNIT2", "UNIT3"]))
        .min(1, "Select at least one unit"),
    sensorIds: z.array(z.enum(["sound", "motion1", "motion2"])),
})

export type SessionFormValues = z.infer<typeof sessionFormSchema>

export function buildDefaultValues(): SessionFormValues {
    return {
        type: "solo_play",
        name: `Session ${new Date().toLocaleDateString("en-GB")}`,
        description: "",
        unitIds: ["UNIT1", "UNIT2", "UNIT3"],
        sensorIds: [],
    }
}
