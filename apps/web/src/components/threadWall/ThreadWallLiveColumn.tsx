import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, MuxCmdHint, MuxPane } from "@t3tools/contracts";
import { useEffect, useMemo, useRef, useState } from "react";

import { wallGrant, wallInject, wallInventory, wallListGrants, wallWatch } from "../../state/wall";
import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironmentQuery } from "../../state/query";
import { isAgentCmdHint } from "../../threadWall/wallWatchState";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

function commandErrorMessage(failure: unknown): string {
  return failure instanceof Error && failure.message.trim().length > 0
    ? failure.message
    : "The wall request failed.";
}

function paneFromInventory(
  sessions: ReadonlyArray<{ name: string; panes: ReadonlyArray<MuxPane> }> | null,
  session: string,
  paneId: string,
): MuxPane | undefined {
  return sessions
    ?.find((candidate) => candidate.name === session)
    ?.panes.find((pane) => pane.id === paneId);
}

export function ThreadWallLiveColumn({
  environmentId,
  session,
  paneId,
}: {
  environmentId: EnvironmentId;
  session: string;
  paneId: string;
}) {
  const inventory = useEnvironmentQuery(wallInventory({ environmentId, input: {} }));
  const grants = useEnvironmentQuery(wallListGrants({ environmentId, input: {} }));
  const watch = useEnvironmentQuery(wallWatch({ environmentId, input: { session, paneId } }));
  const grant = useAtomCommand(wallGrant, { reportFailure: false });
  const inject = useAtomCommand(wallInject, { reportFailure: false });
  const pane = paneFromInventory(inventory.data?.sessions ?? null, session, paneId);
  const cmdHint: MuxCmdHint | undefined = pane?.cmdHint;
  const granted = grants.data?.sessions.includes(session) ?? false;
  const needsConfirm = !isAgentCmdHint(cmdHint);
  const grantAttempted = useRef<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmShell, setConfirmShell] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (granted) return;
    if (grantAttempted.current === session) return;
    grantAttempted.current = session;
    void grant({ environmentId, input: { session } });
  }, [environmentId, grant, granted, session]);

  const viewport = watch.data?.viewport ?? [];
  const closed = watch.data?.closed === true;
  const status = useMemo(() => {
    if (watch.error !== null) return watch.error;
    if (closed) return "Pane closed.";
    if (viewport.length === 0) return "Waiting for pane frames…";
    return null;
  }, [closed, viewport.length, watch.error]);

  async function send() {
    const text = draft.trim();
    if (text.length === 0 || pending || closed) return;
    if (needsConfirm && !confirmShell) {
      setError("Confirm sending to a non-agent pane.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (!granted) {
        const grantedResult = await grant({ environmentId, input: { session } });
        if (grantedResult._tag === "Failure") {
          if (!isAtomCommandInterrupted(grantedResult)) {
            setError(commandErrorMessage(squashAtomCommandFailure(grantedResult)));
          }
          return;
        }
      }
      const result = await inject({
        environmentId,
        input: {
          session,
          paneId,
          text,
          submit: true,
          ...(needsConfirm ? { confirmShell } : {}),
        },
      });
      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          setError(commandErrorMessage(squashAtomCommandFailure(result)));
        }
        return;
      }
      setDraft("");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 pr-10">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {session} / {paneId}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {cmdHint ?? "live pane"}
            {pane?.title ? ` · ${pane.title}` : ""}
            {granted ? " · inject granted" : " · grant inject to type"}
          </p>
        </div>
        {!granted ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => {
              void grant({ environmentId, input: { session } });
            }}
          >
            Grant
          </Button>
        ) : null}
      </div>
      <pre className="min-h-0 flex-1 overflow-auto bg-muted/30 p-3 font-mono text-[11px] leading-tight text-foreground whitespace-pre">
        {viewport.length > 0 ? viewport.join("\n") : status}
      </pre>
      {error !== null ? (
        <p className="border-t border-border px-3 py-2 text-xs text-destructive">{error}</p>
      ) : status !== null && viewport.length > 0 ? (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">{status}</p>
      ) : null}
      <form
        className="flex flex-col gap-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Textarea
          size="sm"
          value={draft}
          disabled={pending || closed}
          placeholder={closed ? "Pane closed" : "Type to inject into this pane"}
          aria-label="Inject into live pane"
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {needsConfirm ? (
            <Label className="text-xs font-normal text-muted-foreground">
              <Checkbox
                checked={confirmShell}
                onCheckedChange={(value) => setConfirmShell(value === true)}
              />
              Send to shell
            </Label>
          ) : (
            <span />
          )}
          <Button
            type="submit"
            size="sm"
            disabled={
              pending || closed || draft.trim().length === 0 || (needsConfirm && !confirmShell)
            }
          >
            Inject
          </Button>
        </div>
      </form>
    </div>
  );
}
