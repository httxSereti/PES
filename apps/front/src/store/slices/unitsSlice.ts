import { createSlice, createEntityAdapter } from '@reduxjs/toolkit';
import type { EntitySelectors } from '@reduxjs/toolkit';
import type { UnitSettings } from '@/types';
import type { RootState } from '@/store';

const unitsAdapter = createEntityAdapter<UnitSettings>();

const unitsSlice = createSlice({
    name: "units",
    initialState: unitsAdapter.getInitialState(),
    reducers: {
        unitsInitialized: unitsAdapter.setAll,
        unitUpdated: unitsAdapter.updateOne,
    },
});

export const unitsSelectors: EntitySelectors<UnitSettings, RootState, string> = unitsAdapter.getSelectors((state: RootState) => state.units);

export const { unitsInitialized, unitUpdated } = unitsSlice.actions;
export default unitsSlice.reducer;