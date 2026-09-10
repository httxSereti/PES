import {
    FlaskConical,
    PersonStanding,
    Users,
    type LucideIcon,
} from "lucide-react"

import type { Session } from "@/types"

import type { SessionSensorId, SessionUnitId } from "./session-form"

export const STEPS = [
    { id: "core", title: "Core", description: "Type & identity" },
    { id: "modules", title: "Modules", description: "Units & sensors" },
    { id: "resume", title: "Resume", description: "Review & start" },
] as const

export const SESSION_TYPE_META: {
    value: Session["type"]
    label: string
    description: string
    icon: LucideIcon
}[] = [
    {
        value: "testing",
        label: "Testing",
        description: "Development and testings",
        icon: FlaskConical,
    },
    {
        value: "solo_play",
        label: "Solo Play",
        description: "Solo play",
        icon: PersonStanding,
    },
    {
        value: "multiplayer",
        label: "Multiplayer",
        description: "Someone controlling the app",
        icon: Users,
    },
]

export const UNITS: { id: SessionUnitId; label: string }[] = [
    { id: "UNIT1", label: "Unit 1" },
    { id: "UNIT2", label: "Unit 2" },
    { id: "UNIT3", label: "Unit 3" },
]

export const SENSORS: {
    id: SessionSensorId
    label: string
    events: string[]
}[] = [
    { id: "sound", label: "Sound Sensor", events: ["sensor_sound_alarm"] },
    {
        id: "motion1",
        label: "Motion Sensor 1",
        events: ["sensor_position_alarm", "sensor_move_alarm"],
    },
    {
        id: "motion2",
        label: "Motion Sensor 2",
        events: ["sensor_position_alarm", "sensor_move_alarm"],
    },
]

export const SESSION_TYPE_LABELS: Record<Session["type"], string> = {
    testing: "Testing",
    solo_play: "Solo Play",
    multiplayer: "Multiplayer",
}
