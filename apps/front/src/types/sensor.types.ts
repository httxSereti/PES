import type { Sensor } from './websocket.generated';

export type { BaseSensor, MotionSensor, SoundSensor, Sensor } from './websocket.generated';

export interface SensorsState {
    ids: string[];
    entities: Record<string, Sensor>;
}
