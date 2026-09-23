import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  isAgentCmdHint,
  wallActivityLabel,
  wallPaneLabel,
} from "@t3tools/client-runtime/state/wall";
import { EnvironmentId, type MuxPane } from "@t3tools/contracts";
import { type StaticScreenProps } from "@react-navigation/native";
import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Switch, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { ErrorBanner } from "../../components/ErrorBanner";
import { MaterialButton } from "../../components/MaterialButton";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironmentQuery } from "../../state/query";
import { wallEnvironment } from "../../state/wall";
import { notifyWallPaneBlocked } from "./wallPaneBlockedAlert";
import { wallCommandErrorMessage } from "./wallInventoryPresentation";

function paneFromInventory(
  sessions: ReadonlyArray<{ name: string; panes: ReadonlyArray<MuxPane> }> | null,
  session: string,
  paneId: string,
): MuxPane | undefined {
  return sessions
    ?.find((candidate) => candidate.name === session)
    ?.panes.find((pane) => pane.id === paneId);
}

export function WallPaneRouteScreen({
  route,
}: StaticScreenProps<{ environmentId: string; session: string; paneId: string }>) {
  const environmentId = route.params.environmentId as EnvironmentId;
  const { session, paneId } = route.params;
  const insets = useSafeAreaInsets();
  const inventory = useEnvironmentQuery(
    wallEnvironment.inventory({ environmentId, input: { session } }),
  );
  const grants = useEnvironmentQuery(wallEnvironment.listGrants({ environmentId, input: {} }));
  const watch = useEnvironmentQuery(
    wallEnvironment.watch({ environmentId, input: { session, paneId } }),
  );
  const grant = useAtomCommand(wallEnvironment.grant, { reportFailure: false });
  const inject = useAtomCommand(wallEnvironment.inject, { reportFailure: false });
  const pane = paneFromInventory(inventory.data?.sessions ?? null, session, paneId);
  const needsConfirm = !isAgentCmdHint(pane?.cmdHint);
  const grantQueryAvailable = grants.data !== null;
  const granted = grants.data?.sessions.includes(session) ?? false;
  const [draft, setDraft] = useState("");
  const [confirmShell, setConfirmShell] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewport = watch.data?.viewport ?? [];
  const closed = watch.data?.closed === true;
  const activity = watch.data?.activity ?? "idle";
  const previousActivity = useRef<string | null>(null);
  useEffect(() => {
    const prior = previousActivity.current;
    previousActivity.current = activity;
    if (closed || prior === null || prior === "blocked" || activity !== "blocked") return;
    void notifyWallPaneBlocked(pane !== undefined ? wallPaneLabel(pane) : paneId);
  }, [activity, closed, pane, paneId]);
  const status = useMemo(() => {
    if (watch.error !== null) return watch.error;
    if (closed) return "Pane closed.";
    if (viewport.length === 0) return "Waiting for pane frames…";
    return null;
  }, [closed, viewport.length, watch.error]);

  async function send() {
    const text = draft.trim();
    if (text.length === 0 || pending || closed) return;
    if (needsConfirm && !confirmShell) {
      setError("Confirm sending to a non-agent pane.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await inject({
        environmentId,
        input: {
          session,
          paneId,
          text,
          submit: true,
          ...(needsConfirm ? { confirmShell } : {}),
        },
      });
      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          setError(wallCommandErrorMessage(squashAtomCommandFailure(result)));
        }
        return;
      }
      setDraft("");
    } finally {
      setPending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <NativeStackScreenOptions
        options={{ title: pane !== undefined ? wallPaneLabel(pane) : `${session} / ${paneId}` }}
      />
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="px-4 py-3"
      >
        <Text
          className={`mb-2 text-sm ${activity === "blocked" && !closed ? "text-danger-foreground" : "text-foreground-muted"}`}
        >
          {pane?.cmdHint ?? "live pane"}
          {viewport.length > 0 && !closed ? ` · ${wallActivityLabel(activity)}` : ""}
          {grantQueryAvailable ? (granted ? " · inject granted" : " · inject not granted") : ""}
        </Text>
        {watch.error !== null ? <ErrorBanner message={watch.error} /> : null}
        <Text
          selectable
          className="rounded-xl bg-card p-3 font-mono text-[11px] leading-4 text-foreground"
        >
          {viewport.length > 0 ? viewport.join("\n") : status}
        </Text>
      </ScrollView>
      <View
        className="gap-2 border-t border-border bg-background px-4 pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        {error !== null ? <ErrorBanner message={error} /> : null}
        {grantQueryAvailable && !granted ? (
          <MaterialButton
            label="Grant inject"
            tone="secondary"
            onPress={() => {
              void grant({ environmentId, input: { session } });
            }}
          />
        ) : null}
        {needsConfirm ? (
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-foreground">Send to shell</Text>
            <Switch value={confirmShell} onValueChange={setConfirmShell} />
          </View>
        ) : null}
        <TextInput
          accessibilityLabel="Inject into live pane"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!pending && !closed}
          multiline
          placeholder={closed ? "Pane closed" : "Type to inject into this pane"}
          placeholderTextColor="rgb(140,140,140)"
          value={draft}
          className="min-h-16 rounded-xl border border-border bg-card px-3 py-2 text-base text-foreground"
          onChangeText={setDraft}
        />
        <MaterialButton
          label="Inject"
          tone="primary"
          disabled={
            pending || closed || draft.trim().length === 0 || (needsConfirm && !confirmShell)
          }
          loading={pending}
          onPress={() => {
            void send();
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
