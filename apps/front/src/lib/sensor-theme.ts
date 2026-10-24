import { Activity, Volume2, type LucideIcon } from "lucide-react";

import type { HardwareSensorId } from "@/types";

export type SensorTheme = {
    name: string;
    accent: string;
    valueColor: string;
    icon: LucideIcon;
    tileClassName: string;
    sliderAccentClassName: string;
};

type AlertTheme = Pick<
    SensorTheme,
    "accent" | "valueColor" | "tileClassName" | "sliderAccentClassName"
>;

const ALERT_THEME: AlertTheme = {
    accent: "#F97316",
    valueColor: "#FB923C",
    tileClassName:
        "border-orange-500/20 bg-orange-500/10 text-orange-500 dark:text-orange-400",
    sliderAccentClassName:
        "[&_[data-slot=slider-range]]:bg-orange-500 [&_[data-slot=slider-thumb]]:border-orange-500",
};

const SENSOR_THEMES: Record<HardwareSensorId, SensorTheme> = {
    sound: {
        name: "Sound",
        accent: "#D946EF",
        valueColor: "#F0ABFC",
        icon: Volume2,
        tileClassName:
            "border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-500 dark:text-fuchsia-400",
        sliderAccentClassName:
            "[&_[data-slot=slider-range]]:bg-fuchsia-500 [&_[data-slot=slider-thumb]]:border-fuchsia-500",
    },
    motion1: {
        name: "Motion 1",
        accent: "#8E51FF",
        valueColor: "#C4B5FD",
        icon: Activity,
        tileClassName:
            "border-violet-500/20 bg-violet-500/10 text-violet-500 dark:text-violet-400",
        sliderAccentClassName:
            "[&_[data-slot=slider-range]]:bg-violet-500 [&_[data-slot=slider-thumb]]:border-violet-500",
    },
    motion2: {
        name: "Motion 2",
        accent: "#71717A",
        valueColor: "#A1A1AA",
        icon: Activity,
        tileClassName:
            "border-zinc-500/20 bg-zinc-500/10 text-zinc-500 dark:text-zinc-400",
        sliderAccentClassName:
            "[&_[data-slot=slider-range]]:bg-zinc-500 [&_[data-slot=slider-thumb]]:border-zinc-500",
    },
};

export function getSensorTheme(
    sensorId: HardwareSensorId,
    alerting = false,
): SensorTheme {
    const base = SENSOR_THEMES[sensorId];

    return alerting ? { ...base, ...ALERT_THEME } : base;
}
