import { describe, expect, it } from "vite-plus/test";

import { inferMuxPaneActivity } from "./wall.ts";

describe("inferMuxPaneActivity", () => {
  it("treats a composer prompt as idle", () => {
    expect(inferMuxPaneActivity(["❯ ", "Shift+Tab:mode  │  Enter:send"])).toBe("idle");
    expect(inferMuxPaneActivity(["-- INSERT --", "❯"])).toBe("idle");
    expect(inferMuxPaneActivity([])).toBe("idle");
  });

  it("does not treat a Grok always-approve footer as blocked", () => {
    expect(
      inferMuxPaneActivity([
        "❯ ",
        "Grok 4.7 (high) · always-approve",
        "Shift+Tab:mode  │  Ctrl+.:shortcuts",
      ]),
    ).toBe("idle");
  });

  it("treats thinking / interrupt as running", () => {
    expect(inferMuxPaneActivity(["⠋ Thinking…", "esc to interrupt"])).toBe("running");
    expect(inferMuxPaneActivity(["◆ Thought for 3.9s"])).toBe("running");
  });

  it("treats permission and approval prompts as blocked", () => {
    expect(
      inferMuxPaneActivity([
        "Allow Bash to run this command?",
        "❯ 1. Yes",
        "  2. Yes, and don't ask again",
        "  3. No",
      ]),
    ).toBe("blocked");
    expect(inferMuxPaneActivity(["Claude wants to use Read", "Do you want to proceed?"])).toBe(
      "blocked",
    );
    expect(inferMuxPaneActivity(["Waiting for your approval", "Approve    Reject"])).toBe(
      "blocked",
    );
  });
});
