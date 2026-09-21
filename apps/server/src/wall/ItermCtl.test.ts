import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import { vi } from "vite-plus/test";

import * as ProcessRunner from "../processRunner.ts";
import {
  ItermNotFoundError,
  MuxCommandFailedError,
  MuxInjectRefusedError,
  MuxPaneNotFoundError,
  MuxSessionNotFoundError,
} from "@t3tools/contracts";
import { inject, isItermSession, listInventory, watch } from "./ItermCtl.ts";

const isItermNotFoundError = Schema.is(ItermNotFoundError);
const isMuxSessionNotFoundError = Schema.is(MuxSessionNotFoundError);
const isMuxPaneNotFoundError = Schema.is(MuxPaneNotFoundError);
const isMuxInjectRefusedError = Schema.is(MuxInjectRefusedError);
const isMuxCommandFailedError = Schema.is(MuxCommandFailedError);

const CAT_PANE_ID = "4EE6FC26-E9B7-4853-8731-8C7C9F0BEFC0";
const CLAUDE_PANE_ID = "25EB0C9F-265D-42D5-AF9C-F81D8594552F";

const INVENTORY_JSON = JSON.stringify({
  windows: [
    {
      id: "185",
      name: "work",
      panes: [
        {
          id: CAT_PANE_ID,
          title: "cat-probe",
          tty: "/dev/ttys016",
          tabIndex: 0,
        },
        {
          id: CLAUDE_PANE_ID,
          title: "claude-work",
          tty: "/dev/ttys011",
          tabIndex: 0,
        },
      ],
    },
  ],
});

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

afterEach(() => {
  runMock.mockReset();
  streamLinesMock.mockReset();
});

const runWall = <A, E>(effect: Effect.Effect<A, E, ProcessRunner.ProcessRunner>) =>
  effect.pipe(Effect.provide(ProcessRunnerTest));

describe("isItermSession", () => {
  it("recognizes iterm window session ids", () => {
    expect(isItermSession("iterm:185")).toBe(true);
    expect(isItermSession("work")).toBe(false);
  });
});

describe("listInventory", () => {
  it.effect("returns iterm_not_found when iTerm is not running", () =>
    Effect.gen(function* () {
      runMock.mockReturnValueOnce(processOutput(JSON.stringify({ error: "not_running" })));
      const error = yield* listInventory().pipe(runWall, Effect.flip);
      expect(isItermNotFoundError(error)).toBe(true);
      if (isItermNotFoundError(error)) {
        expect(error.message).toContain("iTerm2");
      }
    }),
  );

  it.effect("returns iterm_not_found when osascript is missing", () =>
    Effect.gen(function* () {
      runMock.mockReturnValueOnce(
        Effect.fail(
          new ProcessRunner.ProcessSpawnError({
            command: "osascript",
            argumentCount: 3,
            cause: new Error("ENOENT"),
          }),
        ),
      );
      const error = yield* listInventory().pipe(runWall, Effect.flip);
      expect(isItermNotFoundError(error)).toBe(true);
    }),
  );

  it.effect("lists iTerm windows as iterm:<windowId> sessions", () =>
    Effect.gen(function* () {
      runMock.mockReturnValueOnce(processOutput(INVENTORY_JSON));
      const inventory = yield* listInventory().pipe(runWall);
      expect(inventory.sessions.map((session) => session.name)).toEqual(["iterm:185"]);
      expect(inventory.sessions[0]?.panes.map((pane) => pane.id)).toEqual([
        CAT_PANE_ID,
        CLAUDE_PANE_ID,
      ]);
      expect(inventory.sessions[0]?.panes[0]).toMatchObject({
        id: CAT_PANE_ID,
        title: "cat-probe",
        cmdHint: "unknown",
        tabName: "Tab #1",
        exited: false,
      });
      expect(inventory.sessions[0]?.panes[1]?.cmdHint).toBe("claude");
      expect(inventory.sessions[0]?.panes[1]?.accountHint).toBe("claude-work");
    }),
  );

  it.effect("lists a single requested iTerm window", () =>
    Effect.gen(function* () {
      runMock.mockReturnValueOnce(processOutput(INVENTORY_JSON));
      const inventory = yield* listInventory({ session: "iterm:185" }).pipe(runWall);
      expect(inventory.sessions.map((session) => session.name)).toEqual(["iterm:185"]);
    }),
  );

  it.effect("fails when the requested iTerm window is missing", () =>
    Effect.gen(function* () {
      runMock.mockReturnValueOnce(processOutput(INVENTORY_JSON));
      const error = yield* listInventory({ session: "iterm:999" }).pipe(runWall, Effect.flip);
      expect(isMuxSessionNotFoundError(error)).toBe(true);
    }),
  );
});

