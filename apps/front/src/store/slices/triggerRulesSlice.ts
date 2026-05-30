import { createSlice, createEntityAdapter } from '@reduxjs/toolkit';
import type { EntitySelectors } from '@reduxjs/toolkit';
import type { TriggerRule } from '@/types';
import type { RootState } from '@/store';

const triggerRulesAdapter = createEntityAdapter<TriggerRule>();

const triggerRulesSlice = createSlice({
    name: "triggerRules",
    initialState: triggerRulesAdapter.getInitialState(),
    reducers: {
        triggerRulesInitialized: triggerRulesAdapter.setAll,
        triggerRuleUpdated: triggerRulesAdapter.updateOne,
    },
});

export const triggerRulesSelectors: EntitySelectors<TriggerRule, RootState, string> = triggerRulesAdapter.getSelectors((state: RootState) => state.triggerRules);

export const { triggerRulesInitialized, triggerRuleUpdated } = triggerRulesSlice.actions;
export default triggerRulesSlice.reducer;