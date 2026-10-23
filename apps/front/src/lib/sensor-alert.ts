import type { Sensor } from "@/types";

/** Matches the live alert condition highlighted on the Sensors page. */
export function isSensorAlert(sensor: Sensor): boolean {
    if (!sensor.alarm_enable) return false;
    if (sensor.sensor_type === "motion") {
        return sensor.current_move >= sensor.move_alarm_level;
    }
    return sensor.current_sound >= sensor.sound_alarm_level;
}

/**
 * Current reading + the level that triggers the alarm. The home gauges use
 * the threshold as their 100% mark, so a full ring means “at the alarm”.
 */
export function sensorReading(sensor: Sensor): {
    value: number;
    unit: string;
    threshold: number;
} {
    if (sensor.sensor_type === "motion") {
        return {
            value: sensor.current_move,
            unit: "",
            threshold: sensor.move_alarm_level,
        };
    }

    return {
        value: sensor.current_sound,
        unit: "%",
        threshold: sensor.sound_alarm_level,
    };
}
