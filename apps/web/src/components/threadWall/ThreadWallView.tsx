import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { Columns2Icon, PlusIcon } from "lucide-react";
import { useEffect, useMemo } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { isElectron } from "../../env";
import { useHandleNewThread } from "../../hooks/useHandleNewThread";
import {
  EMPTY_THREAD_WALL_LAYOUT,
  MAX_THREAD_WALL_COLUMNS,
} from "../../threadWall/threadWallLayout";
import { useThreadWallStore } from "../../threadWall/threadWallStore";
import { useThreadShells } from "../../state/entities";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { ThreadWallColumn } from "./ThreadWallColumn";

export function ThreadWallView({ environmentId }: { environmentId: EnvironmentId }) {
  const { defaultProjectRef, handleNewThread } = useHandleNewThread();
  const shells = useThreadShells();
  const getDraftSessionByRef = useComposerDraftStore((store) => store.getDraftSessionByRef);
  const layout = useThreadWallStore(
    (state) => state.layoutByEnvironmentId[environmentId] ?? EMPTY_THREAD_WALL_LAYOUT,
  );
  const addColumn = useThreadWallStore((state) => state.addColumn);
  const removeColumn = useThreadWallStore((state) => state.removeColumn);
  const assignColumn = useThreadWallStore((state) => state.assignColumn);
  const focusColumn = useThreadWallStore((state) => state.focusColumn);
  const pruneMissing = useThreadWallStore((state) => state.pruneMissing);

  const liveThreadIds = useMemo(() => {
    const ids = new Set<ThreadId>();
    for (const shell of shells) {
      if (shell.environmentId === environmentId && shell.archivedAt === null) {
        ids.add(shell.id);
      }
    }
    for (const column of layout.columns) {
      if (column.threadId === null) continue;
      if (getDraftSessionByRef(scopeThreadRef(environmentId, column.threadId))) {
        ids.add(column.threadId);
      }
    }
    return ids;
  }, [environmentId, getDraftSessionByRef, layout.columns, shells]);

  useEffect(() => {
    pruneMissing(environmentId, liveThreadIds);
  }, [environmentId, liveThreadIds, pruneMissing]);

  const assignedThreadIds = useMemo(() => {
    const ids = new Set<ThreadId>();
    for (const column of layout.columns) {
      if (column.threadId !== null) ids.add(column.threadId);
    }
    return ids;
  }, [layout.columns]);

  const canAddColumn = layout.columns.length < MAX_THREAD_WALL_COLUMNS;

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <WorkspacePageHeader electron={isElectron} className="border-b border-border">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Columns2Icon className="size-4 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">Wall</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!canAddColumn}
              onClick={() => addColumn(environmentId)}
            >
              <PlusIcon />
              Column
            </Button>
          </div>
        </WorkspacePageHeader>
        <div className="flex min-h-0 min-w-0 flex-1 overflow-x-auto">
          {layout.columns.map((column, index) => (
            <ThreadWallColumn
              key={column.id}
              environmentId={environmentId}
              threadId={column.threadId}
              assignedThreadIds={assignedThreadIds}
              focused={index === layout.focusedIndex}
              acceptsWindowShortcuts={index === layout.focusedIndex}
              onFocus={() => focusColumn(environmentId, index)}
              onPickThread={(picked) => assignColumn(environmentId, index, picked)}
              onNewThread={() => {
                if (!defaultProjectRef) return;
                void handleNewThread(defaultProjectRef, { navigate: false }).then((opened) => {
                  if (!opened) return;
                  assignColumn(environmentId, index, opened.threadId);
                });
              }}
              onClear={() => assignColumn(environmentId, index, null)}
              onRemoveColumn={
                layout.columns.length > 1 ? () => removeColumn(environmentId, index) : null
              }
            />
          ))}
        </div>
      </div>
    </SidebarInset>
  );
}
