import { createWallEnvironmentAtoms } from "@t3tools/client-runtime/state/wall";

import { connectionAtomRuntime } from "../connection/runtime";

export const wallEnvironment = createWallEnvironmentAtoms(connectionAtomRuntime);
