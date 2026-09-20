import { EnvironmentId } from "@t3tools/contracts";
import * as Arr from "effect/Array";
import * as Order from "effect/Order";
import { useNavigation } from "@react-navigation/native";
import { useMemo } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "../../components/EmptyState";
import { ScreenScrollView as ScrollView } from "../../components/ScreenScrollView";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useSavedRemoteConnections } from "../../state/use-remote-environment-registry";
import { WallPickRow } from "./WallPickRow";

export function WallEnvironmentsRouteScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { savedConnectionsById } = useSavedRemoteConnections();
  const environments = useMemo(
    () =>
      Arr.sort(
        Object.values(savedConnectionsById).map((connection) => ({
          environmentId: connection.environmentId,
          label: connection.environmentLabel,
        })),
        Order.mapInput(Order.String, (environment: { readonly label: string }) =>
          environment.label.toLocaleLowerCase(),
        ),
      ),
    [savedConnectionsById],
  );

  return (
    <View className="flex-1 bg-background">
      <NativeStackScreenOptions options={{ title: "Live panes" }} />
      {environments.length === 0 ? (
        <EmptyState
          title="No environments"
          detail="Add an environment, then open live panes to watch a Zellij session."
        />
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) }}
        >
          {environments.map((environment) => (
            <WallPickRow
              key={environment.environmentId}
              title={environment.label}
              onPress={() =>
                navigation.navigate("WallSessions", {
                  environmentId: environment.environmentId as EnvironmentId,
                })
              }
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
