import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '@/store';

export type UnitChannel = 'channelA' | 'channelB';

/** A single level change, kept so Ctrl+Z can restore the previous absolute value. */
export interface UndoEntry {
    unitId: string;
    channel: UnitChannel;
    previous: number;
}

export interface UnitsUiState {
    selectedUnitIds: string[];
    highlightedUnitId: string | null;
    channelByUnit: Record<string, UnitChannel>;
    undoStack: UndoEntry[];
}

const PERSIST_KEY = 'pes.units.ui';
const MAX_UNDO = 50;

const createDefaultState = (): UnitsUiState => ({
    selectedUnitIds: [],
    highlightedUnitId: null,
    channelByUnit: {},
    undoStack: [],
});

/** Hydrate selection + channels from localStorage (SSR-safe). The undo stack is never persisted. */
export function loadUnitsUiState(): UnitsUiState {
    if (typeof window === 'undefined')
        return createDefaultState();

    try {
        const raw = window.localStorage.getItem(PERSIST_KEY);
        if (!raw)
            return createDefaultState();

        const parsed = JSON.parse(raw) as Partial<UnitsUiState>;

        return {
            selectedUnitIds: Array.isArray(parsed.selectedUnitIds) ? parsed.selectedUnitIds : [],
            highlightedUnitId: typeof parsed.highlightedUnitId === 'string' ? parsed.highlightedUnitId : null,
            channelByUnit: parsed.channelByUnit && typeof parsed.channelByUnit === 'object'
                ? parsed.channelByUnit
                : {},
            undoStack: [],
        };
    } catch {
        return createDefaultState();
    }
}

/** Persist the user-facing UI state. Storage may be unavailable (private mode/quota). */
export function saveUnitsUiState(state: UnitsUiState): void {
    if (typeof window === 'undefined')
        return;

    try {
        window.localStorage.setItem(PERSIST_KEY, JSON.stringify({
            selectedUnitIds: state.selectedUnitIds,
            highlightedUnitId: state.highlightedUnitId,
            channelByUnit: state.channelByUnit,
        }));
    } catch {
        // selection is non-critical, ignore storage failures
    }
}

const unitsUiSlice = createSlice({
    name: 'unitsUi',
    initialState: loadUnitsUiState(),
    reducers: {
        /** Select a unit. `additive` (Alt) toggles it in/out of the current selection. */
        unitSelected(state, action: PayloadAction<{ unitId: string; additive?: boolean }>) {
            const { unitId, additive = false } = action.payload;

            if (!additive) {
                state.selectedUnitIds = [unitId];
            } else if (state.selectedUnitIds.includes(unitId)) {
                state.selectedUnitIds = state.selectedUnitIds.filter(id => id !== unitId);
            } else {
                state.selectedUnitIds.push(unitId);
            }

            state.highlightedUnitId = unitId;
        },
        unitHighlighted(state, action: PayloadAction<string | null>) {
            state.highlightedUnitId = action.payload;
        },
        /** Replace selection + highlight after pruning against the currently available units. */
        selectionReconciled(state, action: PayloadAction<{ selectedUnitIds: string[]; highlightedUnitId: string | null }>) {
            state.selectedUnitIds = action.payload.selectedUnitIds;
            state.highlightedUnitId = action.payload.highlightedUnitId;
        },
        /** Set the active channel for one or more units. */
        channelSet(state, action: PayloadAction<{ unitIds: string[]; channel: UnitChannel }>) {
            for (const unitId of action.payload.unitIds) {
                state.channelByUnit[unitId] = action.payload.channel;
            }
        },
        undoPushed(state, action: PayloadAction<UndoEntry>) {
            state.undoStack = [...state.undoStack, action.payload].slice(-MAX_UNDO);
        },
        undoRemoved(state, action: PayloadAction<number>) {
            state.undoStack.splice(action.payload, 1);
        },
        undoCleared(state) {
            state.undoStack = [];
        },
    },
});

export const {
    unitSelected,
    unitHighlighted,
    selectionReconciled,
    channelSet,
    undoPushed,
    undoRemoved,
    undoCleared,
} = unitsUiSlice.actions;

export const selectSelectedUnitIds = (state: RootState) => state.unitsUi.selectedUnitIds;
export const selectHighlightedUnitId = (state: RootState) => state.unitsUi.highlightedUnitId;
export const selectChannelByUnit = (state: RootState) => state.unitsUi.channelByUnit;
export const selectUndoStack = (state: RootState) => state.unitsUi.undoStack;

export const selectUnitChannel = (state: RootState, unitId: string): UnitChannel =>
    state.unitsUi.channelByUnit[unitId] ?? 'channelA';

export default unitsUiSlice.reducer;
