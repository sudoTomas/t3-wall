/**
 * ZellijCtl wraps `zellij --session` from outside a session.
 *
 * Wall inventory and inject must target a named session while `ZELLIJ` is
 * unset. Success of inject means Zellij accepted the action, not that an
 * agent finished a turn.
 */
import {
  MuxCommandFailedError,
  MuxInjectRefusedError,
  MuxNotFoundError,
  MuxPaneNotFoundError,
  MuxSessionNotFoundError,
  type MuxCmdHint,
  type MuxInventory,
  type MuxPane,
  type MuxSession,
  type WallError,
  type WallWatchEvent,
  inferMuxPaneActivity,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import * as ProcessRunner from "../processRunner.ts";
import { accountHintFrom, cmdHintFrom, isAgentHint } from "./cmdHint.ts";
import {
  DUMP_SCREEN_POLL,
  clipViewport,
  coalesceWatchEvents,
  dumpScreenToFrame,
} from "./watchFrames.ts";

export {
  MuxCommandFailedError,
  MuxInjectRefusedError,
  MuxNotFoundError,
  MuxPaneNotFoundError,
  MuxSessionNotFoundError,
};

export { dumpScreenToFrame, shouldEmitWatchEvent } from "./watchFrames.ts";

export type { MuxCmdHint, MuxInventory, MuxPane, MuxSession };

export interface MuxInjectInput {
  readonly session: string;
  readonly paneId: string;
  readonly text: string;
  readonly submit: boolean;
  readonly confirmShell?: boolean;
}

export interface MuxInjectResult {
  readonly accepted: true;
}

const ZellijPaneJson = Schema.Struct({
  id: Schema.Number,
  is_plugin: Schema.optional(Schema.Boolean),
  title: Schema.optional(Schema.String),
  terminal_command: Schema.optional(Schema.NullOr(Schema.String)),
  pane_cwd: Schema.optional(Schema.String),
  plugin_url: Schema.optional(Schema.NullOr(Schema.String)),
  exited: Schema.optional(Schema.Boolean),
  tab_name: Schema.optional(Schema.String),
});
const ZellijPanesJson = Schema.Array(ZellijPaneJson);
const decodePanesJson = Schema.decodeUnknownEffect(Schema.fromJsonString(ZellijPanesJson));

const SESSION_LINE =
  /^(?<name>\S+)\s+\[Created\s+(?<created>[^\]]+)\](?<exited>\s+\(EXITED[^)]*\))?/;

function parseSessionLines(stdout: string): ReadonlyArray<Omit<MuxSession, "panes">> {
  const sessions: Array<Omit<MuxSession, "panes">> = [];
  for (const line of stdout.split("\n")) {
    const match = line.trim().match(SESSION_LINE);
    if (match?.groups === undefined) continue;
    sessions.push({
      name: match.groups.name ?? "",
      createdAt: match.groups.created?.trim(),
      exited: match.groups.exited !== undefined,
    });
  }
  return sessions;
}

function paneIdOf(pane: typeof ZellijPaneJson.Type): string {
  return pane.is_plugin === true ? `plugin_${pane.id}` : `terminal_${pane.id}`;
}

function toMuxPane(pane: typeof ZellijPaneJson.Type): MuxPane {
  const title = pane.title ?? "";
  const command = pane.terminal_command ?? undefined;
  const accountHint = accountHintFrom(command, title);
  return {
    id: paneIdOf(pane),
    title,
    cmdHint: cmdHintFrom(command, title),
    ...(accountHint === undefined ? {} : { accountHint }),
    ...(pane.pane_cwd === undefined ? {} : { cwd: pane.pane_cwd }),
    exited: pane.exited === true,
    ...(pane.tab_name === undefined ? {} : { tabName: pane.tab_name }),
  };
}

const zellijArgs = (args: ReadonlyArray<string>): ProcessRunner.ProcessRunInput => ({
  command: "zellij",
  args,
});

const runZellij = Effect.fn("wall.runZellij")(function* (
  args: ReadonlyArray<string>,
  operation: string,
) {
  const runner = yield* ProcessRunner.ProcessRunner;
  const result = yield* runner.run(zellijArgs(args)).pipe(
    Effect.catchTag(
      "ProcessSpawnError",
      (cause) => new MuxNotFoundError({ detail: cause.message }),
    ),
    Effect.catchTag(
      "ProcessTimeoutError",
      () => new MuxCommandFailedError({ operation, detail: "timed out" }),
    ),
    Effect.catchTag(
      "ProcessStdinError",
      (cause) => new MuxCommandFailedError({ operation, detail: cause.message }),
    ),
    Effect.catchTag(
      "ProcessOutputLimitError",
      (cause) => new MuxCommandFailedError({ operation, detail: cause.message }),
    ),
    Effect.catchTag(
      "ProcessReadError",
      (cause) => new MuxCommandFailedError({ operation, detail: cause.message }),
    ),
  );

  const code = result.code === null ? 1 : Number(result.code);
  if (code === 127) {
    return yield* new MuxNotFoundError({ detail: result.stderr.trim() || undefined });
  }
  if (code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    if (/no active session/i.test(detail)) {
      const sessionIndex = args.indexOf("--session");
      const session = sessionIndex >= 0 ? args[sessionIndex + 1] : undefined;
      if (session !== undefined) {
        return yield* new MuxSessionNotFoundError({ session });
      }
    }
    return yield* new MuxCommandFailedError({
      operation,
      ...(detail.length > 0 ? { detail } : {}),
    });
  }
  return result.stdout;
});

