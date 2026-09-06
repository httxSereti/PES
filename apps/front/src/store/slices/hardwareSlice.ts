import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// Per-device hardware enable flags: { "UNIT1": true, "sound": false, ... }
export type HardwareState = Record<string, boolean>;

const initialState: HardwareState = {};

const hardwareSlice = createSlice({
    name: 'hardware',
    initialState,
    reducers: {
        hardwareInitialized: (_state, action: PayloadAction<HardwareState>) => {
            return action.payload;
        },
        hardwareUpdated: (_state, action: PayloadAction<HardwareState>) => {
            return action.payload;
        },
    },
});

export const { hardwareInitialized, hardwareUpdated } = hardwareSlice.actions;
export default hardwareSlice.reducer;
