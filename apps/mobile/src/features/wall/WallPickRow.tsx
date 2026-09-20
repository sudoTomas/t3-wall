import { Platform, Pressable, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { MaterialListRow } from "../../components/MaterialListRow";
import { SymbolView } from "../../components/AppSymbol";

export function WallPickRow(props: {
  readonly title: string;
  readonly subtitle?: string;
  readonly onPress: () => void;
}) {
  if (Platform.OS === "android") {
    return (
      <MaterialListRow title={props.title} subtitle={props.subtitle} onPress={props.onPress} />
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      className="flex-row items-center gap-3 px-5 py-3.5 active:opacity-70"
      onPress={props.onPress}
    >
      <View className="min-w-0 flex-1">
        <Text className="text-lg text-foreground" numberOfLines={1}>
          {props.title}
        </Text>
        {props.subtitle ? (
          <Text className="mt-0.5 text-sm text-foreground-muted" numberOfLines={1}>
            {props.subtitle}
          </Text>
        ) : null}
      </View>
      <SymbolView name="chevron.right" size={16} tintColorClassName="accent-chevron" />
    </Pressable>
  );
}
