import { describe, expect, it } from "vite-plus/test";

import {
  applyWallWatchEvent,
  emptyWallWatchView,
  isAgentCmdHint,
  wallPaneLabel,
  wallPaneSubtitle,
  wallSessionLabel,
} from "./wall.ts";

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

describe("wall labels", () => {
  it("prefers pane title over id", () => {
    expect(wallPaneLabel({ id: "terminal_1", title: "claude-work" })).toBe("claude-work");
    expect(wallPaneLabel({ id: "terminal_1", title: "  " })).toBe("terminal_1");
  });

  it("prefers session title over mux name", () => {
    expect(wallSessionLabel({ name: "iterm:185", title: "Sotto Electron" })).toBe("Sotto Electron");
    expect(wallSessionLabel({ name: "work" })).toBe("work");
  });

  it("keeps cmdHint and session in the subtitle without repeating the pane title", () => {
    expect(
      wallPaneSubtitle(
        { id: "25EB0C9F-265D-42D5-AF9C-F81D8594552F", title: "grok (grok)", cmdHint: "grok" },
        { name: "iterm:185", title: "Sotto Electron" },
      ),
    ).toBe("grok · Sotto Electron");
    expect(wallPaneSubtitle({ id: "terminal_1", title: "", cmdHint: "zsh" })).toBe("zsh");
  });
});
