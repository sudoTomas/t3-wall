import { describe, expect, it } from "vite-plus/test";
import type { ThreadId } from "@t3tools/contracts";

import {
  addThreadWallColumn,
  assignLivePaneColumn,
  assignThreadWallColumn,
  DEFAULT_THREAD_WALL_COLUMNS,
  emptyThreadWallLayout,
  focusThreadWallColumn,
  MAX_THREAD_WALL_COLUMNS,
  normalizeThreadWallLayout,
  pruneMissingThreadWallColumns,
  removeThreadWallColumn,
  threadWallColumnKind,
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

  it("clears a live pane when a thread is bound to that column", () => {
    const live = assignLivePaneColumn(emptyThreadWallLayout(), 0, {
      session: "work",
      paneId: "terminal_1",
    });
    const assigned = assignThreadWallColumn(live, 0, threadA);
    expect(assigned.columns[0]?.threadId).toBe(threadA);
    expect(assigned.columns[0]?.livePane).toBeNull();
  });
});

describe("assignLivePaneColumn", () => {
  const pane = { session: "work", paneId: "terminal_1" };

  it("binds a live pane and focuses the column", () => {
    const layout = assignLivePaneColumn(emptyThreadWallLayout(), 1, pane);
    expect(layout.columns[1]?.livePane).toEqual(pane);
    expect(layout.columns[1]?.threadId).toBeNull();
    expect(threadWallColumnKind(layout.columns[1]!)).toBe("live-pty");
    expect(layout.focusedIndex).toBe(1);
  });

  it("moves a live pane that is already in another column", () => {
    const withFirst = assignLivePaneColumn(emptyThreadWallLayout(), 0, pane);
    const moved = assignLivePaneColumn(withFirst, 1, pane);
    expect(moved.columns.map((column) => column.livePane)).toEqual([null, pane]);
  });

  it("clears a thread when a live pane is bound to that column", () => {
    const withThread = assignThreadWallColumn(emptyThreadWallLayout(), 0, threadA);
    const assigned = assignLivePaneColumn(withThread, 0, pane);
    expect(assigned.columns[0]?.threadId).toBeNull();
    expect(assigned.columns[0]?.livePane).toEqual(pane);
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
        livePane: null,
      })),
      focusedIndex: 99,
    });
    expect(normalized.columns).toHaveLength(MAX_THREAD_WALL_COLUMNS);
    expect(normalized.focusedIndex).toBe(MAX_THREAD_WALL_COLUMNS - 1);
  });

  it("keeps persisted live panes and prefers them over a thread on the same column", () => {
    const normalized = normalizeThreadWallLayout({
      columns: [
        {
          id: "col-0",
          threadId: threadA,
          livePane: { session: " work ", paneId: " terminal_3 " },
        },
      ],
      focusedIndex: 0,
    });
    expect(normalized.columns[0]).toEqual({
      id: "col-0",
      threadId: null,
      livePane: { session: "work", paneId: "terminal_3" },
    });
  });

  it("treats a v1 thread-only column as a thread cell", () => {
    const normalized = normalizeThreadWallLayout({
      columns: [{ id: "col-0", threadId: threadA } as never],
      focusedIndex: 0,
    });
    expect(normalized.columns[0]?.threadId).toBe(threadA);
    expect(normalized.columns[0]?.livePane).toBeNull();
    expect(threadWallColumnKind(normalized.columns[0]!)).toBe("thread");
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

  it("leaves live-pty columns alone", () => {
    const pane = { session: "work", paneId: "terminal_1" };
    const layout = assignLivePaneColumn(
      assignThreadWallColumn(emptyThreadWallLayout(), 0, threadA),
      1,
      pane,
    );
    const pruned = pruneMissingThreadWallColumns(layout, new Set());
    expect(pruned.columns[0]?.threadId).toBeNull();
    expect(pruned.columns[1]?.livePane).toEqual(pane);
  });
});

describe("focusThreadWallColumn", () => {
  it("ignores out of range indexes", () => {
    const layout = emptyThreadWallLayout();
    expect(focusThreadWallColumn(layout, -1)).toBe(layout);
    expect(focusThreadWallColumn(layout, 8)).toBe(layout);
  });
});
