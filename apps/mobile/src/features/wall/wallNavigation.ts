import type { EnvironmentId } from "@t3tools/contracts";

export type WallEntryRoute =
  | { readonly name: "WallEnvironments" }
  | { readonly name: "WallSessions"; readonly params: { readonly environmentId: EnvironmentId } };

export function wallEntryRoute(
  environments: ReadonlyArray<{ readonly environmentId: EnvironmentId }>,
  selectedEnvironmentId: EnvironmentId | null,
): WallEntryRoute {
  if (selectedEnvironmentId !== null) {
    return { name: "WallSessions", params: { environmentId: selectedEnvironmentId } };
  }
  const only = environments[0];
  if (environments.length === 1 && only !== undefined) {
    return { name: "WallSessions", params: { environmentId: only.environmentId } };
  }
  return { name: "WallEnvironments" };
}

export function wallEntryPath(route: WallEntryRoute): string {
  if (route.name === "WallEnvironments") return "/wall";
  return `/wall/${route.params.environmentId}`;
}
