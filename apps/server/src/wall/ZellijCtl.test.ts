import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import { vi } from "vite-plus/test";

import * as ProcessRunner from "../processRunner.ts";
import {
  MuxCommandFailedError,
  MuxInjectRefusedError,
  MuxNotFoundError,
  MuxPaneNotFoundError,
  MuxSessionNotFoundError,
  inject,
  listInventory,
  parseSubscribeLine,
  shouldEmitWatchEvent,
  watch,
} from "./ZellijCtl.ts";

const isMuxNotFoundError = Schema.is(MuxNotFoundError);
const isMuxSessionNotFoundError = Schema.is(MuxSessionNotFoundError);
const isMuxPaneNotFoundError = Schema.is(MuxPaneNotFoundError);
const isMuxInjectRefusedError = Schema.is(MuxInjectRefusedError);
const isMuxCommandFailedError = Schema.is(MuxCommandFailedError);

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

const LIST_SESSIONS_OUTPUT = `liz-jobs [Created 1month 11days 13h 37m 42s ago] (EXITED - attach to resurrect)
work [Created 2h 4s ago]
`;

const CAT_PANES_JSON = JSON.stringify([
  {
    id: 0,
    is_plugin: true,
    title: "(.) - zellij:link",
    terminal_command: null,
    plugin_url: "zellij:link",
    exited: false,
    tab_name: "Tab #1",
  },
  {
    id: 1,
    is_plugin: false,
    title: "cat-probe",
    terminal_command: "cat",
    plugin_url: null,
    exited: false,
    tab_name: "Tab #1",
    pane_cwd: "/tmp",
  },
  {
    id: 2,
    is_plugin: false,
    title: "claude-work",
    terminal_command: "CLAUDE_CONFIG_DIR=/Users/tomas/.claude-work claude",
    plugin_url: null,
    exited: false,
    tab_name: "Tab #1",
  },
]);

afterEach(() => {
  runMock.mockReset();
  streamLinesMock.mockReset();
});

const runWall = <A, E>(effect: Effect.Effect<A, E, ProcessRunner.ProcessRunner>) =>
  effect.pipe(Effect.provide(ProcessRunnerTest));

describe("listInventory", () => {
  it.effect("returns mux_not_found when zellij is missing", () =>
    Effect.gen(function* () {
      runMock.mockReturnValueOnce(
        Effect.fail(
          new ProcessRunner.ProcessSpawnError({
            command: "zellij",
            argumentCount: 2,
            cause: new Error("ENOENT"),
          }),
        ),
      );

      const error = yield* listInventory().pipe(runWall, Effect.flip);
      expect(isMuxNotFoundError(error)).toBe(true);
      if (isMuxNotFoundError(error)) {
        expect(error.message).toContain("zellij");
        expect(error.message).toContain("0.44");
      }
    }),
  );

  it.effect("lists live sessions and skips EXITED ones when listing panes", () =>
    Effect.gen(function* () {
      runMock.mockImplementation((input) => {
        if (input.args[0] === "list-sessions") {
          return processOutput(LIST_SESSIONS_OUTPUT);
        }
        if (input.args.includes("--session") && input.args.includes("work")) {
          return processOutput(CAT_PANES_JSON);
        }
        return processOutput("", 1, "There is no active session!");
      });

      const inventory = yield* listInventory().pipe(runWall);
      expect(inventory.sessions.map((session) => session.name)).toEqual(["liz-jobs", "work"]);
      expect(inventory.sessions[0]?.exited).toBe(true);
      expect(inventory.sessions[0]?.panes).toEqual([]);
      expect(inventory.sessions[1]?.exited).toBe(false);
      expect(inventory.sessions[1]?.panes.map((pane) => pane.id)).toEqual([
        "terminal_1",
        "terminal_2",
      ]);
      expect(inventory.sessions[1]?.panes[0]).toEqual({
        id: "terminal_1",
        title: "cat-probe",
        cmdHint: "unknown",
        cwd: "/tmp",
        exited: false,
        tabName: "Tab #1",
      });
      expect(inventory.sessions[1]?.panes[1]?.cmdHint).toBe("claude");
      expect(inventory.sessions[1]?.panes[1]?.accountHint).toBe("/Users/tomas/.claude-work");
    }),
  );

  it.effect("lists a single requested session", () =>
    Effect.gen(function* () {
      runMock.mockImplementation((input) => {
        if (input.args[0] === "list-sessions") {
          return processOutput(LIST_SESSIONS_OUTPUT);
        }
        return processOutput(CAT_PANES_JSON);
      });

      const inventory = yield* listInventory({ session: "work" }).pipe(runWall);
      expect(inventory.sessions.map((session) => session.name)).toEqual(["work"]);
    }),
  );

  it.effect("fails when the requested session is missing", () =>
    Effect.gen(function* () {
      runMock.mockReturnValueOnce(processOutput(LIST_SESSIONS_OUTPUT));
      const error = yield* listInventory({ session: "missing" }).pipe(runWall, Effect.flip);
      expect(isMuxSessionNotFoundError(error)).toBe(true);
    }),
  );
});

