/**
 * `t3 wall` - list and type into live Zellij or iTerm panes from outside a session.
 *
 * `ls` is inventory; `say` pastes into a pane. Neither starts a provider process.
 * Killing this CLI does not kill the live pane.
 */
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import * as Stream from "effect/Stream";

import * as ProcessRunner from "../processRunner.ts";
import { inject, listInventory, watch } from "../wall/mux.ts";

const WallRuntimeLayer = ProcessRunner.layer;

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print JSON."),
  Flag.withDefault(false),
);

const sessionFlag = Flag.String("session").pipe(
  Flag.withDescription("Limit inventory to one named session (Zellij name or iterm:<windowId>)."),
  Flag.optional,
);

const toShellFlag = Flag.Boolean("to-shell").pipe(
  Flag.withDescription("Allow typing into a pane that does not look like an agent."),
  Flag.withDefault(false),
);

const noSubmitFlag = Flag.Boolean("no-submit").pipe(
  Flag.withDescription("Paste without sending Enter."),
  Flag.withDefault(false),
);

function formatInventoryText(inventory: {
  readonly sessions: ReadonlyArray<{
    readonly name: string;
    readonly exited: boolean;
    readonly panes: ReadonlyArray<{
      readonly id: string;
      readonly title: string;
      readonly cmdHint: string;
      readonly accountHint?: string;
    }>;
  }>;
}): string {
  if (inventory.sessions.length === 0) {
    return "No live sessions.";
  }
  const lines: Array<string> = [];
  for (const session of inventory.sessions) {
    lines.push(`${session.name}${session.exited ? " (exited)" : ""}`);
    if (session.exited) continue;
    if (session.panes.length === 0) {
      lines.push("  (no terminal panes)");
      continue;
    }
    for (const pane of session.panes) {
      const account = pane.accountHint === undefined ? "" : ` ${pane.accountHint}`;
      lines.push(`  ${pane.id}\t${pane.cmdHint}\t${pane.title}${account}`);
    }
  }
  return lines.join("\n");
}

function formatInventoryJson(inventory: { readonly sessions: ReadonlyArray<unknown> }): string {
  return JSON.stringify(inventory, null, 2);
}

const wallLsCommand = Command.make("ls", {
  json: jsonFlag,
  session: sessionFlag,
}).pipe(
  Command.withDescription("List named Zellij and iTerm sessions and their terminal panes."),
  Command.withHandler((flags) =>
    Effect.gen(function* () {
      const inventory = yield* listInventory(
        Option.isSome(flags.session) ? { session: flags.session.value } : undefined,
      );
      yield* Console.log(
        flags.json ? formatInventoryJson(inventory) : formatInventoryText(inventory),
      );
    }).pipe(Effect.provide(WallRuntimeLayer)),
  ),
);

const wallSayCommand = Command.make("say", {
  session: Argument.String("session").pipe(
    Argument.withDescription("Zellij session name or iterm:<windowId>."),
  ),
  paneId: Argument.String("pane").pipe(
    Argument.withDescription("Pane id, e.g. terminal_1 or an iTerm session UUID."),
  ),
  text: Argument.String("text").pipe(
    Argument.withDescription("Text to paste into the pane."),
    Argument.variadic,
  ),
  toShell: toShellFlag,
  noSubmit: noSubmitFlag,
}).pipe(
  Command.withDescription("Paste text into a live pane, then Enter unless --no-submit."),
  Command.withHandler((flags) =>
    Effect.gen(function* () {
      const text = flags.text.join(" ");
      yield* inject({
        session: flags.session,
        paneId: flags.paneId,
        text,
        submit: !flags.noSubmit,
        confirmShell: flags.toShell,
      });
      yield* Console.log(`Injected into ${flags.session} ${flags.paneId}.`);
    }).pipe(Effect.provide(WallRuntimeLayer)),
  ),
);

const wallWatchCommand = Command.make("watch", {
  session: Argument.String("session").pipe(
    Argument.withDescription("Zellij session name or iterm:<windowId>."),
  ),
  paneId: Argument.String("pane").pipe(
    Argument.withDescription("Pane id, e.g. terminal_1 or an iTerm session UUID."),
  ),
}).pipe(
  Command.withDescription("Stream pane viewport frames as JSON lines until interrupted."),
  Command.withHandler((flags) =>
    watch({ session: flags.session, paneId: flags.paneId }).pipe(
      Stream.runForEach((event) => Console.log(JSON.stringify(event))),
      Effect.provide(WallRuntimeLayer),
    ),
  ),
);

export const wallCommand = Command.make("wall").pipe(
  Command.withDescription(
    "Attach to live Zellij or iTerm panes without spawning a T3 provider process.",
  ),
  Command.withSubcommands([wallLsCommand, wallSayCommand, wallWatchCommand]),
);
