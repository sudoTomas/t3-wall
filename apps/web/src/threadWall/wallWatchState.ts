import type { MuxCmdHint, WallWatchEvent } from "@t3tools/contracts";

export interface WallWatchView {
  readonly session: string;
  readonly paneId: string;
  readonly viewport: ReadonlyArray<string>;
  readonly closed: boolean;
}

export function emptyWallWatchView(session: string, paneId: string): WallWatchView {
  return { session, paneId, viewport: [], closed: false };
}

export function applyWallWatchEvent(current: WallWatchView, event: WallWatchEvent): WallWatchView {
  if (event.type === "closed") {
    return {
      session: event.session,
      paneId: event.paneId,
      viewport: current.viewport,
      closed: true,
    };
  }
  return {
    session: event.session,
    paneId: event.paneId,
    viewport: event.viewport,
    closed: false,
  };
}

export function isAgentCmdHint(hint: MuxCmdHint | undefined): boolean {
  return hint !== undefined && hint !== "zsh" && hint !== "unknown";
}
