import { CfgSensorSlider } from "@/components/common/sensors/common/cfg-sensor-slider";
import { SectionHeading } from "@/components/common/sensors/common/section-heading";
import { CooldownIndicator } from "@/components/common/sensors/cooldown-indicator";
import { SensorRecent } from "@/components/common/sensors/sensor-recent";
import { SensorTrace } from "@/components/common/sensors/sensor-trace";
import { useSensorEvents } from "@/hooks/useSensorEvents";
import type { SensorTheme } from "@/lib/sensor-theme";
import type { HardwareSensorId, MotionSensor } from "@/types";
import type { FC } from "react";

type SensorMotionProps = {
    sensorId: HardwareSensorId;
    sensor: MotionSensor;
    theme: SensorTheme;
    enabled: boolean;
};

export const SensorMotion: FC<SensorMotionProps> = ({
    sensorId,
    sensor,
    theme,
    enabled,
}) => {
    const { events, latestByType } = useSensorEvents(sensorId, 2);
    const hasPositionRef = sensor.position_ref >= 0;
    const positionDelta = hasPositionRef
        ? Math.abs(sensor.current_position - sensor.position_ref)
        : 0;
    const positionAbove =
        hasPositionRef &&
        sensor.position_alarm_level > 0 &&
        positionDelta >= sensor.position_alarm_level;
    const positionAlert =
        sensor.sensor_online &&
        sensor.alarm_enable &&
        sensor.position_alarm_level > 0 &&
        positionDelta >= sensor.position_alarm_level;
    const positionPct =
        sensor.position_alarm_level > 0
            ? (positionDelta / sensor.position_alarm_level) * 100
            : 0;
    const positionRef = hasPositionRef ? sensor.position_ref.toFixed(1) : "—";
    const movementEventAt = latestByType.sensor_move_alarm ?? null;

    return (
        <div className="flex flex-1 flex-col gap-3">
            <SensorTrace
                sensorId={sensorId}
                value={sensor.current_move}
                threshold={sensor.move_alarm_level}
                unit="u"
                maxValue={Math.max(
                    sensor.move_alarm_level * 2.5,
                    sensor.current_move * 1.15,
                    20,
                )}
                color={theme.accent}
                valueColor={theme.valueColor}
                label="Movement · last 5m"
                eventAt={movementEventAt}
                online={sensor.sensor_online}
            />

            <div className="rounded-lg border border-border/40 bg-muted/15 px-2.5 py-2">
                <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[8px] tracking-[0.14em] text-muted-foreground/50 uppercase">
                        Position
                    </span>
                    <span className="font-mono text-[11px] font-medium text-foreground/85 tabular-nums">
                        {sensor.current_position.toFixed(1)}u
                    </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 font-mono text-[8px] text-muted-foreground/40">
                    <span>ref {positionRef}</span>
                    <span
                        className={
                            positionAlert
                                ? "text-orange-500 dark:text-orange-400"
                                : undefined
                        }
                    >
                        Δ {positionDelta.toFixed(1)} /{" "}
                        {sensor.position_alarm_level}%
                    </span>
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-foreground/10">
                    <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                            width: `${Math.min(100, Math.max(0, positionPct))}%`,
                            backgroundColor: positionAlert
                                ? "#F97316"
                                : theme.accent,
                        }}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <CooldownIndicator
                    compact
                    label="Position"
                    counter={sensor.position_alarm_counter}
                    totalSeconds={sensor.position_delay_off}
                    triggerSeconds={sensor.position_delay_on}
                    alarmCount={sensor.position_alarm_number}
                    aboveThreshold={positionAbove}
                    enabled={enabled}
                    online={sensor.sensor_online}
                    alarmEnabled={sensor.alarm_enable}
                />
                <CooldownIndicator
                    compact
                    label="Movement"
                    counter={sensor.move_alarm_counter}
                    totalSeconds={sensor.move_delay_off}
                    triggerSeconds={sensor.move_delay_on}
                    alarmCount={sensor.move_alarm_number}
                    aboveThreshold={
                        sensor.current_move >= sensor.move_alarm_level
                    }
                    enabled={enabled}
                    online={sensor.sensor_online}
                    alarmEnabled={sensor.alarm_enable}
                />
            </div>

            <div className="flex flex-col gap-2">
                <SectionHeading label="Position" meta="3 settings" />
                <CfgSensorSlider
                    sensorId={sensorId}
                    propertyKey="position_alarm_level"
                    label="Trigger level"
                    minValue={1}
                    maxValue={50}
                    step={1}
                    unit="%"
                    disabled={false}
                    compact
                    accentClassName={theme.sliderAccentClassName}
                />
                <CfgSensorSlider
                    sensorId={sensorId}
                    propertyKey="position_delay_on"
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
                    propertyKey="position_delay_off"
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

            <div className="flex flex-col gap-2">
                <SectionHeading label="Movement" meta="3 settings" />
                <CfgSensorSlider
                    sensorId={sensorId}
                    propertyKey="move_alarm_level"
                    label="Trigger level"
                    minValue={1}
                    maxValue={50}
                    step={1}
                    unit="%"
                    disabled={false}
                    compact
                    accentClassName={theme.sliderAccentClassName}
                />
                <CfgSensorSlider
                    sensorId={sensorId}
                    propertyKey="move_delay_on"
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
                    propertyKey="move_delay_off"
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

            <div className="mt-auto flex flex-col gap-1 border-t border-border/30 pt-2 font-mono text-[8px] tracking-[0.1em] text-muted-foreground/40 uppercase">
                <div className="flex items-center justify-between gap-3">
                    <span>Position</span>
                    <span className="text-foreground/60 tabular-nums">
                        {sensor.position_alarm_number} alarms ·{" "}
                        {sensor.position_alarm_number_action} actions
                    </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <span>Movement</span>
                    <span className="text-foreground/60 tabular-nums">
                        {sensor.move_alarm_number} alarms ·{" "}
                        {sensor.move_alarm_number_action} actions
                    </span>
                </div>
            </div>
        </div>
    );
};
