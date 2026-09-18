import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { MessageSquareIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { useProjects, useThreadShells } from "../../state/entities";
import { Button } from "../ui/button";
import { Command, CommandInput, CommandItem, CommandList } from "../ui/command";

export function ThreadWallEmptyColumn({
  environmentId,
  assignedThreadIds,
  onPickThread,
  onNewThread,
  onRemoveColumn,
}: {
  environmentId: EnvironmentId;
  assignedThreadIds: ReadonlySet<ThreadId>;
  onPickThread: (threadId: ThreadId) => void;
  onNewThread: () => void;
  onRemoveColumn: (() => void) | null;
}) {
  const threads = useThreadShells();
  const projects = useProjects();
  const [query, setQuery] = useState("");
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

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col items-stretch gap-3 p-4">
      <p className="text-sm font-medium text-foreground">Empty column</p>
      <p className="text-sm text-muted-foreground">Pick a thread or start a new one.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onNewThread}>
          <PlusIcon />
          New thread
        </Button>
        {onRemoveColumn ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemoveColumn}>
            Remove column
          </Button>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
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
      </div>
    </div>
  );
}
