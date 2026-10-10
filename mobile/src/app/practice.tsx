import { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View } from "react-native";
import { Text } from "@/components/ui";
import { KnIcon } from "@/components/kn-icon";
import {
  LessonScreen,
  LessonBar,
  LessonAction,
} from "@/components/lesson-screen";
import { PracticeSession, practiceSummary } from "@/lib/practice-flow";
import { type DeckToday, type DeckCard } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import PracticePosition from "@/screens/practice-position";
import SamplePractice from "@/screens/sample-practice";
export default function Practice() {
  const { connected } = useSession();
  return connected ? <DailyPractice /> : <SamplePractice />;
}
function DailyPractice() {
  const [previousPosition, setPreviousPosition] = useState<{ fen: string; flipped: boolean }>();
  const { api, practiceScope } = useSession();
  const practice = useMemo(
    () =>
      new PracticeSession(
        AsyncStorage,
        practiceScope,
        new Date().toISOString().slice(0, 10),
      ),
    [practiceScope],
  );
  const [deck, setDeck] = useState<DeckToday>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [missed, setMissed] = useState<DeckCard[]>([]);

  const [refresh, setRefresh] = useState(0);
  const { colors } = useTheme();
  useEffect(() => {
    const abort = new AbortController();
    const checkpoint = practice.checkpoint();
    Promise.all([
      api<DeckToday>("/api/deck", undefined, abort.signal),
      practice.load(),
    ])
      .then(async ([value]) => {
        await practice.reconcile(value, checkpoint).catch(() => {});
        if (!abort.signal.aborted) {
          setDeck(value);
          setMissed([...practice.queue]);
        }
      })
      .catch((err) => {
        if (!abort.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [api, refresh, practice]);
  const redo = !!deck && !deck.card && missed.length > 0;
  const card = deck?.card ?? (redo ? missed[0] : null);
  const summary = practiceSummary(deck?.results ?? []);
  function next(position: { fen: string; flipped: boolean }) {
    setPreviousPosition(position);
    if (redo && card) {
      void practice.complete(card).catch(() => {});
      setMissed([...practice.queue]);
    } else {
      setLoading(true);
      setError(undefined);
      setRefresh((n) => n + 1);
    }
  }
  if (!error && deck && card)
    return (
      <PracticePosition
        api={api}
        previousPosition={previousPosition}
        advancing={loading}
        key={`${card.game_id}-${card.ply}-${redo ? "redo" : "first"}`}
        card={card}
        deck={deck}
        redo={redo}
        onNext={next}
        practice={practice}
        againLeft={missed.length}
      />
    );
  return (
    <LessonScreen
      done={deck?.today.done ?? 0}
      total={deck?.today.total ?? 0}
      footer={
        <LessonBar
          detail={
            loading
              ? "Picking your due positions…"
              : error
                ? "Couldn’t load your positions. Try again."
                : "Your next review dates are saved to your account."
          }
        >
          {error ? (
            <LessonAction
              label="Try again"
              onPress={() => {
                setLoading(true);
                setError(undefined);
                setRefresh((n) => n + 1);
              }}
            />
          ) : (
            <LessonAction
              label="Back home"
              onPress={() => router.dismissTo("/")}
            />
          )}
        </LessonBar>
      }
    >
      <View
        style={{
          flex: 1,
          paddingHorizontal: 16,
          justifyContent: "center",
          alignItems: "center",
          gap: 16,
        }}
      >
        {loading ? (
          <Text>Loading your practice…</Text>
        ) : error ? (
          <Text tone="danger" accessibilityRole="alert">
            {error}
          </Text>
        ) : (
          deck && (
            <>
              <KnIcon glyph="check" size={64} />
              <Text heading style={{ fontSize: 28, lineHeight: 34 }}>
                {deck.total === 0 ? "No positions yet" : "Done for today"}
              </Text>
              <Text tone="muted" style={{ textAlign: "center" }}>
                {deck.total === 0
                  ? "Review an analysed game to build your practice deck."
                  : `${deck.today.done} positions reviewed · ${summary.found} found, ${summary.helped} with help, ${summary.missed} missed.`}
              </Text>
              <View
                style={{ flexDirection: "row", gap: 4, alignSelf: "stretch" }}
              >
                {deck.results.map((result) => (
                  <View
                    key={`${result.game_id}-${result.ply}`}
                    accessible
                    accessibilityLabel={`${result.san}: ${result.mark}`}
                    style={{
                      flex: 1,
                      height: 20,
                      borderRadius: 6,
                      backgroundColor:
                        result.mark === "found" || result.mark === "good"
                          ? colors.brand
                          : result.mark === "helped"
                            ? colors.sky
                            : colors.danger,
                    }}
                  />
                ))}
              </View>
              <Text tone="muted" style={{ textAlign: "center" }}>
                {deck.mastered} mastered · {deck.learning} learning · {deck.new}{" "}
                new
              </Text>
            </>
          )
        )}
      </View>
    </LessonScreen>
  );
}
