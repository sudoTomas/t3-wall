import { WS_METHODS, type WallWatchInput } from "@t3tools/contracts";
import { subscribe } from "@t3tools/client-runtime/rpc";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import { connectionAtomRuntime } from "../connection/runtime";
import { applyWallWatchEvent, emptyWallWatchView } from "../threadWall/wallWatchState";

export const wallInventory = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:wall:inventory",
  tag: WS_METHODS.wallInventory,
  staleTimeMs: 5_000,
  idleTtlMs: 60_000,
});

export const wallListGrants = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:wall:list-grants",
  tag: WS_METHODS.wallListGrants,
  staleTimeMs: 5_000,
  idleTtlMs: 60_000,
});

export const wallGrant = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:wall:grant",
  tag: WS_METHODS.wallGrant,
  onSuccess: ({ environmentId }, registry) =>
    Effect.sync(() => registry.refresh(wallListGrants({ environmentId, input: {} }))),
});

export const wallInject = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:wall:inject",
  tag: WS_METHODS.wallInject,
});

export const wallWatch = createEnvironmentSubscriptionAtomFamily(connectionAtomRuntime, {
  label: "environment-data:wall:watch",
  idleTtlMs: 0,
  subscribe: (input: WallWatchInput) =>
    subscribe(WS_METHODS.wallWatch, input).pipe(
      Stream.scan(emptyWallWatchView(input.session, input.paneId), applyWallWatchEvent),
    ),
});
