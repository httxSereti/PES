import { CfgSensorSlider } from "@/components/common/sensors/common/cfg-sensor-slider";
import { SectionHeading } from "@/components/common/sensors/common/section-heading";
import { CooldownIndicator } from "@/components/common/sensors/cooldown-indicator";
import { SensorRecent } from "@/components/common/sensors/sensor-recent";
import { SensorTrace } from "@/components/common/sensors/sensor-trace";
import { useSensorEvents } from "@/hooks/useSensorEvents";
import type { SensorTheme } from "@/lib/sensor-theme";
import type { HardwareSensorId, SoundSensor } from "@/types";
import { cn } from "@pes/ui/lib/utils";
import type { FC } from "react";

type SoundSensorProps = {
    sensorId: HardwareSensorId;
    sensor: SoundSensor;
    theme: SensorTheme;
    enabled: boolean;
};

type ConnectionRowProps = {
    label: string;
    value: string;
    tone: "ok" | "warn" | "muted";
};

const ConnectionRow: FC<ConnectionRowProps> = ({ label, value, tone }) => (
    <div className="flex items-center justify-between gap-3 font-mono text-[9px]">
        <span className="text-muted-foreground/40">{label}</span>
        <span
            className={cn(
                "flex items-center gap-1.5",
                tone === "ok" && "text-emerald-500 dark:text-emerald-400",
                tone === "warn" && "text-orange-500 dark:text-orange-400",
                tone === "muted" && "text-muted-foreground/50",
            )}
        >
            <span
                className={cn(
                    "size-1 rounded-full",
                    tone === "ok" && "bg-emerald-500",
                    tone === "warn" && "bg-orange-500",
                    tone === "muted" && "bg-muted-foreground/40",
                )}
            />
            {value}
        </span>
    </div>
);

export const SensorSound: FC<SoundSensorProps> = ({
    sensorId,
    sensor,
    theme,
    enabled,
}) => {
    const { events, latestAt } = useSensorEvents(sensorId, 4);
    const isAlarming =
        sensor.sensor_online &&
        sensor.alarm_enable &&
        sensor.current_sound >= sensor.sound_alarm_level;

    return (
        <div className="flex flex-1 flex-col gap-3">
            <SensorTrace
                sensorId={sensorId}
                value={sensor.current_sound}
                threshold={sensor.sound_alarm_level}
                unit="%"
                maxValue={90}
                color={theme.accent}
                valueColor={theme.valueColor}
                label="Sound · last 5m"
                eventAt={latestAt}
                online={sensor.sensor_online}
            />

            <CooldownIndicator
                label="Sound"
                counter={sensor.sound_alarm_counter}
                totalSeconds={sensor.sound_delay_off}
                triggerSeconds={sensor.sound_delay_on}
                alarmCount={sensor.sound_alarm_number}
                aboveThreshold={
                    sensor.current_sound >= sensor.sound_alarm_level
                }
                enabled={enabled}
                online={sensor.sensor_online}
                alarmEnabled={sensor.alarm_enable}
            />

            <div className="flex flex-col gap-2">
                <SectionHeading label="Controls" meta="3 settings" />
                <CfgSensorSlider
                    sensorId={sensorId}
                    propertyKey="sound_alarm_level"
                    label="Trigger level"
                    minValue={1}
                    maxValue={90}
                    step={1}
                    unit="%"
                    disabled={false}
                    compact
                    accentClassName={theme.sliderAccentClassName}
                />
                <CfgSensorSlider
                    sensorId={sensorId}
                    propertyKey="sound_delay_on"
                    label="Time before triggering action"
                    minValue={1}
                    maxValue={120}
                    step={1}
                    unit="s"
                    disabled={false}
                    compact
                    accentClassName={theme.sliderAccentClassName}
                />
                <CfgSensorSlider
                    sensorId={sensorId}
                    propertyKey="sound_delay_off"
                    label="Cooldown"
                    minValue={1}
                    maxValue={120}
                    step={1}
                    unit="s"
                    disabled={false}
                    compact
                    accentClassName={theme.sliderAccentClassName}
                />
            </div>

            <SensorRecent
                events={events}
                color={theme.accent}
                live={sensor.sensor_online && sensor.alarm_enable}
            />

            <div className="mt-auto flex flex-col gap-1.5">
                <SectionHeading label="Connection" meta="BLE" />
                <ConnectionRow
                    label="Link"
                    value={sensor.sensor_online ? "connected" : "offline"}
                    tone={sensor.sensor_online ? "ok" : "muted"}
                />
                <ConnectionRow
                    label="Alarm"
                    value={sensor.alarm_enable ? "enabled" : "disabled"}
                    tone={sensor.alarm_enable ? "ok" : "muted"}
                />
                <ConnectionRow
                    label="Readings"
                    value={
                        isAlarming
                            ? "threshold reached"
                            : sensor.sensor_online
                              ? "live"
                              : "paused"
                    }
                    tone={
                        isAlarming
                            ? "warn"
                            : sensor.sensor_online
                              ? "ok"
                              : "muted"
                    }
                />
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-2 font-mono text-[8px] tracking-[0.1em] text-muted-foreground/40 uppercase">
                <span>
                    Alarms{" "}
                    <span className="text-foreground/70 tabular-nums">
                        {sensor.sound_alarm_number}
                    </span>
                </span>
                <span>
                    Actions{" "}
                    <span className="text-foreground/70 tabular-nums">
                        {sensor.sound_alarm_number_action}
                    </span>
                </span>
            </div>
        </div>
    );
};
