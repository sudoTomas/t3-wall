import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import { vi } from "vite-plus/test";

import * as ProcessRunner from "../processRunner.ts";
import { ItermNotFoundError, MuxNotFoundError, MuxSessionNotFoundError } from "@t3tools/contracts";
import { listInventory } from "./mux.ts";

const isMuxNotFoundError = Schema.is(MuxNotFoundError);
const isItermNotFoundError = Schema.is(ItermNotFoundError);
const isMuxSessionNotFoundError = Schema.is(MuxSessionNotFoundError);

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

const zellijMissing = () =>
  Effect.fail(
    new ProcessRunner.ProcessSpawnError({
      command: "zellij",
      argumentCount: 2,
      cause: new Error("ENOENT"),
    }),
  );

const osascriptMissing = () =>
  Effect.fail(
    new ProcessRunner.ProcessSpawnError({
      command: "osascript",
      argumentCount: 3,
      cause: new Error("ENOENT"),
    }),
  );

afterEach(() => {
  runMock.mockReset();
  streamLinesMock.mockReset();
});

const runWall = <A, E>(effect: Effect.Effect<A, E, ProcessRunner.ProcessRunner>) =>
  effect.pipe(Effect.provide(ProcessRunnerTest));

describe("mux listInventory", () => {
  it.effect("returns mux_not_found when both backends are missing", () =>
    Effect.gen(function* () {
      runMock.mockImplementation((input) =>
        input.command === "osascript" ? osascriptMissing() : zellijMissing(),
      );
      const error = yield* listInventory().pipe(runWall, Effect.flip);
      expect(isMuxNotFoundError(error)).toBe(true);
    }),
  );

  it.effect("lists iTerm windows when zellij is missing", () =>
    Effect.gen(function* () {
      runMock.mockImplementation((input) => {
        if (input.command === "zellij") return zellijMissing();
        return processOutput(
          JSON.stringify({
            windows: [
              {
                id: "185",
                name: "work",
                panes: [
                  {
                    id: "25EB0C9F-265D-42D5-AF9C-F81D8594552F",
                    title: "claude",
                    tabIndex: 0,
                  },
                ],
              },
            ],
          }),
        );
      });
      const inventory = yield* listInventory().pipe(runWall);
      expect(inventory.sessions.map((session) => session.name)).toEqual(["iterm:185"]);
      expect(inventory.sessions[0]?.panes[0]?.cmdHint).toBe("claude");
    }),
  );

  it.effect("keeps Zellij sessions when iTerm is missing", () =>
    Effect.gen(function* () {
      runMock.mockImplementation((input) => {
        if (input.command === "osascript") return osascriptMissing();
        if (input.args[0] === "list-sessions") {
          return processOutput("work [Created 2h 4s ago]\n");
        }
        return processOutput(
          JSON.stringify([
            {
              id: 2,
              is_plugin: false,
              title: "claude-work",
              terminal_command: "claude",
              plugin_url: null,
              exited: false,
              tab_name: "Tab #1",
            },
          ]),
        );
      });
      const inventory = yield* listInventory().pipe(runWall);
      expect(inventory.sessions.map((session) => session.name)).toEqual(["work"]);
    }),
  );

  it.effect("does not call zellij when asking for an iterm session", () =>
    Effect.gen(function* () {
      runMock.mockImplementation((input) => {
        if (input.command === "zellij") {
          return Effect.die("zellij should not run for iterm sessions");
        }
        return processOutput(JSON.stringify({ error: "not_running" }));
      });
      const error = yield* listInventory({ session: "iterm:185" }).pipe(runWall, Effect.flip);
      expect(isItermNotFoundError(error)).toBe(true);
    }),
  );

  it.effect("does not call osascript when asking for a Zellij session", () =>
    Effect.gen(function* () {
      runMock.mockImplementation((input) => {
        if (input.command === "osascript") {
          return Effect.die("osascript should not run for zellij sessions");
        }
        if (input.args[0] === "list-sessions") {
          return processOutput("liz-jobs [Created 1month ago] (EXITED - attach to resurrect)\n");
        }
        return processOutput("[]");
      });
      const error = yield* listInventory({ session: "missing" }).pipe(runWall, Effect.flip);
      expect(isMuxSessionNotFoundError(error)).toBe(true);
    }),
  );
});
