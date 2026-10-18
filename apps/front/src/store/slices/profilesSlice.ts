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
    ProfileDetail,
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
    /** Profile name currently open in the studio editor (null = closed). */
    editorName: string | null;
    /** Replies to `profiles:detail`, keyed by profile name. */
    details: Record<string, ProfileDetail>;
}

const initialState: ProfilesState = {
    ...profilesAdapter.getInitialState(),
    initialized: false,
    saveDialogOpen: false,
    activeProfile: null,
    pending: [],
    editorName: null,
    details: {},
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
            delete state.details[action.payload.name];
            if (state.editorName === action.payload.name) {
                state.editorName = null;
            }
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
        /** Open the studio editor on one profile (card, list, inspector). */
        openProfileEdit: (state, action: PayloadAction<string>) => {
            state.editorName = action.payload;
        },
        closeProfileEdit: (state) => {
            state.editorName = null;
        },
        /** Reply to `profiles:detail` (editor content). */
        profileDetailLoaded: (state, action: PayloadAction<ProfileDetail>) => {
            state.details[action.payload.name] = action.payload;
        },
    },
});

export const profilesSelectors: EntitySelectors<ProfileSummary, RootState, string> =
    profilesAdapter.getSelectors((state: RootState) => state.profiles);

export const selectActiveProfile = (state: RootState) =>
    state.profiles.activeProfile;

export const selectPendingProfiles = (state: RootState) =>
    state.profiles.pending;

/** Name of the profile open in the studio editor, or null. */
export const selectEditingProfileName = (state: RootState) =>
    state.profiles.editorName;

/** Cached `profiles:detail` reply for one profile (undefined until loaded). */
export const selectProfileDetail = (state: RootState, name: string) =>
    state.profiles.details[name];

export const {
    profilesLoaded,
    profileSaved,
    profileDeleted,
    activeProfileUpdated,
    pendingProfilesLoaded,
    openProfileSave,
    closeProfileSave,
    openProfileEdit,
    closeProfileEdit,
    profileDetailLoaded,
} = profilesSlice.actions;
export default profilesSlice.reducer;