describe("inject", () => {
  it.effect("pastes then sends Enter into an agent pane", () =>
    Effect.gen(function* () {
      const calls: Array<ReadonlyArray<string>> = [];
      runMock.mockImplementation((input) => {
        calls.push(input.args);
        if (input.args.includes("list-panes")) {
          return processOutput(CAT_PANES_JSON);
        }
        return processOutput("");
      });

      const result = yield* inject({
        session: "work",
        paneId: "terminal_2",
        text: "ship the tests",
        submit: true,
      }).pipe(runWall);

      expect(result.accepted).toBe(true);
      expect(calls).toEqual([
        ["--session", "work", "action", "list-panes", "--json", "--command", "--state", "--tab"],
        ["--session", "work", "action", "paste", "--pane-id", "terminal_2", "ship the tests"],
        ["--session", "work", "action", "send-keys", "--pane-id", "terminal_2", "Enter"],
      ]);
    }),
  );

  it.effect("refuses a non-agent pane unless confirmShell is set", () =>
    Effect.gen(function* () {
      runMock.mockImplementation((input) => {
        if (input.args.includes("list-panes")) {
          return processOutput(CAT_PANES_JSON);
        }
        return processOutput("");
      });

      const error = yield* inject({
        session: "work",
        paneId: "terminal_1",
        text: "hello-from-outside",
        submit: true,
      }).pipe(runWall, Effect.flip);
      expect(isMuxInjectRefusedError(error)).toBe(true);

      const accepted = yield* inject({
        session: "work",
        paneId: "terminal_1",
        text: "hello-from-outside",
        submit: true,
        confirmShell: true,
      }).pipe(runWall);
      expect(accepted.accepted).toBe(true);
    }),
  );

  it.effect("fails when the pane id is missing", () =>
    Effect.gen(function* () {
      runMock.mockReturnValueOnce(processOutput(CAT_PANES_JSON));
      const error = yield* inject({
        session: "work",
        paneId: "terminal_9",
        text: "nope",
        submit: true,
        confirmShell: true,
      }).pipe(runWall, Effect.flip);
      expect(isMuxPaneNotFoundError(error)).toBe(true);
    }),
  );

  it.effect("maps a dead session to session-not-found", () =>
    Effect.gen(function* () {
      runMock.mockReturnValueOnce(processOutput("", 1, "There is no active session!"));
      const error = yield* inject({
        session: "eastwood",
        paneId: "terminal_1",
        text: "hi",
        submit: true,
        confirmShell: true,
      }).pipe(runWall, Effect.flip);
      expect(isMuxSessionNotFoundError(error)).toBe(true);
    }),
  );

  it.effect("maps a failed paste to command-failed without echoing the payload", () =>
    Effect.gen(function* () {
      runMock.mockImplementation((input) => {
        if (input.args.includes("list-panes")) {
          return processOutput(CAT_PANES_JSON);
        }
        return processOutput("", 1, "paste exploded");
      });

      const error = yield* inject({
        session: "work",
        paneId: "terminal_2",
        text: "secret-token-should-not-appear",
        submit: true,
      }).pipe(runWall, Effect.flip);
      expect(isMuxCommandFailedError(error)).toBe(true);
      if (isMuxCommandFailedError(error)) {
        expect(error.message).not.toContain("secret-token-should-not-appear");
      }
    }),
  );
});

