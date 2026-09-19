/**
 * Wall RPC surface: inventory, inject, and per-session grants.
 * Inject is default-deny until wall.grant names the mux session.
 */
import {
  MuxInjectUnauthorizedError,
  type MuxInventory,
  type WallError,
  type WallGrantList,
  type WallInjectInput,
  type WallInjectResult,
  type WallInventoryInput,
  type WallWatchEvent,
  type WallWatchInput,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as ProcessRunner from "../processRunner.ts";
import { inject as injectPane, listInventory, watch as watchPane } from "./ZellijCtl.ts";
import * as WallGrants from "./WallGrants.ts";

export class WallService extends Context.Service<
  WallService,
  {
    readonly inventory: (input: WallInventoryInput) => Effect.Effect<MuxInventory, WallError>;
    readonly inject: (input: WallInjectInput) => Effect.Effect<WallInjectResult, WallError>;
    readonly grant: (session: string) => Effect.Effect<WallGrantList>;
    readonly revoke: (session: string) => Effect.Effect<WallGrantList>;
    readonly listGrants: () => Effect.Effect<WallGrantList>;
    readonly watch: (input: WallWatchInput) => Stream.Stream<WallWatchEvent, WallError>;
  }
>()("t3/wall/WallService") {}

const make = Effect.fn("WallService.make")(function* () {
  const grants = yield* WallGrants.WallGrants;
  const runner = yield* ProcessRunner.ProcessRunner;
  const withRunner = <A, E>(effect: Effect.Effect<A, E, ProcessRunner.ProcessRunner>) =>
    effect.pipe(Effect.provideService(ProcessRunner.ProcessRunner, runner));

  return WallService.of({
    inventory: (input) =>
      withRunner(
        listInventory(input.session === undefined ? undefined : { session: input.session }),
      ),
    inject: (input) =>
      withRunner(
        Effect.gen(function* () {
          const allowed = yield* grants.hasInject(input.session);
          if (!allowed) {
            return yield* new MuxInjectUnauthorizedError({ session: input.session });
          }
          return yield* injectPane({
            session: input.session,
            paneId: input.paneId,
            text: input.text,
            submit: input.submit !== false,
            confirmShell: input.confirmShell,
          });
        }),
      ),
    grant: (session) => grants.grant(session).pipe(Effect.map((sessions) => ({ sessions }))),
    revoke: (session) => grants.revoke(session).pipe(Effect.map((sessions) => ({ sessions }))),
    listGrants: () => grants.list().pipe(Effect.map((sessions) => ({ sessions }))),
    watch: (input) =>
      watchPane(input).pipe(Stream.provideService(ProcessRunner.ProcessRunner, runner)),
  });
});

export const layerFromContext = Layer.effect(WallService, make()).pipe(
  Layer.provide(WallGrants.layer),
);

export const layer = layerFromContext.pipe(Layer.provide(ProcessRunner.layer));
