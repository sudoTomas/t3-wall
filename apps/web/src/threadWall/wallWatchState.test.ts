import { describe, expect, it } from "vite-plus/test";

import { applyWallWatchEvent, emptyWallWatchView, isAgentCmdHint } from "./wallWatchState";

describe("applyWallWatchEvent", () => {
  it("replaces the viewport on a frame and reopens a closed pane", () => {
    const closed = applyWallWatchEvent(emptyWallWatchView("work", "terminal_1"), {
      type: "closed",
      session: "work",
      paneId: "terminal_1",
    });
    expect(closed.closed).toBe(true);

    const frame = applyWallWatchEvent(closed, {
      type: "frame",
      session: "work",
      paneId: "terminal_1",
      viewport: ["hello", "world"],
      initial: false,
    });
    expect(frame).toEqual({
      session: "work",
      paneId: "terminal_1",
      viewport: ["hello", "world"],
      closed: false,
    });
  });

  it("keeps the last viewport when the pane closes", () => {
    const framed = applyWallWatchEvent(emptyWallWatchView("work", "terminal_1"), {
      type: "frame",
      session: "work",
      paneId: "terminal_1",
      viewport: ["prompt"],
      initial: true,
    });
    const closed = applyWallWatchEvent(framed, {
      type: "closed",
      session: "work",
      paneId: "terminal_1",
    });
    expect(closed.viewport).toEqual(["prompt"]);
    expect(closed.closed).toBe(true);
  });
});

describe("isAgentCmdHint", () => {
  it("treats unknown and shell hints as needing confirmShell", () => {
    expect(isAgentCmdHint("claude")).toBe(true);
    expect(isAgentCmdHint("grok")).toBe(true);
    expect(isAgentCmdHint("zsh")).toBe(false);
    expect(isAgentCmdHint("unknown")).toBe(false);
    expect(isAgentCmdHint(undefined)).toBe(false);
  });
});
