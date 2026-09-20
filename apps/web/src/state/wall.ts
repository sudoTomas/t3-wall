import { createWallEnvironmentAtoms } from "@t3tools/client-runtime/state/wall";

import { connectionAtomRuntime } from "../connection/runtime";

export const {
  inventory: wallInventory,
  listGrants: wallListGrants,
  grant: wallGrant,
  inject: wallInject,
  watch: wallWatch,
} = createWallEnvironmentAtoms(connectionAtomRuntime);
