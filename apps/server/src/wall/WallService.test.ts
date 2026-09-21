import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import { vi } from "vite-plus/test";

import * as ServerConfig from "../config.ts";
import * as ProcessRunner from "../processRunner.ts";
import { MuxInjectUnauthorizedError, MuxNotFoundError } from "@t3tools/contracts";
import { WallService, layerFromContext } from "./WallService.ts";

const isUnauthorized = Schema.is(MuxInjectUnauthorizedError);
const isMuxNotFound = Schema.is(MuxNotFoundError);

const runMock = vi.fn<ProcessRunner.ProcessRunner["Service"]["run"]>();
const streamLinesMock = vi.fn<ProcessRunner.ProcessRunner["Service"]["streamLines"]>();

const ProcessRunnerTest = Layer.succeed(
  ProcessRunner.ProcessRunner,
  ProcessRunner.ProcessRunner.of({
    run: (input) => runMock(input),
    streamLines: (input) => streamLinesMock(input),
  }),
);

const processOutput = (stdout: string, code = 0, stderr = "") =>
  Effect.succeed({
    stdout,
    stderr,
    code: ChildProcessSpawner.ExitCode(code),
    timedOut: false,
    stdoutTruncated: false,
    stderrTruncated: false,
    stdoutInvalidUtf8: false,
    stderrInvalidUtf8: false,
  });

const LIST_SESSIONS_OUTPUT = `work [Created 2h 4s ago]
`;

const CLAUDE_PANES_JSON = JSON.stringify([
  {
    id: 2,
    is_plugin: false,
    title: "claude-work",
    terminal_command: "claude",
    plugin_url: null,
    exited: false,
    tab_name: "Tab #1",
  },
]);

afterEach(() => {
  runMock.mockReset();
  streamLinesMock.mockReset();
});

const TestLayer = layerFromContext.pipe(
  Layer.provide(ProcessRunnerTest),
  Layer.provide(ServerConfig.layerTest("/tmp", { prefix: "t3-wall-rpc-" })),
  Layer.provideMerge(NodeServices.layer),
);

const runService = <A, E>(effect: Effect.Effect<A, E, WallService>) =>
  effect.pipe(Effect.provide(TestLayer), Effect.scoped);

describe("WallService grants", () => {
  it.effect("denies inject until the mux session is granted", () =>
    Effect.gen(function* () {
      const wall = yield* WallService;
      const denied = yield* wall
        .inject({
          session: "work",
          paneId: "terminal_2",
          text: "what file am I in?",
        })
        .pipe(Effect.flip);
      expect(isUnauthorized(denied)).toBe(true);

      const granted = yield* wall.grant("work");
      expect(granted.sessions).toEqual(["work"]);

      runMock.mockImplementation((input) => {
        if (input.args.includes("list-panes")) return processOutput(CLAUDE_PANES_JSON);
        return processOutput("");
      });

      const result = yield* wall.inject({
        session: "work",
        paneId: "terminal_2",
        text: "what file am I in?",
      });
      expect(result.accepted).toBe(true);

      yield* wall.revoke("work");
      const deniedAgain = yield* wall
        .inject({
          session: "work",
          paneId: "terminal_2",
          text: "what file am I in?",
        })
        .pipe(Effect.flip);
      expect(isUnauthorized(deniedAgain)).toBe(true);
    }).pipe(runService),
  );

  it.effect("inventory maps a missing zellij to mux_not_found", () =>
    Effect.gen(function* () {
      runMock.mockImplementation((input) =>
        Effect.fail(
          new ProcessRunner.ProcessSpawnError({
            command: input.command,
            argumentCount: input.args.length,
            cause: new Error("ENOENT"),
          }),
        ),
      );
      const wall = yield* WallService;
      const error = yield* wall.inventory({}).pipe(Effect.flip);
      expect(isMuxNotFound(error)).toBe(true);
    }).pipe(runService),
  );

  it.effect("inventory lists live sessions after grant is irrelevant", () =>
    Effect.gen(function* () {
      runMock.mockImplementation((input) => {
        if (input.command === "osascript") return processOutput(JSON.stringify({ windows: [] }));
        if (input.args[0] === "list-sessions") return processOutput(LIST_SESSIONS_OUTPUT);
        return processOutput(CLAUDE_PANES_JSON);
      });
      const wall = yield* WallService;
      const inventory = yield* wall.inventory({});
      expect(inventory.sessions.map((session) => session.name)).toEqual(["work"]);
      expect(inventory.sessions[0]?.panes[0]?.cmdHint).toBe("claude");
    }).pipe(runService),
  );

  it.effect("denies iTerm inject until that window is granted", () =>
    Effect.gen(function* () {
      const paneId = "25EB0C9F-265D-42D5-AF9C-F81D8594552F";
      runMock.mockImplementation((input) => {
        if (input.command === "osascript" && input.args.includes("JavaScript")) {
          return processOutput(
            JSON.stringify({
              windows: [
                {
                  id: "185",
                  panes: [{ id: paneId, title: "claude", tabIndex: 0 }],
                },
              ],
            }),
          );
        }
        if (input.command === "osascript") return processOutput("ok");
        return processOutput("");
      });
      const wall = yield* WallService;
      const denied = yield* wall
        .inject({
          session: "iterm:185",
          paneId,
          text: "what file am I in?",
        })
        .pipe(Effect.flip);
      expect(isUnauthorized(denied)).toBe(true);

      yield* wall.grant("iterm:185");
      const result = yield* wall.inject({
        session: "iterm:185",
        paneId,
        text: "what file am I in?",
      });
      expect(result.accepted).toBe(true);
    }).pipe(runService),
  );

  it.effect("watch streams subscribe frames without a grant", () =>
    Effect.gen(function* () {
      streamLinesMock.mockReturnValue(
        Stream.make(
          JSON.stringify({
            event: "pane_update",
            pane_id: "terminal_2",
            is_initial: true,
            viewport: ["❯ "],
          }),
        ),
      );
      const wall = yield* WallService;
      const events = yield* wall
        .watch({ session: "work", paneId: "terminal_2" })
        .pipe(Stream.runCollect);
      expect(events[0]).toMatchObject({ type: "frame", paneId: "terminal_2", initial: true });
    }).pipe(runService),
  );
});