const listPanes = Effect.fn("wall.listPanes")(function* (session: string) {
  const stdout = yield* runZellij(
    ["--session", session, "action", "list-panes", "--json", "--command", "--state", "--tab"],
    "list-panes",
  );
  const panes = yield* decodePanesJson(stdout).pipe(
    Effect.mapError(
      (cause) =>
        new MuxCommandFailedError({
          operation: "list-panes",
          detail: cause.message,
        }),
    ),
  );
  return panes.filter((pane) => pane.is_plugin !== true).map(toMuxPane);
});

export const listInventory = Effect.fn("wall.listInventory")(function* (input?: {
  readonly session?: string;
}) {
  const stdout = yield* runZellij(["list-sessions", "--no-formatting"], "list-sessions");
  const listed = parseSessionLines(stdout);
  const wanted = input?.session;
  const selected =
    wanted === undefined ? listed : listed.filter((session) => session.name === wanted);
  if (wanted !== undefined && selected.length === 0) {
    return yield* new MuxSessionNotFoundError({ session: wanted });
  }

  const sessions: Array<MuxSession> = [];
  for (const session of selected) {
    if (session.exited) {
      sessions.push({ ...session, panes: [] });
      continue;
    }
    const panes = yield* listPanes(session.name);
    sessions.push({ ...session, panes });
  }
  return { sessions } satisfies MuxInventory;
});

export const inject = Effect.fn("wall.inject")(function* (input: MuxInjectInput) {
  const text = input.text;
  if (text.length === 0) {
    return yield* new MuxCommandFailedError({
      operation: "paste",
      detail: "inject text is empty",
    });
  }

  const panes = yield* listPanes(input.session);
  const pane = panes.find((candidate) => candidate.id === input.paneId);
  if (pane === undefined) {
    return yield* new MuxPaneNotFoundError({ session: input.session, paneId: input.paneId });
  }
  if (!isAgentHint(pane.cmdHint) && input.confirmShell !== true) {
    return yield* new MuxInjectRefusedError({
      session: input.session,
      paneId: input.paneId,
      cmdHint: pane.cmdHint,
    });
  }

  yield* runZellij(
    ["--session", input.session, "action", "paste", "--pane-id", input.paneId, text],
    "paste",
  );
  if (input.submit) {
    yield* runZellij(
      ["--session", input.session, "action", "send-keys", "--pane-id", input.paneId, "Enter"],
      "send-keys",
    );
  }
  return { accepted: true } as const;
});

const SubscribeLine = Schema.Struct({
  event: Schema.optional(Schema.String),
  pane_id: Schema.optional(Schema.String),
  viewport: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  is_initial: Schema.optional(Schema.Boolean),
});
const decodeSubscribeLine = Schema.decodeUnknownOption(SubscribeLine);

export function parseSubscribeLine(session: string, line: string): WallWatchEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const decoded = decodeSubscribeLine(json);
  if (decoded._tag === "None") return null;
  const payload = decoded.value;
  const paneId = payload.pane_id;
  if (paneId === undefined) return null;
  if (payload.event === "pane_closed") {
    return { type: "closed", session, paneId };
  }
  if (payload.event !== "pane_update") return null;
  const viewport = clipViewport(payload.viewport ?? []);
  return {
    type: "frame",
    session,
    paneId,
    viewport,
    initial: payload.is_initial === true,
    activity: inferMuxPaneActivity(viewport),
  };
}

const mapStreamProcessError = <A>(
  stream: Stream.Stream<A, ProcessRunner.ProcessSpawnError | ProcessRunner.ProcessReadError>,
) =>
  stream.pipe(
    Stream.mapError((error) =>
      error._tag === "ProcessSpawnError"
        ? new MuxNotFoundError({ detail: error.message })
        : new MuxCommandFailedError({ operation: "subscribe", detail: error.message }),
    ),
  );

export const watch = (input: {
  readonly session: string;
  readonly paneId: string;
}): Stream.Stream<WallWatchEvent, WallError, ProcessRunner.ProcessRunner> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const runner = yield* ProcessRunner.ProcessRunner;
      const subscribe = mapStreamProcessError(
        runner.streamLines(
          zellijArgs([
            "--session",
            input.session,
            "subscribe",
            "--pane-id",
            input.paneId,
            "--format",
            "json",
          ]),
        ),
      ).pipe(
        Stream.map((line) => parseSubscribeLine(input.session, line)),
        Stream.filter((event): event is WallWatchEvent => event !== null),
      );

      let dumpInitial = true;
      const pollDumpScreen = Stream.tick(DUMP_SCREEN_POLL).pipe(
        Stream.mapEffect(() =>
          runZellij(
            ["--session", input.session, "action", "dump-screen", "--pane-id", input.paneId],
            "dump-screen",
          ).pipe(
            Effect.map((stdout) => {
              const event = dumpScreenToFrame(input.session, input.paneId, stdout, dumpInitial);
              dumpInitial = false;
              return event;
            }),
          ),
        ),
      );

      return coalesceWatchEvents(
        subscribe.pipe(
          Stream.catchCause((cause) => {
            const error = Option.getOrUndefined(Cause.findErrorOption(cause));
            if (error?._tag === "MuxNotFoundError") {
              return Stream.fail(error);
            }
            return pollDumpScreen;
          }),
        ),
      );
    }),
  );
