import type { MuxCmdHint } from "@t3tools/contracts";

const AGENT_CMD_HINTS = ["claude", "grok", "codex", "cursor", "opencode", "antigravity"] as const;

const CLAUDE_CONFIG_DIR = /CLAUDE_CONFIG_DIR=(\S+)/;

export function isAgentHint(hint: MuxCmdHint): boolean {
  return (AGENT_CMD_HINTS as ReadonlyArray<string>).includes(hint);
}

export function cmdHintFrom(command: string | null | undefined, title: string): MuxCmdHint {
  const hay = `${command ?? ""} ${title}`.toLowerCase();
  for (const hint of AGENT_CMD_HINTS) {
    if (new RegExp(`\\b${hint}\\b`).test(hay)) return hint;
  }
  const binary = (command ?? "").trim().split(/\s+/).at(-1);
  if (binary === "zsh" || binary === "bash" || binary === "sh" || binary === "fish") {
    return "zsh";
  }
  return "unknown";
}

export function accountHintFrom(
  command: string | null | undefined,
  title: string,
): string | undefined {
  const fromEnv = command?.match(CLAUDE_CONFIG_DIR)?.[1];
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
  const trimmedTitle = title.trim();
  if (trimmedTitle === "claude-work" || trimmedTitle === "claude-personal") return trimmedTitle;
  return undefined;
}