describe("inject", () => {
  it.effect("writes text then newline into an agent session", () =>
    Effect.gen(function* () {
      const calls: Array<ProcessRunner.ProcessRunInput> = [];
      runMock.mockImplementation((input) => {
        calls.push(input);
        if (input.args.includes("JavaScript")) {
          return processOutput(INVENTORY_JSON);
        }
        return processOutput("ok");
      });

      const result = yield* inject({
        session: "iterm:185",
        paneId: CLAUDE_PANE_ID,
        text: "ship the tests",
        submit: true,
      }).pipe(runWall);

      expect(result.accepted).toBe(true);
      const writeCall = calls.find((call) => call.args[0] === "-");
      expect(writeCall?.args).toEqual(["-", CLAUDE_PANE_ID, "185", "ship the tests", "1"]);
      expect(writeCall?.stdin).toContain("write text");
      expect(writeCall?.stdin).not.toContain("keystroke");
    }),
  );

  it.effect("refuses a non-agent pane unless confirmShell is set", () =>
    Effect.gen(function* () {
      runMock.mockImplementation((input) => {
        if (input.args.includes("JavaScript")) {
          return processOutput(INVENTORY_JSON);
        }
        return processOutput("ok");
      });

      const error = yield* inject({
        session: "iterm:185",
        paneId: CAT_PANE_ID,
        text: "hello-from-outside",
        submit: true,
      }).pipe(runWall, Effect.flip);
      expect(isMuxInjectRefusedError(error)).toBe(true);

      const accepted = yield* inject({
        session: "iterm:185",
        paneId: CAT_PANE_ID,
        text: "hello-from-outside",
        submit: true,
        confirmShell: true,
      }).pipe(runWall);
      expect(accepted.accepted).toBe(true);
    }),
  );

  it.effect("fails when the pane id is missing", () =>
    Effect.gen(function* () {
      runMock.mockReturnValueOnce(processOutput(INVENTORY_JSON));
      const error = yield* inject({
        session: "iterm:185",
        paneId: "00000000-0000-0000-0000-000000000000",
        text: "nope",
        submit: true,
        confirmShell: true,
      }).pipe(runWall, Effect.flip);
      expect(isMuxPaneNotFoundError(error)).toBe(true);
    }),
  );

  it.effect("maps a failed write to command-failed without echoing the payload", () =>
    Effect.gen(function* () {
      runMock.mockImplementation((input) => {
        if (input.args.includes("JavaScript")) {
          return processOutput(INVENTORY_JSON);
        }
        return processOutput("", 1, "write exploded");
      });

      const error = yield* inject({
        session: "iterm:185",
        paneId: CLAUDE_PANE_ID,
        text: "secret-token-should-not-appear",
        submit: true,
      }).pipe(runWall, Effect.flip);
      expect(isMuxCommandFailedError(error)).toBe(true);
      if (isMuxCommandFailedError(error)) {
        expect(error.message).not.toContain("secret-token-should-not-appear");
        expect(error.message).toContain("iTerm");
      }
    }),
  );
});

describe("watch", () => {
  it.effect("emits an initial contents frame", () =>
    Effect.gen(function* () {
      runMock.mockReturnValue(processOutput(JSON.stringify({ viewport: ["hello"] })));
      const events = yield* watch({ session: "iterm:185", paneId: CLAUDE_PANE_ID }).pipe(
        Stream.take(1),
        Stream.runCollect,
        runWall,
      );
      expect([...events]).toEqual([
        {
          type: "frame",
          session: "iterm:185",
          paneId: CLAUDE_PANE_ID,
          initial: true,
          viewport: ["hello"],
        },
      ]);
    }),
  );

  it.effect("emits closed when the iTerm session is already gone", () =>
    Effect.gen(function* () {
      runMock.mockReturnValue(processOutput(JSON.stringify({ error: "pane_not_found" })));
      const events = yield* watch({ session: "iterm:185", paneId: CLAUDE_PANE_ID }).pipe(
        Stream.take(1),
        Stream.runCollect,
        runWall,
      );
      expect([...events]).toEqual([
        { type: "closed", session: "iterm:185", paneId: CLAUDE_PANE_ID },
      ]);
    }),
  );
});
