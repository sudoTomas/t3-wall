import { wallPaneLabel } from "@t3tools/client-runtime/state/wall";
import { useNavigate } from "@tanstack/react-router";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useMemo, useRef } from "react";

import { getClientSettings, useClientSettings } from "../../hooks/useSettings";
import { useEnvironments } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { wallInventory, wallWatch } from "../../state/wall";
import {
  hasDesktopNotifications,
  hasNotificationSound,
  playNotificationSound,
} from "../../threadNotifications";
import { livePaneKey } from "../../threadWall/threadWallLayout";
import { useThreadWallStore } from "../../threadWall/threadWallStore";
import { toastManager } from "../ui/toast";

export function WallNotificationCoordinator() {
  const { environments } = useEnvironments();
  const layoutByEnvironmentId = useThreadWallStore((state) => state.layoutByEnvironmentId);
  const liveEnvironmentIds = useMemo(
    () => new Set(environments.map((environment) => environment.environmentId)),
    [environments],
  );
  const panes = useMemo(() => {
    const next: Array<{ environmentId: EnvironmentId; session: string; paneId: string }> = [];
    for (const [environmentId, layout] of Object.entries(layoutByEnvironmentId)) {
      if (!liveEnvironmentIds.has(environmentId as EnvironmentId)) continue;
      for (const column of layout.columns) {
        if (column.livePane === null) continue;
        next.push({
          environmentId: environmentId as EnvironmentId,
          session: column.livePane.session,
          paneId: column.livePane.paneId,
        });
      }
    }
    return next;
  }, [layoutByEnvironmentId, liveEnvironmentIds]);

  return panes.map((pane) => (
    <BoundPaneActivityWatcher
      key={`${pane.environmentId}:${livePaneKey({ session: pane.session, paneId: pane.paneId })}`}
      environmentId={pane.environmentId}
      session={pane.session}
      paneId={pane.paneId}
    />
  ));
}

function BoundPaneActivityWatcher({
  environmentId,
  session,
  paneId,
}: {
  environmentId: EnvironmentId;
  session: string;
  paneId: string;
}) {
  const watch = useEnvironmentQuery(wallWatch({ environmentId, input: { session, paneId } }));
  const inventory = useEnvironmentQuery(wallInventory({ environmentId, input: {} }));
  const previous = useRef<string | null>(null);
  const mode = useClientSettings((settings) => settings.notificationMode);
  const inAppNotificationsEnabled = useClientSettings(
    (settings) => settings.inAppNotificationsEnabled,
  );
  const navigate = useNavigate();

  useEffect(() => {
    const activity = watch.data?.activity;
    if (activity === undefined || watch.data?.closed === true) return;
    const prior = previous.current;
    previous.current = activity;
    if (prior === null || prior === "blocked" || activity !== "blocked") return;

    const pane = inventory.data?.sessions
      .find((item) => item.name === session)
      ?.panes.find((item) => item.id === paneId);
    const title = pane !== undefined ? wallPaneLabel(pane) : paneId;

    if (hasNotificationSound(mode)) {
      void playNotificationSound("input", () =>
        hasNotificationSound(getClientSettings().notificationMode),
      );
    }

    const windowFocused = document.visibilityState === "visible" && document.hasFocus();
    const onWall = window.location.hash.includes("/wall");

    if (inAppNotificationsEnabled && windowFocused) {
      if (!onWall) {
        const toastId = toastManager.add({
          type: "warning",
          title: "Live pane blocked",
          description: title,
          data: { hideCopyButton: true },
          actionProps: {
            children: "Open wall",
            onClick: () => {
              toastManager.close(toastId);
              void navigate({ to: "/$environmentId/wall", params: { environmentId } });
            },
          },
        });
      }
      return;
    }

    if (
      !hasDesktopNotifications(mode) ||
      (document.visibilityState === "visible" && document.hasFocus()) ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    ) {
      return;
    }

    try {
      const notification = new Notification("Live pane blocked", {
        body: title,
        tag: `wall:${environmentId}:${session}:${paneId}`,
        silent: true,
      });
      notification.addEventListener("click", () => {
        notification.close();
        window.focus();
        void navigate({ to: "/$environmentId/wall", params: { environmentId } });
      });
    } catch {
      // Some browsers expose Notification but reject desktop presentation.
    }
  }, [
    environmentId,
    inAppNotificationsEnabled,
    inventory.data,
    mode,
    navigate,
    paneId,
    session,
    watch.data?.activity,
    watch.data?.closed,
  ]);

  return null;
}
