import { describe, expect, it } from "vite-plus/test";
import type { ThreadId } from "@t3tools/contracts";

import {
  addThreadWallColumn,
  assignThreadWallColumn,
  DEFAULT_THREAD_WALL_COLUMNS,
  emptyThreadWallLayout,
  focusThreadWallColumn,
  MAX_THREAD_WALL_COLUMNS,
  normalizeThreadWallLayout,
  pruneMissingThreadWallColumns,
  removeThreadWallColumn,
} from "./threadWallLayout";

const threadA = "thread-a" as ThreadId;
const threadB = "thread-b" as ThreadId;

describe("emptyThreadWallLayout", () => {
  it("starts with two empty columns", () => {
    const layout = emptyThreadWallLayout();
    expect(layout.columns.map((column) => column.threadId)).toEqual(
      Array.from({ length: DEFAULT_THREAD_WALL_COLUMNS }, () => null),
    );
    expect(layout.focusedIndex).toBe(0);
  });

  it("clamps requested count into 1..8", () => {
    expect(emptyThreadWallLayout(0).columns).toHaveLength(1);
    expect(emptyThreadWallLayout(99).columns).toHaveLength(MAX_THREAD_WALL_COLUMNS);
  });
});

describe("assignThreadWallColumn", () => {
  it("binds a thread to a column and focuses it", () => {
    const layout = assignThreadWallColumn(emptyThreadWallLayout(), 1, threadA);
    expect(layout.columns[1]?.threadId).toBe(threadA);
    expect(layout.focusedIndex).toBe(1);
  });

  it("moves a thread that is already in another column", () => {
    const withFirst = assignThreadWallColumn(emptyThreadWallLayout(), 0, threadA);
    const moved = assignThreadWallColumn(withFirst, 1, threadA);
    expect(moved.columns.map((column) => column.threadId)).toEqual([null, threadA]);
  });
});

describe("addThreadWallColumn and removeThreadWallColumn", () => {
  it("appends an empty column up to the cap", () => {
    let layout = emptyThreadWallLayout(MAX_THREAD_WALL_COLUMNS - 1);
    layout = addThreadWallColumn(layout);
    expect(layout.columns).toHaveLength(MAX_THREAD_WALL_COLUMNS);
    expect(addThreadWallColumn(layout)).toBe(layout);
  });

  it("refuses to drop the last column", () => {
    const layout = emptyThreadWallLayout(1);
    expect(removeThreadWallColumn(layout, 0)).toBe(layout);
  });

  it("shifts focus when a column to the left is removed", () => {
    const layout = assignThreadWallColumn(emptyThreadWallLayout(3), 2, threadB);
    const removed = removeThreadWallColumn(layout, 0);
    expect(removed.columns).toHaveLength(2);
    expect(removed.focusedIndex).toBe(1);
  });
});

describe("normalizeThreadWallLayout", () => {
  it("drops extra columns and clamps focus", () => {
    const normalized = normalizeThreadWallLayout({
      columns: Array.from({ length: 10 }, (_, index) => ({
        id: `extra-${index}`,
        threadId: null,
      })),
      focusedIndex: 99,
    });
    expect(normalized.columns).toHaveLength(MAX_THREAD_WALL_COLUMNS);
    expect(normalized.focusedIndex).toBe(MAX_THREAD_WALL_COLUMNS - 1);
  });
});

describe("pruneMissingThreadWallColumns", () => {
  it("clears columns whose threads are gone and leaves live ones", () => {
    const layout = assignThreadWallColumn(
      assignThreadWallColumn(emptyThreadWallLayout(), 0, threadA),
      1,
      threadB,
    );
    const pruned = pruneMissingThreadWallColumns(layout, new Set([threadB]));
    expect(pruned.columns.map((column) => column.threadId)).toEqual([null, threadB]);
  });
});

describe("focusThreadWallColumn", () => {
  it("ignores out of range indexes", () => {
    const layout = emptyThreadWallLayout();
    expect(focusThreadWallColumn(layout, -1)).toBe(layout);
    expect(focusThreadWallColumn(layout, 8)).toBe(layout);
  });
});
