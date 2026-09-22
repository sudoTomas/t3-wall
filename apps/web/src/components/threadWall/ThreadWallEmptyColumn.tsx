import { wallPaneLabel, wallPaneSubtitle } from "@t3tools/client-runtime/state/wall";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { MessageSquareIcon, PlusIcon, TerminalIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { useProjects, useThreadShells } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { wallInventory } from "../../state/wall";
import { livePaneKey, type ThreadWallLivePane } from "../../threadWall/threadWallLayout";
import { Button } from "../ui/button";
import { Command, CommandInput, CommandItem, CommandList } from "../ui/command";

export function ThreadWallEmptyColumn({
  environmentId,
  assignedThreadIds,
  assignedLivePaneKeys,
  onPickThread,
  onPickLivePane,
  onNewThread,
  onRemoveColumn,
}: {
  environmentId: EnvironmentId;
  assignedThreadIds: ReadonlySet<ThreadId>;
  assignedLivePaneKeys: ReadonlySet<string>;
  onPickThread: (threadId: ThreadId) => void;
  onPickLivePane: (pane: ThreadWallLivePane) => void;
  onNewThread: () => void;
  onRemoveColumn: (() => void) | null;
}) {
  const threads = useThreadShells();
  const projects = useProjects();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"threads" | "panes">("threads");
  const inventory = useEnvironmentQuery(
    mode === "panes" ? wallInventory({ environmentId, input: {} }) : null,
  );
  const projectNames = useMemo(
    () =>
      new Map(
        projects
          .filter((project) => project.environmentId === environmentId)
          .map((project) => [project.id, project.title]),
      ),
    [environmentId, projects],
  );
  const search = query.trim().toLocaleLowerCase();
  const candidates = threads
    .filter(
      (thread) =>
        thread.environmentId === environmentId &&
        thread.archivedAt === null &&
        !assignedThreadIds.has(thread.id) &&
        `${thread.title} ${projectNames.get(thread.projectId) ?? ""}`
          .toLocaleLowerCase()
          .includes(search),
    )
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const paneCandidates = (inventory.data?.sessions ?? []).flatMap((session) => {
    if (session.exited) return [];
    return session.panes
      .filter((pane) => {
        if (pane.exited) return false;
        if (assignedLivePaneKeys.has(livePaneKey({ session: session.name, paneId: pane.id }))) {
          return false;
        }
        return `${session.name} ${session.title ?? ""} ${pane.id} ${pane.title} ${pane.cmdHint}`
          .toLocaleLowerCase()
          .includes(search);
      })
      .map((pane) => ({ session: session.name, pane }));
  });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col items-stretch gap-3 p-4">
      <p className="text-sm font-medium text-foreground">Empty column</p>
      <p className="text-sm text-muted-foreground">
        Pick a thread, start a new one, or bind a live pane.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onNewThread}>
          <PlusIcon />
          New thread
        </Button>
        <Button
          type="button"
          variant={mode === "panes" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("panes")}
        >
          <TerminalIcon />
          Bind pane
        </Button>
        {mode === "panes" ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setMode("threads")}>
            Threads
          </Button>
        ) : null}
        {onRemoveColumn ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemoveColumn}>
            Remove column
          </Button>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
        {mode === "threads" ? (
          <Command
            mode="none"
            value={query}
            onValueChange={setQuery}
            aria-label="Choose a thread for this column"
          >
            <CommandInput placeholder="Search threads…" />
            <CommandList className="max-h-none flex-1 overflow-y-auto">
              {candidates.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No other threads in this environment.
                </div>
              ) : (
                candidates.map((thread) => (
                  <CommandItem
                    key={thread.id}
                    value={thread.id}
                    onClick={() => onPickThread(thread.id)}
                  >
                    <MessageSquareIcon aria-hidden className="size-4 shrink-0" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{thread.title || "Untitled thread"}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {projectNames.get(thread.projectId)}
                      </span>
                    </span>
                  </CommandItem>
                ))
              )}
            </CommandList>
          </Command>
        ) : (
          <Command
            mode="none"
            value={query}
            onValueChange={setQuery}
            aria-label="Choose a live pane for this column"
          >
            <CommandInput placeholder="Search panes…" />
            <CommandList className="max-h-none flex-1 overflow-y-auto">
              {inventory.error !== null ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {inventory.error}
                </div>
              ) : inventory.isPending ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Looking for live panes…
                </div>
              ) : paneCandidates.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No live panes on this environment.
                </div>
              ) : (
                paneCandidates.map(({ session, pane }) => (
                  <CommandItem
                    key={`${session}:${pane.id}`}
                    value={`${session}:${pane.id}:${pane.title}:${pane.cmdHint}`}
                    onClick={() => onPickLivePane({ session, paneId: pane.id })}
                  >
                    <TerminalIcon aria-hidden className="size-4 shrink-0" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{wallPaneLabel(pane)}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {wallPaneSubtitle(
                          pane,
                          inventory.data?.sessions.find((item) => item.name === session),
                        )}
                      </span>
                    </span>
                  </CommandItem>
                ))
              )}
            </CommandList>
          </Command>
        )}
      </div>
    </div>
  );
}
