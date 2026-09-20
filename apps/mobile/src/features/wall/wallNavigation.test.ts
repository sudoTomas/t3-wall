import { describe, expect, it } from "vite-plus/test";
import type { EnvironmentId } from "@t3tools/contracts";

import { wallEntryPath, wallEntryRoute } from "./wallNavigation";

const envA = "env-a" as EnvironmentId;
const envB = "env-b" as EnvironmentId;

describe("wallEntryRoute", () => {
  it("opens the selected environment when one is chosen", () => {
    expect(wallEntryRoute([{ environmentId: envA }, { environmentId: envB }], envB)).toEqual({
      name: "WallSessions",
      params: { environmentId: envB },
    });
  });

  it("skips the environment list when there is only one environment", () => {
    expect(wallEntryRoute([{ environmentId: envA }], null)).toEqual({
      name: "WallSessions",
      params: { environmentId: envA },
    });
  });

  it("lists environments when none is selected and more than one exists", () => {
    expect(wallEntryRoute([{ environmentId: envA }, { environmentId: envB }], null)).toEqual({
      name: "WallEnvironments",
    });
  });
});

describe("wallEntryPath", () => {
  it("builds linking paths for the entry route", () => {
    expect(wallEntryPath({ name: "WallEnvironments" })).toBe("/wall");
    expect(wallEntryPath({ name: "WallSessions", params: { environmentId: envA } })).toBe(
      "/wall/env-a",
    );
  });
});
