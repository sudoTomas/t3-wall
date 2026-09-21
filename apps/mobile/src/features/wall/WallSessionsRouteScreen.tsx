import { EnvironmentId } from "@t3tools/contracts";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { LoadingScreen } from "../../components/LoadingScreen";
import { ScreenScrollView as ScrollView } from "../../components/ScreenScrollView";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useEnvironmentQuery } from "../../state/query";
import { wallEnvironment } from "../../state/wall";
import { visibleWallPanes, visibleWallSessions } from "./wallInventoryPresentation";
import { WallPickRow } from "./WallPickRow";

export function WallSessionsRouteScreen({ route }: StaticScreenProps<{ environmentId: string }>) {
  const environmentId = route.params.environmentId as EnvironmentId;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const inventory = useEnvironmentQuery(wallEnvironment.inventory({ environmentId, input: {} }));
  const sessions = visibleWallSessions(inventory.data);

  return (
    <View className="flex-1 bg-background">
      <NativeStackScreenOptions options={{ title: "Sessions" }} />
      {inventory.isPending && inventory.data === null ? (
        <LoadingScreen message="Looking for live sessions…" />
      ) : inventory.error !== null ? (
        <View className="p-5">
          <ErrorBanner message={inventory.error} />
        </View>
      ) : sessions.length === 0 ? (
        <EmptyState
          title="No live sessions"
          detail="No active Zellij or iTerm sessions on this environment. Start one in a terminal, then pull to refresh."
          actionLabel="Refresh"
          onAction={inventory.refresh}
        />
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) }}
        >
          {sessions.map((session) => (
            <WallPickRow
              key={session.name}
              title={session.name}
              subtitle={`${visibleWallPanes(session).length} panes`}
              onPress={() =>
                navigation.navigate("WallPanes", {
                  environmentId,
                  session: session.name,
                })
              }
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
