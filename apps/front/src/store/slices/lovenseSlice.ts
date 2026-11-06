import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
    LovenseDeviceInfo,
    LovenseHealth,
    LovenseIntifaceStatus,
    LovenseNodeInfo,
    LovensePatternDeleted,
    LovensePatternDetail,
    LovensePatternSummary,
    LovensePublicSettings,
    LovenseRunInfo,
    LovenseSnapshot,
} from '@/types';

export interface LovenseState {
    /** True once the connect snapshot (`lovense:init`) has arrived. */
    initialized: boolean;
    nodes: LovenseNodeInfo[];
    devices: LovenseDeviceInfo[];
    runs: LovenseRunInfo[];
    patterns: LovensePatternSummary[];
    health: LovenseHealth | null;
    intiface: LovenseIntifaceStatus | null;
    settings: LovensePublicSettings | null;
    /** Replies to `lovense:pattern_detail`, keyed by pattern id. */
    details: Record<string, LovensePatternDetail>;
    error: string | null;
}

const initialState: LovenseState = {
    initialized: false,
    nodes: [],
    devices: [],
    runs: [],
    patterns: [],
    health: null,
    intiface: null,
    settings: null,
    details: {},
    error: null,
};

const lovenseSlice = createSlice({
    name: 'lovense',
    initialState,
    reducers: {
        lovenseInitialized: (state, action: PayloadAction<LovenseSnapshot>) => {
            state.initialized = true;
            state.nodes = action.payload.nodes ?? [];
            state.devices = action.payload.devices ?? [];
            state.runs = action.payload.runs ?? [];
            state.patterns = action.payload.patterns ?? [];
            state.health = action.payload.health ?? null;
            state.intiface = action.payload.intiface ?? null;
            state.settings = action.payload.settings ?? null;
            state.error = null;
        },
        lovenseNodesUpdated: (state, action: PayloadAction<LovenseNodeInfo[]>) => {
            state.nodes = action.payload;
        },
        lovenseDevicesUpdated: (state, action: PayloadAction<LovenseDeviceInfo[]>) => {
            state.devices = action.payload;
        },
        lovenseDeviceUpdated: (state, action: PayloadAction<LovenseDeviceInfo>) => {
            const index = state.devices.findIndex(device => device.id === action.payload.id);
            if (index === -1) state.devices.push(action.payload);
            else state.devices[index] = action.payload;
        },
        lovenseRunsUpdated: (state, action: PayloadAction<LovenseRunInfo[]>) => {
            state.runs = action.payload;
        },
        lovensePatternsUpdated: (state, action: PayloadAction<LovensePatternSummary[]>) => {
            state.patterns = action.payload;
        },
        lovensePatternSaved: (state, action: PayloadAction<LovensePatternSummary>) => {
            const index = state.patterns.findIndex(pattern => pattern.id === action.payload.id);
            if (index === -1) state.patterns.push(action.payload);
            else state.patterns[index] = action.payload;
        },
        lovensePatternDetailLoaded: (
            state,
            action: PayloadAction<LovensePatternDetail>
        ) => {
            state.details[action.payload.id] = action.payload;
        },
        lovensePatternDeleted: (
            state,
            action: PayloadAction<LovensePatternDeleted>
        ) => {
            state.patterns = state.patterns.filter(
                pattern => pattern.id !== action.payload.id
            );
            delete state.details[action.payload.id];
        },
        lovenseHealthUpdated: (state, action: PayloadAction<LovenseHealth>) => {
            state.health = action.payload;
        },
        lovenseIntifaceUpdated: (
            state,
            action: PayloadAction<LovenseIntifaceStatus>
        ) => {
            state.intiface = action.payload;
            if (state.health) state.health.intiface = action.payload;
        },
        lovenseErrorReceived: (state, action: PayloadAction<string>) => {
            state.error = action.payload;
        },
    },
});

export const {
    lovenseInitialized,
    lovenseNodesUpdated,
    lovenseDevicesUpdated,
    lovenseDeviceUpdated,
    lovenseRunsUpdated,
    lovensePatternsUpdated,
    lovensePatternSaved,
    lovensePatternDetailLoaded,
    lovensePatternDeleted,
    lovenseHealthUpdated,
    lovenseIntifaceUpdated,
    lovenseErrorReceived,
} = lovenseSlice.actions;

export const selectLovense = (state: { lovense: LovenseState }) => state.lovense;

export default lovenseSlice.reducer;
