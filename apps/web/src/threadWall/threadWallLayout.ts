/**
 * Pure layout for the thread wall: one row of columns, each empty or a thread.
 * Persist the result; do not put Zellij or live-pty cells here.
 */
import type { ThreadId } from "@t3tools/contracts";

export const MIN_THREAD_WALL_COLUMNS = 1;
export const MAX_THREAD_WALL_COLUMNS = 8;
export const DEFAULT_THREAD_WALL_COLUMNS = 2;

export interface ThreadWallColumn {
  readonly id: string;
  readonly threadId: ThreadId | null;
}

export interface ThreadWallLayout {
  readonly columns: ReadonlyArray<ThreadWallColumn>;
  readonly focusedIndex: number;
}

let nextColumnId = 0;

export function createThreadWallColumnId(): string {
  nextColumnId += 1;
  return `wall-col-${nextColumnId}`;
}

function emptyColumn(id: string): ThreadWallColumn {
  return { id, threadId: null };
}

export const EMPTY_THREAD_WALL_LAYOUT: ThreadWallLayout = {
  columns: [emptyColumn("wall-col-default-0"), emptyColumn("wall-col-default-1")],
  focusedIndex: 0,
};

export function emptyThreadWallLayout(
  columnCount: number = DEFAULT_THREAD_WALL_COLUMNS,
): ThreadWallLayout {
  const count = clampColumnCount(columnCount);
  if (count === DEFAULT_THREAD_WALL_COLUMNS) return EMPTY_THREAD_WALL_LAYOUT;
  return {
    columns: Array.from({ length: count }, () => emptyColumn(createThreadWallColumnId())),
    focusedIndex: 0,
  };
}

export function clampColumnCount(count: number): number {
  if (!Number.isFinite(count)) return DEFAULT_THREAD_WALL_COLUMNS;
  return Math.min(MAX_THREAD_WALL_COLUMNS, Math.max(MIN_THREAD_WALL_COLUMNS, Math.trunc(count)));
}

export function normalizeThreadWallLayout(layout: ThreadWallLayout): ThreadWallLayout {
  const columns = layout.columns.slice(0, MAX_THREAD_WALL_COLUMNS).map((column, index) =>
    typeof column === "object" && column !== null && "id" in column
      ? {
          id:
            typeof column.id === "string" && column.id.length > 0 ? column.id : `wall-col-${index}`,
          threadId: column.threadId ?? null,
        }
      : emptyColumn(`wall-col-${index}`),
  );
  while (columns.length < MIN_THREAD_WALL_COLUMNS) {
    columns.push(emptyColumn(createThreadWallColumnId()));
  }
  const focusedIndex = clampFocus(layout.focusedIndex, columns.length);
  return { columns, focusedIndex };
}

export function addThreadWallColumn(layout: ThreadWallLayout): ThreadWallLayout {
  if (layout.columns.length >= MAX_THREAD_WALL_COLUMNS) return layout;
  const columns = [...layout.columns, emptyColumn(createThreadWallColumnId())];
  return { columns, focusedIndex: columns.length - 1 };
}

export function removeThreadWallColumn(layout: ThreadWallLayout, index: number): ThreadWallLayout {
  if (layout.columns.length <= MIN_THREAD_WALL_COLUMNS) return layout;
  if (index < 0 || index >= layout.columns.length) return layout;
  const columns = layout.columns.filter((_, columnIndex) => columnIndex !== index);
  return {
    columns,
    focusedIndex: clampFocus(
      layout.focusedIndex === index
        ? index
        : layout.focusedIndex > index
          ? layout.focusedIndex - 1
          : layout.focusedIndex,
      columns.length,
    ),
  };
}

export function assignThreadWallColumn(
  layout: ThreadWallLayout,
  index: number,
  threadId: ThreadId | null,
): ThreadWallLayout {
  if (index < 0 || index >= layout.columns.length) return layout;
  const columns = layout.columns.map((column, columnIndex) => {
    if (columnIndex === index) return { ...column, threadId };
    if (threadId !== null && column.threadId === threadId) {
      return { ...column, threadId: null };
    }
    return column;
  });
  return { columns, focusedIndex: index };
}

export function focusThreadWallColumn(layout: ThreadWallLayout, index: number): ThreadWallLayout {
  if (index < 0 || index >= layout.columns.length) return layout;
  if (index === layout.focusedIndex) return layout;
  return { ...layout, focusedIndex: index };
}

export function pruneMissingThreadWallColumns(
  layout: ThreadWallLayout,
  liveThreadIds: ReadonlySet<ThreadId>,
): ThreadWallLayout {
  let changed = false;
  const columns = layout.columns.map((column) => {
    if (column.threadId === null || liveThreadIds.has(column.threadId)) return column;
    changed = true;
    return { ...column, threadId: null };
  });
  return changed ? { ...layout, columns } : layout;
}

function clampFocus(index: number, length: number): number {
  if (length <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(length - 1, Math.max(0, Math.trunc(index)));
}
