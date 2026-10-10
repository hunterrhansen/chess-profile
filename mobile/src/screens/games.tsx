import { useEffect, useState } from "react";
import { router } from "expo-router";
import { FlatList, View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { Placeholder } from "@/components/page";
import { Text, Button, Card } from "@/components/ui";
type Game = {
  id: number;
  opponent: string | null;
  played_at: string;
  outcome: string | null;
  analysed: boolean;
  opening: string | null;
  accuracy: number | null;
};
export default function Games() {
  const { connected } = useSession();
  return connected ? (
    <ConnectedGames />
  ) : (
    <Placeholder
      title="Games"
      description="Your imported games will appear here when you connect your Knightly account."
    >
      <Button
        label="Link a chess account"
        onPress={() => router.push("/welcome")}
      />
      <Button
        label="Try sample replay"
        variant="secondary"
        onPress={() => router.push("/games/preview")}
      />
    </Placeholder>
  );
}
function ConnectedGames() {
  const { api } = useSession();
  const { colors } = useTheme();
  const [page, setPage] = useState(1),
    [games, setGames] = useState<Game[]>([]),
    [total, setTotal] = useState(0),
    [busy, setBusy] = useState(true),
    [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    api<{ games: Game[]; total: number }>(
      `/api/games?page=${page}`,
      undefined,
      abort.signal,
    )
      .then((value) => {
        if (!abort.signal.aborted) {
          setGames((items) =>
            page === 1 ? value.games : [...items, ...value.games],
          );
          setTotal(value.total);
        }
      })
      .catch((err) => {
        if (!abort.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, [api, page, attempt]);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }}>
      <FlatList
        data={games}
        keyExtractor={(game) => String(game.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text heading accessibilityRole="header" style={{ fontSize: 30 }}>
              Your games
            </Text>
            <Text tone="muted">
              {total} imported games. Open a game to replay its moves.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card>
            <Text heading>
              vs {item.opponent ?? "opponent"} · {item.outcome ?? "Game"}
            </Text>
            <Text tone="muted">
              {new Date(item.played_at).toLocaleDateString()} ·{" "}
              {item.opening ?? "Opening unclassified"}
            </Text>
            <Text>
              {item.analysed
                ? item.accuracy == null
                  ? "Analysed"
                  : `${Math.round(item.accuracy)}% accuracy`
                : "Awaiting analysis"}
            </Text>
            <Button
              label="Open game"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: "/games/[id]",
                  params: { id: String(item.id) },
                })
              }
            />
          </Card>
        )}
        ListFooterComponent={
          <View style={styles.header}>
            {error && (
              <>
                <Text tone="danger" accessibilityRole="alert">
                  {error}
                </Text>
                <Button
                  label="Try again"
                  onPress={() => {
                    setBusy(true);
                    setError(undefined);
                    setAttempt((n) => n + 1);
                  }}
                />
              </>
            )}
            {busy ? (
              <Text>Loading games…</Text>
            ) : !error && games.length < total ? (
              <Button
                label="Load more"
                variant="secondary"
                onPress={() => {
                  setBusy(true);
                  setError(undefined);
                  setPage((n) => n + 1);
                }}
              />
            ) : (
              !error &&
              games.length === 0 && (
                <Text>
                  No imported games yet. Import games in Knightly on the web to
                  create your practice deck.
                </Text>
              )
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  list: {
    padding: 20,
    gap: 16,
    maxWidth: 600,
    width: "100%",
    alignSelf: "center",
  },
  header: { gap: 16 },
});
