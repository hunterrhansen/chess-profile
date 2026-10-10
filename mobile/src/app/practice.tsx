import { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScrollView } from "react-native";
import { KnightLoader } from "@/components/knight-loader";
import { Text } from "@/components/ui";
import {
  LessonScreen,
  LessonGeometry,
  LessonBar,
  LessonAction,
} from "@/components/lesson-screen";
import { PracticeSession } from "@/lib/practice-flow";
import { type DeckToday, type DeckCard } from "@/lib/api";
import { useSession } from "@/lib/session";
import PracticePosition from "@/screens/practice-position";
import SamplePractice from "@/screens/sample-practice";
import PracticeComplete from "@/screens/practice-complete";
export default function Practice() {
  const { connected } = useSession();
  return <LessonGeometry>{connected ? <DailyPractice /> : <SamplePractice />}</LessonGeometry>;
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
  if (deck && card)
    return (
      <PracticePosition
        api={api}
        previousPosition={previousPosition}
        advancing={loading}
        advanceError={error ? "Couldn’t load the next position. Try Continue again." : undefined}
        key={`${card.game_id}-${card.ply}-${redo ? "redo" : "first"}`}
        card={card}
        deck={deck}
        redo={redo}
        onNext={next}
        practice={practice}
        againLeft={missed.length}
      />
    );
  if (deck && !loading && !error && deck.total > 0)
    return <PracticeComplete done={deck.today.done} results={deck.results} stats={deck} />;
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
          primary={error ? (
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
        />
      }
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 16,
          justifyContent: "center",
          alignItems: "center",
          gap: 16,
        }}
      >
        {loading ? (
          <KnightLoader />
        ) : error ? (
          <Text tone="danger" accessibilityRole="alert">
            {error}
          </Text>
        ) : (
          deck && (
            <>
              <Text heading style={{ fontSize: 28, lineHeight: 34 }}>
                No positions yet
              </Text>
              <Text tone="muted" style={{ textAlign: "center" }}>
                Review an analysed game to build your practice deck.
              </Text>
            </>
          )
        )}
      </ScrollView>
    </LessonScreen>
  );
}
