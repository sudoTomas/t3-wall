import { describe, expect, it } from "vite-plus/test";
import type { MuxInventory, MuxPane, MuxSession } from "@t3tools/contracts";

import {
  visibleWallPanes,
  visibleWallSessions,
  wallCommandErrorMessage,
  wallPaneSubtitle,
} from "./wallInventoryPresentation";

function pane(partial: Partial<MuxPane> & Pick<MuxPane, "id">): MuxPane {
  return {
    title: "",
    cmdHint: "unknown",
    exited: false,
    ...partial,
  };
}

function session(partial: Partial<MuxSession> & Pick<MuxSession, "name">): MuxSession {
  return {
    exited: false,
    panes: [],
    ...partial,
  };
}

describe("visibleWallSessions", () => {
  it("drops exited sessions and empty inventory", () => {
    expect(visibleWallSessions(null)).toEqual([]);
    const inventory = {
      sessions: [
        session({ name: "work", panes: [pane({ id: "terminal_1" })] }),
        session({ name: "old", exited: true, panes: [] }),
      ],
    } satisfies MuxInventory;
    expect(visibleWallSessions(inventory).map((item) => item.name)).toEqual(["work"]);
  });
});

describe("visibleWallPanes", () => {
  it("drops exited panes", () => {
    expect(visibleWallPanes(undefined)).toEqual([]);
    const live = session({
      name: "work",
      panes: [pane({ id: "terminal_1" }), pane({ id: "terminal_2", exited: true })],
    });
    expect(visibleWallPanes(live).map((item) => item.id)).toEqual(["terminal_1"]);
  });
});

describe("wallPaneSubtitle", () => {
  it("includes title when present", () => {
    expect(wallPaneSubtitle(pane({ id: "terminal_1", cmdHint: "claude", title: "src" }))).toBe(
      "claude · src",
    );
    expect(wallPaneSubtitle(pane({ id: "terminal_1", cmdHint: "zsh" }))).toBe("zsh");
  });
});

describe("wallCommandErrorMessage", () => {
  it("uses the error message when present", () => {
    expect(wallCommandErrorMessage(new Error("Inject is not granted."))).toBe(
      "Inject is not granted.",
    );
    expect(wallCommandErrorMessage("nope")).toBe("The wall request failed.");
  });
});
