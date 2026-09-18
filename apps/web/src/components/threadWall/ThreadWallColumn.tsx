import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { XIcon } from "lucide-react";

import ChatView from "../ChatView";
import { useComposerDraftStore } from "../../composerDraftStore";
import { Button } from "../ui/button";
import { ThreadWallEmptyColumn } from "./ThreadWallEmptyColumn";

export function ThreadWallColumn({
  environmentId,
  threadId,
  assignedThreadIds,
  focused,
  acceptsWindowShortcuts,
  onFocus,
  onPickThread,
  onNewThread,
  onClear,
  onRemoveColumn,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId | null;
  assignedThreadIds: ReadonlySet<ThreadId>;
  focused: boolean;
  acceptsWindowShortcuts: boolean;
  onFocus: () => void;
  onPickThread: (threadId: ThreadId) => void;
  onNewThread: () => void;
  onClear: () => void;
  onRemoveColumn: (() => void) | null;
}) {
  const threadRef = threadId === null ? null : scopeThreadRef(environmentId, threadId);
  const draftId = useComposerDraftStore((store) =>
    threadRef === null ? null : store.getDraftIdByRef(threadRef),
  );

  return (
    <section
      className="relative flex min-h-0 min-w-[18rem] flex-1 flex-col overflow-hidden border-r border-border last:border-r-0"
      data-thread-wall-column=""
      data-focused={focused ? "true" : "false"}
      onMouseDown={onFocus}
    >
      {threadId === null ? (
        <ThreadWallEmptyColumn
          environmentId={environmentId}
          assignedThreadIds={assignedThreadIds}
          onPickThread={onPickThread}
          onNewThread={onNewThread}
          onRemoveColumn={onRemoveColumn}
        />
      ) : (
        <>
          <div className="absolute top-1.5 right-1.5 z-30">
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Clear column"
              onClick={(event) => {
                event.stopPropagation();
                onClear();
              }}
            >
              <XIcon />
            </Button>
          </div>
          {draftId ? (
            <ChatView
              key={draftId}
              environmentId={environmentId}
              threadId={threadId}
              draftId={draftId}
              routeKind="draft"
              reserveTitleBarControlInset={false}
              acceptsWindowShortcuts={acceptsWindowShortcuts}
            />
          ) : (
            <ChatView
              environmentId={environmentId}
              threadId={threadId}
              routeKind="server"
              reserveTitleBarControlInset={false}
              acceptsWindowShortcuts={acceptsWindowShortcuts}
            />
          )}
        </>
      )}
    </section>
  );
}
