import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "../lib/storage";
import {
  addThreadWallColumn,
  assignThreadWallColumn,
  EMPTY_THREAD_WALL_LAYOUT,
  focusThreadWallColumn,
  normalizeThreadWallLayout,
  pruneMissingThreadWallColumns,
  removeThreadWallColumn,
  type ThreadWallLayout,
} from "./threadWallLayout";

const THREAD_WALL_STORAGE_KEY = "t3code:thread-wall:v1";

interface PersistedThreadWallState {
  layoutByEnvironmentId?: Record<string, ThreadWallLayout>;
}

interface ThreadWallStoreState {
  layoutByEnvironmentId: Record<string, ThreadWallLayout>;
  layoutFor: (environmentId: EnvironmentId) => ThreadWallLayout;
  addColumn: (environmentId: EnvironmentId) => void;
  removeColumn: (environmentId: EnvironmentId, index: number) => void;
  assignColumn: (environmentId: EnvironmentId, index: number, threadId: ThreadId | null) => void;
  focusColumn: (environmentId: EnvironmentId, index: number) => void;
  pruneMissing: (environmentId: EnvironmentId, liveThreadIds: ReadonlySet<ThreadId>) => void;
}

function readLayout(
  layoutByEnvironmentId: Record<string, ThreadWallLayout>,
  environmentId: EnvironmentId,
): ThreadWallLayout {
  const stored = layoutByEnvironmentId[environmentId];
  return stored === undefined ? EMPTY_THREAD_WALL_LAYOUT : normalizeThreadWallLayout(stored);
}

function writeLayout(
  layoutByEnvironmentId: Record<string, ThreadWallLayout>,
  environmentId: EnvironmentId,
  layout: ThreadWallLayout,
): Record<string, ThreadWallLayout> {
  return { ...layoutByEnvironmentId, [environmentId]: layout };
}

function createThreadWallStorage() {
  return resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined);
}

export const useThreadWallStore = create<ThreadWallStoreState>()(
  persist(
    (set, get) => ({
      layoutByEnvironmentId: {},
      layoutFor: (environmentId) => readLayout(get().layoutByEnvironmentId, environmentId),
      addColumn: (environmentId) => {
        set((state) => ({
          layoutByEnvironmentId: writeLayout(
            state.layoutByEnvironmentId,
            environmentId,
            addThreadWallColumn(readLayout(state.layoutByEnvironmentId, environmentId)),
          ),
        }));
      },
      removeColumn: (environmentId, index) => {
        set((state) => ({
          layoutByEnvironmentId: writeLayout(
            state.layoutByEnvironmentId,
            environmentId,
            removeThreadWallColumn(readLayout(state.layoutByEnvironmentId, environmentId), index),
          ),
        }));
      },
      assignColumn: (environmentId, index, threadId) => {
        set((state) => ({
          layoutByEnvironmentId: writeLayout(
            state.layoutByEnvironmentId,
            environmentId,
            assignThreadWallColumn(
              readLayout(state.layoutByEnvironmentId, environmentId),
              index,
              threadId,
            ),
          ),
        }));
      },
      focusColumn: (environmentId, index) => {
        set((state) => ({
          layoutByEnvironmentId: writeLayout(
            state.layoutByEnvironmentId,
            environmentId,
            focusThreadWallColumn(readLayout(state.layoutByEnvironmentId, environmentId), index),
          ),
        }));
      },
      pruneMissing: (environmentId, liveThreadIds) => {
        set((state) => {
          const current = readLayout(state.layoutByEnvironmentId, environmentId);
          const next = pruneMissingThreadWallColumns(current, liveThreadIds);
          if (next === current) return state;
          return {
            layoutByEnvironmentId: writeLayout(state.layoutByEnvironmentId, environmentId, next),
          };
        });
      },
    }),
    {
      name: THREAD_WALL_STORAGE_KEY,
      storage: createJSONStorage(createThreadWallStorage),
      partialize: (state) => ({ layoutByEnvironmentId: state.layoutByEnvironmentId }),
      merge: (persistedState, currentState) => {
        const persisted =
          persistedState && typeof persistedState === "object"
            ? (persistedState as PersistedThreadWallState)
            : {};
        const layoutByEnvironmentId: Record<string, ThreadWallLayout> = {};
        for (const [environmentId, layout] of Object.entries(
          persisted.layoutByEnvironmentId ?? {},
        )) {
          if (!layout || typeof layout !== "object") continue;
          layoutByEnvironmentId[environmentId] = normalizeThreadWallLayout({
            columns: Array.isArray(layout.columns) ? layout.columns : [],
            focusedIndex: typeof layout.focusedIndex === "number" ? layout.focusedIndex : 0,
          });
        }
        return { ...currentState, layoutByEnvironmentId };
      },
    },
  ),
);
