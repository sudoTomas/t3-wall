import {
  wallPaneLabel,
  wallPaneSubtitle,
  wallSessionLabel,
} from "@t3tools/client-runtime/state/wall";
import type { MuxInventory, MuxPane, MuxSession } from "@t3tools/contracts";

export { wallPaneLabel, wallPaneSubtitle, wallSessionLabel };

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

export function wallCommandErrorMessage(failure: unknown): string {
  return failure instanceof Error && failure.message.trim().length > 0
    ? failure.message
    : "The wall request failed.";
}
