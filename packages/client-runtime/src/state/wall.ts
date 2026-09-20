import {
  WS_METHODS,
  type MuxCmdHint,
  type WallWatchEvent,
  type WallWatchInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { subscribe } from "../rpc/client.ts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentSubscriptionAtomFamily,
} from "./runtime.ts";

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

export function createWallEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const listGrants = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "environment-data:wall:list-grants",
    tag: WS_METHODS.wallListGrants,
    staleTimeMs: 5_000,
    idleTtlMs: 60_000,
  });
  return {
    inventory: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:wall:inventory",
      tag: WS_METHODS.wallInventory,
      staleTimeMs: 5_000,
      idleTtlMs: 60_000,
    }),
    listGrants,
    grant: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:wall:grant",
      tag: WS_METHODS.wallGrant,
      onSuccess: ({ environmentId }, registry) =>
        Effect.sync(() => registry.refresh(listGrants({ environmentId, input: {} }))),
    }),
    inject: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:wall:inject",
      tag: WS_METHODS.wallInject,
    }),
    watch: createEnvironmentSubscriptionAtomFamily(runtime, {
      label: "environment-data:wall:watch",
      idleTtlMs: 0,
      subscribe: (input: WallWatchInput) =>
        subscribe(WS_METHODS.wallWatch, input).pipe(
          Stream.scan(emptyWallWatchView(input.session, input.paneId), applyWallWatchEvent),
        ),
    }),
  };
}
