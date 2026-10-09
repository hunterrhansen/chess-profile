import { useState } from "react";
import { Switch, View } from "react-native";
import { router } from "expo-router";
import { Page } from "@/components/page";
import { Text, Card, Button } from "@/components/ui";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
export default function Settings() {
  const { account, connected, signOut } = useSession();
  const { isDark, setMode } = useTheme();
  const [error, setError] = useState<string>();
  return (
    <Page title="Settings" backTo="/">
      <Card>
        <Text heading>Your account</Text>
        <Text>{account}</Text>
        {connected && (
          <Button
            label="Sign out"
            variant="secondary"
            onPress={() => signOut().catch((err) => setError(err.message))}
          />
        )}
        {error && (
          <Text tone="danger" accessibilityRole="alert">
            {error}
          </Text>
        )}
      </Card>
      <Card>
        <Text heading>Appearance</Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text>Dark appearance</Text>
          <Switch
            accessibilityLabel="Dark appearance"
            value={isDark}
            onValueChange={(value) => setMode(value ? "dark" : "light")}
          />
        </View>
      </Card>
      <Button
        label="Link a chess account"
        onPress={() => router.push("/welcome")}
      />
      <Button
        label="Privacy"
        variant="secondary"
        onPress={() => router.push("/privacy")}
      />
      <Card>
        <Text tone="muted">
          Import controls, data export, and account deletion are coming next.
        </Text>
      </Card>
    </Page>
  );
}
