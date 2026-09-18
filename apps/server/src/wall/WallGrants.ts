/**
 * Per-mux-session inject allowlist. Default deny. Stored in userdata, not settings.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as ServerConfig from "../config.ts";

const WallGrantsFile = Schema.Struct({
  version: Schema.Literal(1),
  injectSessions: Schema.Array(Schema.String),
});

export class WallGrants extends Context.Service<
  WallGrants,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<string>>;
    readonly hasInject: (session: string) => Effect.Effect<boolean>;
    readonly grant: (session: string) => Effect.Effect<ReadonlyArray<string>>;
    readonly revoke: (session: string) => Effect.Effect<ReadonlyArray<string>>;
  }
>()("t3/wall/WallGrants") {}

const decodeFile = Schema.decodeUnknownEffect(WallGrantsFile);

const make = Effect.fn("WallGrants.make")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const config = yield* ServerConfig.ServerConfig;
  const path = config.wallGrantsPath;

  const readSessions = Effect.fn("WallGrants.read")(function* () {
    const exists = yield* fs.exists(path);
    if (!exists) return [] as Array<string>;
    const raw = yield* fs.readFileString(path);
    const json = yield* Effect.try({
      try: () => JSON.parse(raw) as unknown,
      catch: () => null,
    }).pipe(Effect.orElseSucceed(() => null));
    if (json === null) return [] as Array<string>;
    const parsed = yield* decodeFile(json).pipe(
      Effect.orElseSucceed(() => ({ version: 1 as const, injectSessions: [] as Array<string> })),
    );
    return [...new Set(parsed.injectSessions.filter((session) => session.length > 0))].toSorted();
  });

  const writeSessions = (sessions: ReadonlyArray<string>) =>
    fs.writeFileString(
      path,
      `${JSON.stringify({ version: 1, injectSessions: sessions }, null, 2)}\n`,
    );

  return WallGrants.of({
    list: () => readSessions(),
    hasInject: (session) =>
      readSessions().pipe(Effect.map((sessions) => sessions.includes(session))),
    grant: (session) =>
      Effect.gen(function* () {
        const current = yield* readSessions();
        if (current.includes(session)) return current;
        const next = [...current, session].toSorted();
        yield* writeSessions(next);
        return next;
      }),
    revoke: (session) =>
      Effect.gen(function* () {
        const current = yield* readSessions();
        const next = current.filter((name) => name !== session);
        if (next.length === current.length) return current;
        yield* writeSessions(next);
        return next;
      }),
  });
});

export const layer = Layer.effect(WallGrants, make());
