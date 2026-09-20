import type { MuxInventory, MuxPane, MuxSession } from "@t3tools/contracts";

export function visibleWallSessions(
  inventory: MuxInventory | null | undefined,
): ReadonlyArray<MuxSession> {
  if (inventory === null || inventory === undefined) return [];
  return inventory.sessions.filter((session) => !session.exited);
}

export function visibleWallPanes(session: MuxSession | undefined): ReadonlyArray<MuxPane> {
  if (session === undefined) return [];
  return session.panes.filter((pane) => !pane.exited);
}

export function wallPaneSubtitle(pane: MuxPane): string {
  return pane.title.trim().length > 0 ? `${pane.cmdHint} · ${pane.title}` : pane.cmdHint;
}

export function wallCommandErrorMessage(failure: unknown): string {
  return failure instanceof Error && failure.message.trim().length > 0
    ? failure.message
    : "The wall request failed.";
}
