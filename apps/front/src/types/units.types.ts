import type { UnitSettings } from './websocket.generated';

export type { UnitSettings } from './websocket.generated';

export interface UnitsState {
    ids: string[];
    entities: Record<string, UnitSettings>;
}

export type Mode2BEntry = {
    id: string;
    adj_1: string;
    adj_2: string;
};

export const MODE_2B: Mode2BEntry[] = [
    { id: "pulse", adj_1: "rate", adj_2: "feel" },
    { id: "bounce", adj_1: "rate", adj_2: "feel" },
    { id: "continuous", adj_1: "feel", adj_2: "" },
    { id: "flo", adj_1: "rate", adj_2: "feel" },
    { id: "asplit", adj_1: "rate", adj_2: "feel" },
    { id: "bsplit", adj_1: "rate", adj_2: "feel" },
    { id: "wave", adj_1: "flow", adj_2: "steep" },
    { id: "waterfall", adj_1: "flow", adj_2: "steep" },
    { id: "squeeze", adj_1: "rate", adj_2: "feel" },
    { id: "milk", adj_1: "rate", adj_2: "feel" },
    { id: "throb", adj_1: "low", adj_2: "high" },
    { id: "thrust", adj_1: "low", adj_2: "high" },
    { id: "cycle", adj_1: "low", adj_2: "high" },
    { id: "twist", adj_1: "low", adj_2: "high" },
    { id: "random", adj_1: "range", adj_2: "feel" },
    { id: "step", adj_1: "steep", adj_2: "feel" },
    { id: "training", adj_1: "steep", adj_2: "feel" },
];

// Type utilitaire pour le Select
export type Mode2BId = Mode2BEntry["id"]; // string, ou plus strict ci-dessous