describe("parseSubscribeLine", () => {
  it("parses a pane_update into a frame", () => {
    const event = parseSubscribeLine(
      "work",
      JSON.stringify({
        event: "pane_update",
        pane_id: "terminal_1",
        is_initial: true,
        viewport: ["hello-from-outside", ""],
      }),
    );
    expect(event).toEqual({
      type: "frame",
      session: "work",
      paneId: "terminal_1",
      initial: true,
      viewport: ["hello-from-outside", ""],
      activity: "idle",
    });
  });

  it("parses pane_closed", () => {
    expect(parseSubscribeLine("work", '{"event":"pane_closed","pane_id":"terminal_1"}')).toEqual({
      type: "closed",
      session: "work",
      paneId: "terminal_1",
    });
  });

  it("ignores junk", () => {
    expect(parseSubscribeLine("work", "not-json")).toBeNull();
  });
});

describe("shouldEmitWatchEvent", () => {
  const frame = {
    type: "frame" as const,
    session: "work",
    paneId: "terminal_1",
    initial: false,
    viewport: ["a"],
    activity: "idle" as const,
  };

  it("always emits initial frames and closed events", () => {
    expect(
      shouldEmitWatchEvent(frame, { ...frame, initial: true, viewport: ["a"] }, Duration.zero),
    ).toBe(true);
    expect(
      shouldEmitWatchEvent(
        frame,
        { type: "closed", session: "work", paneId: "terminal_1" },
        Duration.zero,
      ),
    ).toBe(true);
  });

  it("drops identical viewports", () => {
    expect(shouldEmitWatchEvent(frame, { ...frame }, Duration.millis(200))).toBe(false);
  });

  it("drops rapid unique frames under the interval", () => {
    expect(shouldEmitWatchEvent(frame, { ...frame, viewport: ["b"] }, Duration.millis(10))).toBe(
      false,
    );
    expect(shouldEmitWatchEvent(frame, { ...frame, viewport: ["b"] }, Duration.millis(80))).toBe(
      true,
    );
  });
});

describe("watch", () => {
  it.effect("emits subscribe frames then closed", () =>
    Effect.gen(function* () {
      streamLinesMock.mockReturnValue(
        Stream.make(
          JSON.stringify({
            event: "pane_update",
            pane_id: "terminal_1",
            is_initial: true,
            viewport: ["hello"],
          }),
          JSON.stringify({
            event: "pane_update",
            pane_id: "terminal_1",
            viewport: ["hello"],
          }),
          JSON.stringify({ event: "pane_closed", pane_id: "terminal_1" }),
        ),
      );
      const events = yield* watch({ session: "work", paneId: "terminal_1" }).pipe(
        Stream.runCollect,
        runWall,
      );
      expect([...events]).toEqual([
        {
          type: "frame",
          session: "work",
          paneId: "terminal_1",
          initial: true,
          viewport: ["hello"],
          activity: "idle",
        },
        { type: "closed", session: "work", paneId: "terminal_1" },
      ]);
    }),
  );

  it.effect("falls back to dump-screen when subscribe fails", () =>
    Effect.gen(function* () {
      streamLinesMock.mockReturnValue(
        Stream.fail(
          new ProcessRunner.ProcessReadError({
            command: "zellij",
            argumentCount: 6,
            stream: "stdout",
            cause: new Error("subscribe died"),
          }),
        ),
      );
      runMock.mockImplementation((input) => {
        if (input.args.includes("dump-screen")) {
          return processOutput("from-dump\n");
        }
        return processOutput("");
      });
      const events = yield* watch({ session: "work", paneId: "terminal_1" }).pipe(
        Stream.take(1),
        Stream.runCollect,
        runWall,
      );
      expect([...events]).toEqual([
        {
          type: "frame",
          session: "work",
          paneId: "terminal_1",
          initial: true,
          viewport: ["from-dump", ""],
          activity: "idle",
        },
      ]);
    }),
  );
});
