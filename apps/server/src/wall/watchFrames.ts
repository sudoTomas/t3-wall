import type { WallError, WallWatchEvent } from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import * as Stream from "effect/Stream";

export const MAX_VIEWPORT_LINES = 200;
export const MIN_FRAME_INTERVAL = Duration.millis(80);
export const DUMP_SCREEN_POLL = Duration.millis(200);

export function clipViewport(lines: ReadonlyArray<string>): ReadonlyArray<string> {
  return lines.slice(0, MAX_VIEWPORT_LINES);
}

export function dumpScreenToFrame(
  session: string,
  paneId: string,
  stdout: string,
  initial: boolean,
): WallWatchEvent {
  return {
    type: "frame",
    session,
    paneId,
    viewport: clipViewport(stdout.split("\n")),
    initial,
  };
}

export function shouldEmitWatchEvent(
  previous: WallWatchEvent | null,
  next: WallWatchEvent,
  elapsedSinceEmit: Duration.Duration,
): boolean {
  if (next.type === "closed") return true;
  if (next.type === "frame" && next.initial) return true;
  if (previous?.type === "frame" && next.type === "frame") {
    if (previous.viewport.join("\n") === next.viewport.join("\n")) return false;
  }
  return Duration.toMillis(elapsedSinceEmit) >= Duration.toMillis(MIN_FRAME_INTERVAL);
}

export const coalesceWatchEvents = (events: Stream.Stream<WallWatchEvent, WallError, never>) => {
  let previous: WallWatchEvent | null = null;
  let lastEmitMs = 0;
  return events.pipe(
    Stream.filter((event) => {
      const now = Date.now();
      const elapsed = Duration.millis(Math.max(0, now - lastEmitMs));
      if (!shouldEmitWatchEvent(previous, event, elapsed)) return false;
      previous = event;
      lastEmitMs = now;
      return true;
    }),
  );
};
