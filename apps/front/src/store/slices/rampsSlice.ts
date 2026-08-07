import { createSlice, createEntityAdapter } from '@reduxjs/toolkit';
import type { EntitySelectors } from '@reduxjs/toolkit';
import type { Ramp } from '@/types';
import type { RootState } from '@/store';

const rampsAdapter = createEntityAdapter<Ramp, string>({
    selectId: (ramp) => `${ramp.unit}.${ramp.field}`,
});

const rampsSlice = createSlice({
    name: "ramps",
    initialState: rampsAdapter.getInitialState(),
    reducers: {
        rampsInitialized: rampsAdapter.setAll,
        rampUpserted: rampsAdapter.upsertOne,
        rampRemoved: rampsAdapter.removeOne,
    },
});

export const rampsSelectors: EntitySelectors<Ramp, RootState, string> = rampsAdapter.getSelectors((state: RootState) => state.ramps);

export const { rampsInitialized, rampUpserted, rampRemoved } = rampsSlice.actions;
export default rampsSlice.reducer;
