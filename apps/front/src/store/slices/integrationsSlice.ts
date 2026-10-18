import { createSlice, createEntityAdapter } from '@reduxjs/toolkit';
import type { EntitySelectors } from '@reduxjs/toolkit';
import type { IntegrationCatalogEntry } from '@/types/integrations.types';
import type { RootState } from '@/store';

// Integration catalog, kept in sync by the WS messages
// integrations:load (full catalog) and integrations:update (one entry).
const integrationsAdapter = createEntityAdapter<IntegrationCatalogEntry>();

const integrationsSlice = createSlice({
    name: 'integrations',
    initialState: integrationsAdapter.getInitialState(),
    reducers: {
        integrationsInitialized: integrationsAdapter.setAll,
        integrationUpdated: integrationsAdapter.upsertOne,
    },
});

export const integrationsSelectors: EntitySelectors<IntegrationCatalogEntry, RootState, string> =
    integrationsAdapter.getSelectors((state: RootState) => state.integrations);

export const { integrationsInitialized, integrationUpdated } = integrationsSlice.actions;
export default integrationsSlice.reducer;
