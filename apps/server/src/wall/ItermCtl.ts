/**
 * ItermCtl talks to a running iTerm2 via osascript.
 *
 * Inventory and watch use JXA. Inject uses AppleScript `write text`, which
 * types into the session iTerm owns — not `/dev/ttys`, HID, or Screen Recording.
 * Session ids are `iterm:<windowId>`; pane ids are iTerm session UUIDs.
 */
import {
  ItermNotFoundError,
  MuxCommandFailedError,
  MuxInjectRefusedError,
  MuxPaneNotFoundError,
  MuxSessionNotFoundError,
  type MuxInventory,
  type MuxPane,
  type MuxSession,
  type WallError,
  type WallWatchEvent,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import * as ProcessRunner from "../processRunner.ts";
import { accountHintFrom, cmdHintFrom, isAgentHint } from "./cmdHint.ts";
import { DUMP_SCREEN_POLL, coalesceWatchEvents, dumpScreenToFrame } from "./watchFrames.ts";

interface MuxInjectInput {
  readonly session: string;
  readonly paneId: string;
  readonly text: string;
  readonly submit: boolean;
  readonly confirmShell?: boolean;
}

export const ITERM_SESSION_PREFIX = "iterm:";

const OSASCRIPT_TIMEOUT = "8 seconds";

const ItermPaneJson = Schema.Struct({
  id: Schema.String,
  title: Schema.optional(Schema.String),
  tty: Schema.optional(Schema.String),
  tabIndex: Schema.optional(Schema.Number),
});
const ItermWindowJson = Schema.Struct({
  id: Schema.String,
  name: Schema.optional(Schema.String),
  panes: Schema.Array(ItermPaneJson),
});
const ItermInventoryJson = Schema.Struct({
  error: Schema.optional(Schema.String),
  windows: Schema.optional(Schema.Array(ItermWindowJson)),
});
const decodeInventoryJson = Schema.decodeUnknownEffect(Schema.fromJsonString(ItermInventoryJson));

const ItermViewportJson = Schema.Struct({
  error: Schema.optional(Schema.String),
  viewport: Schema.optional(Schema.Array(Schema.String)),
});
const decodeViewportJson = Schema.decodeUnknownEffect(Schema.fromJsonString(ItermViewportJson));

export function isItermSession(session: string): boolean {
  return session.startsWith(ITERM_SESSION_PREFIX);
}

export function itermSessionName(windowId: string): string {
  return `${ITERM_SESSION_PREFIX}${windowId}`;
}

export function parseItermWindowId(session: string): string | undefined {
  if (!isItermSession(session)) return undefined;
  const windowId = session.slice(ITERM_SESSION_PREFIX.length);
  return windowId.length > 0 ? windowId : undefined;
}

const INVENTORY_SCRIPT = `function run() {
  try {
    const app = Application("iTerm");
    if (!app.running()) {
      return JSON.stringify({ error: "not_running" });
    }
    const windows = [];
    const appWindows = app.windows();
    for (let wi = 0; wi < appWindows.length; wi++) {
      const w = appWindows[wi];
      let id = "";
      let name = "";
      try { id = String(w.id()); } catch (e) { continue; }
      try { name = String(w.name()); } catch (e) {}
      const panes = [];
      const tabs = w.tabs();
      for (let ti = 0; ti < tabs.length; ti++) {
        const sessions = tabs[ti].sessions();
        for (let si = 0; si < sessions.length; si++) {
          const s = sessions[si];
          let paneId = "";
          let title = "";
          let tty = "";
          try { paneId = String(s.id()); } catch (e) { continue; }
          try { title = String(s.name()); } catch (e) {}
          try { tty = String(s.tty()); } catch (e) {}
          if (paneId.length === 0 || paneId.length > 64) continue;
          panes.push({ id: paneId, title: title, tty: tty, tabIndex: ti });
        }
      }
      windows.push({ id: id, name: name, panes: panes });
    }
    return JSON.stringify({ windows: windows });
  } catch (e) {
    return JSON.stringify({ error: "not_running", detail: String(e) });
  }
}
`;

const VIEWPORT_SCRIPT = `function run(argv) {
  const windowId = argv[0];
  const sessionId = argv[1];
  try {
    const app = Application("iTerm");
    if (!app.running()) {
      return JSON.stringify({ error: "not_running" });
    }
    const appWindows = app.windows();
    for (let wi = 0; wi < appWindows.length; wi++) {
      const w = appWindows[wi];
      let id = "";
      try { id = String(w.id()); } catch (e) { continue; }
      if (id !== windowId) continue;
      const tabs = w.tabs();
      for (let ti = 0; ti < tabs.length; ti++) {
        const sessions = tabs[ti].sessions();
        for (let si = 0; si < sessions.length; si++) {
          const s = sessions[si];
          let paneId = "";
          try { paneId = String(s.id()); } catch (e) { continue; }
          if (paneId !== sessionId) continue;
          let rows = 24;
          try { rows = Number(s.rows()) || 24; } catch (e) {}
          const take = Math.min(Math.max(rows, 1), 200);
          let text = "";
          try { text = String(s.contents()); } catch (e) {}
          const lines = text.split("\\n");
          return JSON.stringify({ viewport: lines.slice(Math.max(0, lines.length - take)) });
        }
      }
      return JSON.stringify({ error: "pane_not_found" });
    }
    return JSON.stringify({ error: "session_not_found" });
  } catch (e) {
    return JSON.stringify({ error: "not_running", detail: String(e) });
  }
}
`;

const INJECT_SCRIPT = `on run argv
  set theSessionId to item 1 of argv
  set theWindowId to item 2 of argv
  set theText to item 3 of argv
  set doSubmit to item 4 of argv
  if application "iTerm" is not running then return "not_running"
  tell application "iTerm"
    repeat with w in windows
      if (id of w as string) is theWindowId then
        repeat with t in tabs of w
          repeat with s in sessions of t
            if (id of s as string) is theSessionId then
              tell s
                if doSubmit is "1" then
                  write text theText
                else
                  write text theText newline no
                end if
              end tell
              return "ok"
            end if
          end repeat
        end repeat
        return "pane_not_found"
      end if
    end repeat
  end tell
  return "session_not_found"
end run
`;

function commandFailed(operation: string, detail?: string) {
  return new MuxCommandFailedError({
    operation,
    mux: "iTerm",
    ...(detail === undefined || detail.length === 0 ? {} : { detail }),
  });
}

const looksLikeItermMissing = (text: string) =>
  /not_running|not running|not authorized|-1743|-1728|application isn't running/i.test(text);

function toMuxPane(pane: typeof ItermPaneJson.Type): MuxPane {
  const title = pane.title ?? "";
  const accountHint = accountHintFrom(undefined, title);
  const tabIndex = pane.tabIndex;
  return {
    id: pane.id,
    title,
    cmdHint: cmdHintFrom(undefined, title),
    ...(accountHint === undefined ? {} : { accountHint }),
    exited: false,
    ...(tabIndex === undefined ? {} : { tabName: `Tab #${tabIndex + 1}` }),
  };
}

function toMuxSession(window: typeof ItermWindowJson.Type): MuxSession {
  return {
    name: itermSessionName(window.id),
    exited: false,
    panes: window.panes.map(toMuxPane),
  };
}

const runOsascript = Effect.fn("wall.runOsascript")(function* (
  args: ReadonlyArray<string>,
  operation: string,
  stdin: string,
) {
  const runner = yield* ProcessRunner.ProcessRunner;
  const result = yield* runner
    .run({
      command: "osascript",
      args,
      stdin,
      timeout: OSASCRIPT_TIMEOUT,
    })
    .pipe(
      Effect.catchTag(
        "ProcessSpawnError",
        (cause) => new ItermNotFoundError({ detail: cause.message }),
      ),
      Effect.catchTag("ProcessTimeoutError", () => commandFailed(operation, "timed out")),
      Effect.catchTag("ProcessStdinError", (cause) => commandFailed(operation, cause.message)),
      Effect.catchTag("ProcessOutputLimitError", (cause) =>
        commandFailed(operation, cause.message),
      ),
      Effect.catchTag("ProcessReadError", (cause) => commandFailed(operation, cause.message)),
    );

  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  const code = result.code === null ? 1 : Number(result.code);
  if (looksLikeItermMissing(stdout) || looksLikeItermMissing(stderr)) {
    return yield* new ItermNotFoundError({
      detail: stderr.length > 0 ? stderr : stdout,
    });
  }
  if (code !== 0) {
    return yield* commandFailed(operation, stderr || stdout);
  }
  return result.stdout;
});

function failFromItermToken(
  token: string,
  session: string,
  paneId?: string,
): Effect.Effect<never, WallError> {
  if (token === "not_running") {
    return Effect.fail(new ItermNotFoundError({}));
  }
  if (token === "session_not_found") {
    return Effect.fail(new MuxSessionNotFoundError({ session }));
  }
  if (token === "pane_not_found") {
    return Effect.fail(
      new MuxPaneNotFoundError({
        session,
        paneId: paneId ?? "",
      }),
    );
  }
  return Effect.fail(commandFailed("osascript", token));
}

const listWindows = Effect.fn("wall.iterm.listWindows")(function* () {
  const stdout = yield* runOsascript(["-l", "JavaScript", "-"], "inventory", INVENTORY_SCRIPT);
  const decoded = yield* decodeInventoryJson(stdout).pipe(
    Effect.mapError((cause) => commandFailed("inventory", cause.message)),
  );
  if (decoded.error !== undefined) {
    return yield* failFromItermToken(decoded.error, itermSessionName(""));
  }
  return decoded.windows ?? [];
});

export const listInventory = Effect.fn("wall.iterm.listInventory")(function* (input?: {
  readonly session?: string;
}) {
  const windows = yield* listWindows();
  const sessions = windows.map(toMuxSession);
  const wanted = input?.session;
  if (wanted === undefined) {
    return { sessions } satisfies MuxInventory;
  }
  const windowId = parseItermWindowId(wanted);
  if (windowId === undefined) {
    return yield* new MuxSessionNotFoundError({ session: wanted });
  }
  const selected = sessions.filter((session) => session.name === wanted);
  if (selected.length === 0) {
    return yield* new MuxSessionNotFoundError({ session: wanted });
  }
  return { sessions: selected } satisfies MuxInventory;
});

export const inject = Effect.fn("wall.iterm.inject")(function* (input: MuxInjectInput) {
  const text = input.text;
  if (text.length === 0) {
    return yield* commandFailed("write text", "inject text is empty");
  }
  const windowId = parseItermWindowId(input.session);
  if (windowId === undefined) {
    return yield* new MuxSessionNotFoundError({ session: input.session });
  }

  const inventory = yield* listInventory({ session: input.session });
  const pane = inventory.sessions[0]?.panes.find((candidate) => candidate.id === input.paneId);
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

  const stdout = yield* runOsascript(
    ["-", input.paneId, windowId, text, input.submit ? "1" : "0"],
    "write text",
    INJECT_SCRIPT,
  );
  const token = stdout.trim();
  if (token !== "ok") {
    return yield* failFromItermToken(token, input.session, input.paneId);
  }
  return { accepted: true } as const;
});

const readViewport = Effect.fn("wall.iterm.readViewport")(function* (input: {
  readonly session: string;
  readonly paneId: string;
}) {
  const windowId = parseItermWindowId(input.session);
  if (windowId === undefined) {
    return yield* new MuxSessionNotFoundError({ session: input.session });
  }
  const stdout = yield* runOsascript(
    ["-l", "JavaScript", "-", windowId, input.paneId],
    "contents",
    VIEWPORT_SCRIPT,
  );
  const decoded = yield* decodeViewportJson(stdout).pipe(
    Effect.mapError((cause) => commandFailed("contents", cause.message)),
  );
  if (decoded.error !== undefined) {
    return { error: decoded.error } as const;
  }
  return { viewport: decoded.viewport ?? [] } as const;
});

export const watch = (input: {
  readonly session: string;
  readonly paneId: string;
}): Stream.Stream<WallWatchEvent, WallError, ProcessRunner.ProcessRunner> =>
  Stream.unwrap(
    Effect.sync(() => {
      let dumpInitial = true;
      return coalesceWatchEvents(
        Stream.tick(DUMP_SCREEN_POLL).pipe(
          Stream.mapEffect(() =>
            readViewport(input).pipe(
              Effect.map((result) => {
                if ("error" in result) {
                  return {
                    type: "closed" as const,
                    session: input.session,
                    paneId: input.paneId,
                  };
                }
                const event = dumpScreenToFrame(
                  input.session,
                  input.paneId,
                  result.viewport.join("\n"),
                  dumpInitial,
                );
                dumpInitial = false;
                return event;
              }),
            ),
          ),
          Stream.takeUntil((event) => event.type === "closed"),
        ),
      );
    }),
  );
