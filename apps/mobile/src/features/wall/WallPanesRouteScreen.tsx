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
import {
  visibleWallPanes,
  visibleWallSessions,
  wallPaneSubtitle,
} from "./wallInventoryPresentation";
import { WallPickRow } from "./WallPickRow";

export function WallPanesRouteScreen({
  route,
}: StaticScreenProps<{ environmentId: string; session: string }>) {
  const environmentId = route.params.environmentId as EnvironmentId;
  const sessionName = route.params.session;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const inventory = useEnvironmentQuery(
    wallEnvironment.inventory({ environmentId, input: { session: sessionName } }),
  );
  const session = visibleWallSessions(inventory.data).find((item) => item.name === sessionName);
  const panes = visibleWallPanes(session);

  return (
    <View className="flex-1 bg-background">
      <NativeStackScreenOptions options={{ title: sessionName }} />
      {inventory.isPending && inventory.data === null ? (
        <LoadingScreen message="Looking for panes…" />
      ) : inventory.error !== null ? (
        <View className="p-5">
          <ErrorBanner message={inventory.error} />
        </View>
      ) : panes.length === 0 ? (
        <EmptyState
          title="No live panes"
          detail="This Zellij session has no active panes."
          actionLabel="Refresh"
          onAction={inventory.refresh}
        />
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) }}
        >
          {panes.map((pane) => (
            <WallPickRow
              key={pane.id}
              title={pane.id}
              subtitle={wallPaneSubtitle(pane)}
              onPress={() =>
                navigation.navigate("WallPane", {
                  environmentId,
                  session: sessionName,
                  paneId: pane.id,
                })
              }
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
