/**
 * Live-pane wall: inventory and inject into Zellij panes the T3 server does not own.
 * Success of inject means the multiplexer accepted the action, not that an agent finished a turn.
 */
import * as Schema from "effect/Schema";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";

const MuxSessionName = TrimmedNonEmptyString.check(Schema.isMaxLength(128));
const MuxPaneId = TrimmedNonEmptyString.check(Schema.isMaxLength(64));

export const MuxCmdHint = Schema.Literals([
  "claude",
  "grok",
  "codex",
  "cursor",
  "opencode",
  "antigravity",
  "zsh",
  "unknown",
]);
export type MuxCmdHint = typeof MuxCmdHint.Type;

export const MuxPane = Schema.Struct({
  id: MuxPaneId,
  title: Schema.String,
  cmdHint: MuxCmdHint,
  accountHint: Schema.optional(Schema.String),
  cwd: Schema.optional(Schema.String),
  exited: Schema.Boolean,
  tabName: Schema.optional(Schema.String),
});
export type MuxPane = typeof MuxPane.Type;

export const MuxSession = Schema.Struct({
  name: MuxSessionName,
  createdAt: Schema.optional(Schema.String),
  exited: Schema.Boolean,
  panes: Schema.Array(MuxPane),
});
export type MuxSession = typeof MuxSession.Type;

export const MuxInventory = Schema.Struct({
  sessions: Schema.Array(MuxSession),
});
export type MuxInventory = typeof MuxInventory.Type;

export const WallInventoryInput = Schema.Struct({
  session: Schema.optional(MuxSessionName),
});
export type WallInventoryInput = typeof WallInventoryInput.Type;

export const WallInjectInput = Schema.Struct({
  session: MuxSessionName,
  paneId: MuxPaneId,
  text: Schema.String.check(Schema.isNonEmpty()).check(Schema.isMaxLength(65_536)),
  submit: Schema.optional(Schema.Boolean),
  confirmShell: Schema.optional(Schema.Boolean),
});
export type WallInjectInput = typeof WallInjectInput.Type;

export const WallInjectResult = Schema.Struct({
  accepted: Schema.Literal(true),
});
export type WallInjectResult = typeof WallInjectResult.Type;

export const WallGrantInput = Schema.Struct({
  session: MuxSessionName,
});
export type WallGrantInput = typeof WallGrantInput.Type;

export const WallGrantList = Schema.Struct({
  sessions: Schema.Array(MuxSessionName),
});
export type WallGrantList = typeof WallGrantList.Type;

export class MuxNotFoundError extends Schema.TaggedError<MuxNotFoundError>()("MuxNotFoundError", {
  detail: Schema.optional(Schema.String),
}) {
  override get message(): string {
    return "zellij was not found on PATH. Install Zellij 0.44.0 or newer and put it on the environment server's non-interactive PATH.";
  }
}

export class MuxSessionNotFoundError extends Schema.TaggedError<MuxSessionNotFoundError>()(
  "MuxSessionNotFoundError",
  { session: Schema.String },
) {
  override get message(): string {
    return `Zellij session '${this.session}' is not active.`;
  }
}

export class MuxPaneNotFoundError extends Schema.TaggedError<MuxPaneNotFoundError>()(
  "MuxPaneNotFoundError",
  { session: Schema.String, paneId: Schema.String },
) {
  override get message(): string {
    return `Pane '${this.paneId}' was not found in Zellij session '${this.session}'.`;
  }
}

export class MuxInjectRefusedError extends Schema.TaggedError<MuxInjectRefusedError>()(
  "MuxInjectRefusedError",
  { session: Schema.String, paneId: Schema.String, cmdHint: Schema.String },
) {
  override get message(): string {
    return `Refusing to type into pane '${this.paneId}' (cmd '${this.cmdHint}'). Pass confirmShell to send to a non-agent pane.`;
  }
}

export class MuxInjectUnauthorizedError extends Schema.TaggedError<MuxInjectUnauthorizedError>()(
  "MuxInjectUnauthorizedError",
  { session: Schema.String },
) {
  override get message(): string {
    return `Inject into Zellij session '${this.session}' is not granted. An operator must wall.grant that session first.`;
  }
}

export class MuxCommandFailedError extends Schema.TaggedError<MuxCommandFailedError>()(
  "MuxCommandFailedError",
  { operation: Schema.String, detail: Schema.optional(Schema.String) },
) {
  override get message(): string {
    return this.detail === undefined
      ? `Zellij ${this.operation} failed.`
      : `Zellij ${this.operation} failed: ${this.detail}`;
  }
}

export const WallError = Schema.Union([
  MuxNotFoundError,
  MuxSessionNotFoundError,
  MuxPaneNotFoundError,
  MuxInjectRefusedError,
  MuxInjectUnauthorizedError,
  MuxCommandFailedError,
]);
export type WallError = typeof WallError.Type;
