export interface UnitSettings {
    // identifier
    id: string;
    // Channel A
    ch_A: number;
    ch_A_max: number;
    ch_A_ramp_phase: number;
    ch_A_ramp_prct: number;
    ch_A_multiplier: number;
    // Channel B
    ch_B: number;
    ch_B_max: number;
    ch_B_ramp_phase: number;
    ch_B_ramp_prct: number;
    ch_B_multiplier: number;
    // Soft ramp
    ramp_time: number;
    ramp_wave: boolean;
    ramp_progress: number;
    // Channels usage
    ch_A_use: string;
    ch_B_use: string;
    // Waveform setting 1
    adj_1: number;
    adj_1_max: number;
    adj_1_ramp_phase: number;
    adj_1_ramp_prct: number;
    // Waveform setting 2
    adj_2: number;
    adj_2_max: number;
    adj_2_ramp_phase: number;
    adj_2_ramp_prct: number;
    // 2B timer adjusts
    adj_3: number;
    adj_4: number;
    // Power config
    ch_link: boolean;
    level_d: boolean;
    level_h: boolean;
    level_map: number;
    power_bias: number;
    // Mode
    mode: number;
    // Status
    cnx_ok: boolean;
    sync: boolean;
    updated: boolean;
}

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