import type { SessionHistoryDetail, SessionHistoryItem } from "@/types";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface SessionHistoryState {
  /** Full history list (null until the first `sessions:history` reply). */
  list: SessionHistoryItem[] | null;
  /** History detail per session id, keyed by `sessions:history_detail` replies. */
  details: Record<string, SessionHistoryDetail>;
}

const initialState: SessionHistoryState = {
  list: null,
  details: {},
};

const sessionHistorySlice = createSlice({
  name: "sessionHistory",
  initialState,
  reducers: {
    /** Reply to `sessions:history`: every application session. */
    sessionHistoryLoaded: (
      state,
      action: PayloadAction<SessionHistoryItem[]>,
    ) => {
      state.list = action.payload;
    },
    /** Reply to `sessions:history_detail`: one session + its logs. */
    sessionHistoryDetailLoaded: (
      state,
      action: PayloadAction<SessionHistoryDetail>,
    ) => {
      state.details[action.payload.session.id] = action.payload;
    },
    /** Broadcast `sessions:deleted`: drop one session from list + details. */
    sessionHistoryDeleted: (state, action: PayloadAction<string>) => {
      if (state.list) {
        state.list = state.list.filter(
          (session) => session.id !== action.payload,
        );
      }
      delete state.details[action.payload];
    },
  },
});

export const {
  sessionHistoryLoaded,
  sessionHistoryDetailLoaded,
  sessionHistoryDeleted,
} = sessionHistorySlice.actions;
export default sessionHistorySlice.reducer;
