/**
 * Wall mux: Zellij sessions plus iTerm windows (`iterm:<windowId>`).
 * Missing iTerm is omitted from a full inventory; missing Zellij is omitted
 * when iTerm still has sessions. Targeting one kind still returns that kind's
 * typed error.
 */
import {
  MuxNotFoundError,
  type MuxInventory,
  type WallError,
  type WallWatchEvent,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import * as ProcessRunner from "../processRunner.ts";
import * as ItermCtl from "./ItermCtl.ts";
import {
  inject as injectZellij,
  listInventory as listZellij,
  watch as watchZellij,
  type MuxInjectInput,
  type MuxInjectResult,
} from "./ZellijCtl.ts";

export { isItermSession, itermSessionName } from "./ItermCtl.ts";
export type { MuxInjectInput, MuxInjectResult };

export const listInventory = Effect.fn("wall.mux.listInventory")(function* (input?: {
  readonly session?: string;
}) {
  const wanted = input?.session;
  if (wanted !== undefined && ItermCtl.isItermSession(wanted)) {
    return yield* ItermCtl.listInventory({ session: wanted });
  }
  if (wanted !== undefined) {
    return yield* listZellij({ session: wanted });
  }

  const zellij = yield* listZellij().pipe(
    Effect.catchTag("MuxNotFoundError", () => Effect.succeed(null)),
  );
  const iterm = yield* ItermCtl.listInventory().pipe(
    Effect.catchTag("ItermNotFoundError", () => Effect.succeed(null)),
  );
  if (zellij === null && iterm === null) {
    return yield* new MuxNotFoundError({});
  }
  return {
    sessions: [...(zellij?.sessions ?? []), ...(iterm?.sessions ?? [])],
  } satisfies MuxInventory;
});

export const inject = Effect.fn("wall.mux.inject")(function* (input: MuxInjectInput) {
  if (ItermCtl.isItermSession(input.session)) {
    return yield* ItermCtl.inject(input);
  }
  return yield* injectZellij(input);
});

export const watch = (input: {
  readonly session: string;
  readonly paneId: string;
}): Stream.Stream<WallWatchEvent, WallError, ProcessRunner.ProcessRunner> =>
  ItermCtl.isItermSession(input.session) ? ItermCtl.watch(input) : watchZellij(input);
