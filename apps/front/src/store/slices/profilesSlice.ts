import {
    createEntityAdapter,
    createSlice,
    type EntitySelectors,
    type EntityState,
    type PayloadAction,
} from '@reduxjs/toolkit';
import type {
    ActiveProfile,
    PendingProfile,
    ProfileDeletedPayload,
    ProfileSavedPayload,
    ProfileSummary,
} from '@/types';
import type { RootState } from '@/store';

const profilesAdapter = createEntityAdapter<ProfileSummary, string>({
    selectId: (profile) => profile.name,
    sortComparer: (a, b) =>
        a.legacy === b.legacy
            ? a.name.localeCompare(b.name)
            : a.legacy
                ? -1
                : 1,
});

export interface ProfilesState extends EntityState<ProfileSummary, string> {
    /** True once the connect snapshot (`profiles:load`) has arrived. */
    initialized: boolean;
    /** Whether the save-profile dialog is currently open. */
    saveDialogOpen: boolean;
    /** The profile currently applied by the executor, null when idle. */
    activeProfile: ActiveProfile | null;
    /** Waiting profile applies in the action queue (oldest first). */
    pending: PendingProfile[];
}

const initialState: ProfilesState = {
    ...profilesAdapter.getInitialState(),
    initialized: false,
    saveDialogOpen: false,
    activeProfile: null,
    pending: [],
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
        /** A profile was created, overwritten or edited (broadcast). */
        profileSaved: (state, action: PayloadAction<ProfileSavedPayload>) => {
            profilesAdapter.upsertOne(state, action.payload.profile);
        },
        /** A profile was deleted or renamed away (broadcast). */
        profileDeleted: (state, action: PayloadAction<ProfileDeletedPayload>) => {
            profilesAdapter.removeOne(state, action.payload.name);
        },
        /** The executor started/stopped a profile (`profiles:active`). */
        activeProfileUpdated: (
            state,
            action: PayloadAction<ActiveProfile | null>
        ) => {
            state.activeProfile = action.payload;
        },
        /** Queued applies changed (`profiles:pending`, oldest first). */
        pendingProfilesLoaded: (
            state,
            action: PayloadAction<PendingProfile[]>
        ) => {
            state.pending = action.payload;
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

export const selectActiveProfile = (state: RootState) =>
    state.profiles.activeProfile;

export const selectPendingProfiles = (state: RootState) =>
    state.profiles.pending;

export const {
    profilesLoaded,
    profileSaved,
    profileDeleted,
    activeProfileUpdated,
    pendingProfilesLoaded,
    openProfileSave,
    closeProfileSave,
} = profilesSlice.actions;
export default profilesSlice.reducer;
