import type { EnvironmentId } from "@t3tools/contracts";
import { createFileRoute } from "@tanstack/react-router";

import { ThreadWallView } from "../components/threadWall/ThreadWallView";

export const Route = createFileRoute("/_chat/$environmentId/wall")({
  component: ThreadWallRoute,
});

function ThreadWallRoute() {
  const { environmentId } = Route.useParams();
  return <ThreadWallView environmentId={environmentId as EnvironmentId} />;
}
