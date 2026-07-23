import { createSlice, createEntityAdapter } from '@reduxjs/toolkit';
import type { EntitySelectors } from '@reduxjs/toolkit';
import type { TriggerRuleLabel } from '@/types';
import type { RootState } from '@/store';

const triggerRuleLabelsAdapter = createEntityAdapter<TriggerRuleLabel>();

const triggerRuleLabelsSlice = createSlice({
    name: "triggerRuleLabels",
    initialState: triggerRuleLabelsAdapter.getInitialState(),
    reducers: {
        triggerRuleLabelsInitialized: triggerRuleLabelsAdapter.setAll,
        triggerRuleLabelAdded: triggerRuleLabelsAdapter.addOne,
    },
});

export const triggerRuleLabelsSelectors: EntitySelectors<TriggerRuleLabel, RootState, string> =
    triggerRuleLabelsAdapter.getSelectors((state: RootState) => state.triggerRuleLabels);

export const { triggerRuleLabelsInitialized, triggerRuleLabelAdded } =
    triggerRuleLabelsSlice.actions;


export default triggerRuleLabelsSlice.reducer;