import {
    createEntityAdapter,
    createSlice,
    type EntitySelectors,
    type EntityState,
    type PayloadAction,
} from '@reduxjs/toolkit';
import type { ProfileSavedPayload, ProfileSummary } from '@/types';
import type { RootState } from '@/store';

const profilesAdapter = createEntityAdapter<ProfileSummary, string>({
    selectId: (profile) => profile.name,
    sortComparer: (a, b) =>
        a.builtin === b.builtin
            ? a.name.localeCompare(b.name)
            : a.builtin
                ? -1
                : 1,
});

export interface ProfilesState extends EntityState<ProfileSummary, string> {
    /** True once the connect snapshot (`profiles:load`) has arrived. */
    initialized: boolean;
    /** Whether the save-profile dialog is currently open. */
    saveDialogOpen: boolean;
}

const initialState: ProfilesState = {
    ...profilesAdapter.getInitialState(),
    initialized: false,
    saveDialogOpen: false,
};

const profilesSlice = createSlice({
    name: 'profiles',
    initialState,
    reducers: {
        /** Connect snapshot / reply to `profiles:list`. */
        profilesLoaded: (state, action: PayloadAction<ProfileSummary[]>) => {
            profilesAdapter.setAll(state, action.payload);
            state.initialized = true;
        },
        /** A profile was created or overwritten (broadcast). */
        profileSaved: (state, action: PayloadAction<ProfileSavedPayload>) => {
            profilesAdapter.upsertOne(state, action.payload.profile);
        },
        /** Sidebar button / external trigger. */
        openProfileSave: (state) => {
            state.saveDialogOpen = true;
        },
        closeProfileSave: (state) => {
            state.saveDialogOpen = false;
        },
    },
});

export const profilesSelectors: EntitySelectors<ProfileSummary, RootState, string> =
    profilesAdapter.getSelectors((state: RootState) => state.profiles);

export const {
    profilesLoaded,
    profileSaved,
    openProfileSave,
    closeProfileSave,
} = profilesSlice.actions;
export default profilesSlice.reducer;
