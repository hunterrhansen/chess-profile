import { useEffect, useState } from "react";
import { router } from "expo-router";
import { ScrollView, StyleSheet, View, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useSession } from "../lib/session";
import { useTheme } from "../lib/theme";
import { type DeckToday } from "../lib/api";
import { Logo } from "../components/logo";
import { Text, Button, Card, Progress } from "../components/ui";
import SamplePractice from "../screens/sample-practice";
export default function Home() {
  const session = useSession();
  return session.connected ? <ConnectedHome /> : <SamplePractice />;
}
function ConnectedHome() {
  const { api, account, signOut } = useSession();
  const { colors: c, isDark, setMode } = useTheme();
  const [deck, setDeck] = useState<DeckToday>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    api<DeckToday>("/api/deck", undefined, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setDeck(value);
      })
      .catch((err) => {
        if (!abort.signal.aborted) setError(err.message);
      });
    return () => abort.abort();
  }, [api, attempt]);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <Logo />
          <Text heading accessibilityRole="header" style={{ fontSize: 30 }}>
            Your daily practice
          </Text>
          <Text tone="muted">
            Find better moves from your own games. Every answer helps shape your
            next review.
          </Text>
          {error && (
            <Card>
              <Text tone="danger" accessibilityRole="alert">
                {error}
              </Text>
              <Button
                label="Try again"
                onPress={() => {
                  setError(undefined);
                  setAttempt((n) => n + 1);
                }}
              />
            </Card>
          )}
          {deck ? (
            <Card>
              <Text heading style={{ fontSize: 24 }}>
                {deck.today.done} of {deck.today.total} reviewed today
              </Text>
              <Progress
                value={deck.today.done}
                total={Math.max(1, deck.today.total)}
              />
              <Text tone="muted">
                {deck.mastered} mastered · {deck.learning} learning · {deck.new}{" "}
                new
              </Text>
              <Button
                label={deck.card ? "Start practice" : "See today's practice"}
                onPress={() => router.push("/practice")}
              />
            </Card>
          ) : (
            !error && <Text>Loading your practice…</Text>
          )}
          <Button
            label="Your games"
            variant="secondary"
            onPress={() => router.push("/games")}
          />
          <Card>
            <Text heading>Your account</Text>
            <Text>{account}</Text>
            <View style={styles.row}>
              <Text>Dark appearance</Text>
              <Switch
                accessibilityLabel="Dark appearance"
                value={isDark}
                onValueChange={(value) => setMode(value ? "dark" : "light")}
              />
            </View>
            <Button
              label="Sign out"
              variant="secondary"
              onPress={() => {
                signOut().catch((err) => setError(err.message));
              }}
            />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: 20, alignItems: "center" },
  column: { width: "100%", maxWidth: 440, gap: 20 },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
  },
});
