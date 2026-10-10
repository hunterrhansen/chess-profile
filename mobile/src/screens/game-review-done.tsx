import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Text, Card, Button } from "@/components/ui";
import { KnIcon } from "@/components/kn-icon";
import { CompletionConfetti } from "@/components/completion-motion";
import { BottomActions, BottomAction } from "@/components/bottom-actions";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { replayGame, type GameDetail } from "@/lib/game-replay";
import { reviewResults } from "@/lib/review-completion";
import type { Api } from "@/lib/api";
import { ReviewFrame } from "./game-review";
export default function ReviewDone() {
  const { id, celebrate } = useLocalSearchParams<{
    id: string;
    celebrate?: string;
  }>();
  const { connected, api, practiceScope } = useSession();
  if (!connected)
    return (
      <ReviewFrame>
        <View style={{ padding: 16, gap: 12 }}>
          <Text heading>No saved review</Text>
          <Text>Sample replay does not save review marks.</Text>
        </View>
      </ReviewFrame>
    );
  return (
    <ReviewDoneLoader
      key={`${practiceScope}/${id}`}
      id={id}
      api={api}
      celebrate={celebrate === "1"}
    />
  );
}
export function ReviewDoneLoader({
  id,
  api,
  celebrate = false,
}: {
  id: string;
  api: Api;
  celebrate?: boolean;
}) {
  const [game, setGame] = useState<GameDetail>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const valid = /^[1-9]\d*$/.test(id ?? "");
  useEffect(() => {
    if (!valid) return;
    const abort = new AbortController();
    api<GameDetail>(`/api/games/${id}`, undefined, abort.signal)
      .then((g) => {
        if (!abort.signal.aborted) setGame(g);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [id, api, valid, attempt]);
  if (game) return <SavedReviewResults game={game} celebrate={celebrate} />;
  return (
    <ReviewFrame>
      <View style={{ padding: 16, gap: 16 }}>
        <Text heading>
          {!valid
            ? "Invalid game link"
            : error
              ? "Could not load results"
              : "Loading your saved review…"}
        </Text>
        {error && (
          <>
            <Text tone="danger" selectable accessibilityRole="alert">
              {error}
            </Text>
            <Button
              label="Try again"
              onPress={() => {
                setError(undefined);
                setAttempt((n) => n + 1);
              }}
            />
          </>
        )}
      </View>
    </ReviewFrame>
  );
}
export function SavedReviewResults({
  game,
  celebrate = false,
}: {
  game: GameDetail;
  celebrate?: boolean;
}) {
  const { colors: c } = useTheme();
  const stats = reviewResults(game);
  let labels = new Map<number, string>();
  try {
    labels = new Map(replayGame(game).moves.map((m) => [m.ply, m.label]));
  } catch {
    /* Stored marks remain visible if replay is unreadable. */
  }
  if (!stats)
    return (
      <ReviewFrame>
        <View style={{ padding: 16, gap: 16 }}>
          <Text heading>This review is not saved yet</Text>
          <Text>Finish the guided lesson to save your results.</Text>
          <Button
            label="Open review"
            onPress={() =>
              router.replace({
                pathname: "/games/[id]",
                params: { id: String(game.id) },
              })
            }
          />
        </View>
      </ReviewFrame>
    );
  const opponent = game.color === "black" ? game.white : game.black;
  return (
    <ReviewFrame>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          gap: 24,
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View style={{ alignItems: "center", gap: 12 }}>
          {celebrate && <CompletionConfetti />}
          <KnIcon glyph="trophy" size={80} />
          <Text heading accessibilityRole="header" style={{ fontSize: 32 }}>
            Review complete!
          </Text>
          <Text tone="muted">vs {opponent}</Text>
        </View>
        <View
          style={{ width: "100%", maxWidth: 560, flexDirection: "row", gap: 8 }}
        >
          {[
            ["Found", `${stats.found} of ${stats.asked}`],
            [
              "Accuracy",
              game.accuracy == null ? "—" : `${game.accuracy.toFixed(1)}%`,
            ],
            ["To fix", String(stats.toFix)],
          ].map(([label, value]) => (
            <Card
              key={label}
              containerStyle={{ flex: 1 }}
              style={{ alignItems: "center", padding: 12 }}
            >
              <Text tone="muted" style={{ fontSize: 12 }}>
                {label}
              </Text>
              <Text heading style={{ fontSize: 23 }}>
                {value}
              </Text>
            </Card>
          ))}
        </View>
        <View style={{ width: "100%", maxWidth: 560, gap: 12 }}>
          <Text heading>Key moments</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {game.review_marks.map((m) => (
              <View
                key={m.ply}
                accessible
                accessibilityLabel={`${labels.get(m.ply) ?? `Half-move ${m.ply}`}: ${m.mark === "helped" ? "found with help" : m.mark}`}
                style={{
                  padding: 10,
                  borderRadius: 12,
                  backgroundColor:
                    m.mark === "praise"
                      ? c.gold
                      : m.mark === "found" || m.mark === "good"
                        ? c.brand
                        : m.mark === "missed"
                          ? c.danger
                          : c.surface,
                  borderWidth: 2,
                  borderColor: c.line,
                }}
              >
                <Text
                  style={{
                    color:
                      m.mark === "praise"
                        ? c.onGold
                        : m.mark === "found" || m.mark === "good"
                          ? c.onBrand
                          : m.mark === "missed"
                            ? c.onDanger
                            : c.ink,
                  }}
                >
                  {labels.get(m.ply) ?? String(m.ply)} · {m.mark}
                </Text>
              </View>
            ))}
          </View>
          {stats.helped + stats.missed > 0 && (
            <Text tone="muted">
              Go over again: {stats.helped + stats.missed} key moments.
            </Text>
          )}
          {game.review_marks.length === 0 && (
            <Text tone="muted">
              A quiet game, with no key moments to drill.
            </Text>
          )}
        </View>
      </ScrollView>
      <BottomActions
        reservedHeight={120}
        feedback={<Text tone="muted">Your review is saved.</Text>}
        primary={
          <BottomAction
            label="Practice positions"
            onPress={() => router.dismissTo("/practice")}
          />
        }
        secondary={
          <BottomAction
            quiet
            label="Back home"
            onPress={() => router.dismissTo("/")}
          />
        }
      />
    </ReviewFrame>
  );
}
