import { AppState } from "react-native";

export async function notifyWallPaneBlocked(title: string): Promise<void> {
  if (AppState.currentState === "active") return;
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Live pane blocked",
        body: title,
      },
      trigger: null,
    });
  } catch {
    // Native notifications are unavailable in unit tests.
  }
}
