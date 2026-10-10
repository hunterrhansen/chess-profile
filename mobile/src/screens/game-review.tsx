import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text, Button, Progress } from "@/components/ui";
import { useTheme } from "@/lib/theme";
import { useSession } from "@/lib/session";
import type { Api } from "@/lib/api";
import { replayIndex, type GameDetail } from "@/lib/game-replay";
import { buildReviewLesson, assembleReviewMarks } from "@/lib/review-lesson";
import {
  nextReviewStep,
  loadExplanation,
  ReviewLifecycle,
} from "@/lib/review-flow";
import { finishReview } from "@/lib/review-completion";
import {
  ReviewSession,
  completionConfirmed,
  restoreReviewSnapshot,
} from "@/lib/review-session";
import { PracticeSession } from "@/lib/practice-flow";
import GameReplay from "./game-replay";
import ReviewPosition from "./review-position";
export default function GameReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { connected, api, practiceScope } = useSession();
  if (!connected) return <GameReplay />;
  return (
    <GameReviewLoader
      key={`${practiceScope}/${id}`}
      id={id}
      api={api}
      scope={practiceScope}
    />
  );
}
export function ReviewFrame({
  children,
  done = 0,
  total = 0,
  gameId,
  ply,
  busy = false,
}: {
  children: ReactNode;
  done?: number;
  total?: number;
  gameId?: number;
  ply?: number;
  busy?: boolean;
}) {
  const { colors, isDark } = useTheme();
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.page }}
    >
      <StatusBar style={isDark ? "light" : "dark"} />
      <View
        style={{
          padding: 16,
          gap: 12,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Button
          label="×"
          accessibilityLabel="Exit review to Games"
          variant="secondary"
          disabled={busy}
          onPress={() => router.dismissTo("/games")}
        />
        <View style={{ flex: 1, gap: 6 }}>
          <Text heading style={{ fontSize: 16 }}>
            Key moments {total ? `${done} of ${total}` : ""}
          </Text>
          {total > 0 && (
            <Progress label="Review progress" value={done} total={total} />
          )}
        </View>
        {gameId && (
          <Button
            label="All moves"
            variant="secondary"
            disabled={busy}
            onPress={() =>
              router.push({
                pathname: "/games/[id]/moves",
                params: {
                  id: String(gameId),
                  ply: String(ply ?? 0),
                  lesson: "1",
                },
              })
            }
          />
        )}
      </View>
      {children}
    </SafeAreaView>
  );
}
export function GameReviewLoader({
  id,
  api,
  scope,
}: {
  id: string;
  api: Api;
  scope: string;
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
  }, [id, api, attempt, valid]);
  if (game) return <GuidedReview game={game} api={api} scope={scope} />;
  return (
    <ReviewFrame>
      <View style={{ padding: 16, gap: 16 }}>
        <Text heading>
          {!valid
            ? "Invalid game link"
            : error
              ? "Could not open this review"
              : "Setting up the lesson…"}
        </Text>
        {error && (
          <Text tone="danger" selectable accessibilityRole="alert">
            {error}
          </Text>
        )}
        {valid && error && (
          <Button
            label="Try again"
            onPress={() => {
              setError(undefined);
              setAttempt((n) => n + 1);
            }}
          />
        )}
      </View>
    </ReviewFrame>
  );
}
export function ReviewExplanation({
  api,
  gameId,
  ply,
  enabled,
}: {
  api: Api;
  gameId: number;
  ply: number;
  enabled: boolean;
}) {
  const [text, setText] = useState<string | null>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    loadExplanation(api, gameId, ply, true, abort.signal)
      .then((t) => {
        if (!abort.signal.aborted) setText(t);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [api, gameId, ply, enabled, attempt]);
  if (!enabled) return null;
  return (
    <View style={{ gap: 8 }}>
      <Text selectable tone="muted">
        {text ??
          (error
            ? "The engine explanation is unavailable. You can continue the lesson."
            : text === null
              ? "Compare the move you played with the stronger move."
              : "Loading the explanation…")}
      </Text>
      {error && (
        <Button
          label="Retry explanation"
          variant="secondary"
          onPress={() => {
            setError(undefined);
            setText(undefined);
            setAttempt((n) => n + 1);
          }}
        />
      )}
    </View>
  );
}
export function GuidedReview({
  game,
  api,
  scope,
}: {
  game: GameDetail;
  api: Api;
  scope: string;
}) {
  const lesson = useMemo(() => buildReviewLesson(game), [game]);
  const session = useMemo(
    () =>
      new ReviewSession(
        AsyncStorage,
        scope,
        game.id,
        lesson.status === "ready" ? lesson.fingerprint : "blocked",
      ),
    [scope, game.id, lesson],
  );
  const practice = useMemo(
    () =>
      new PracticeSession(
        AsyncStorage,
        scope,
        new Date().toISOString().slice(0, 10),
      ),
    [scope],
  );
  const [loadedSession, setLoadedSession] = useState<ReviewSession>();
  const [, render] = useState(0);
  const [error, setError] = useState<string>();
  const [warning, setWarning] = useState<string>();
  const [advancing, setAdvancing] = useState(false);
  const lock = useRef(false);
  const [lifecycle] = useState(() => new ReviewLifecycle());
  const changed = useCallback(() => render((n) => n + 1), []);
  useEffect(() => {
    const signal = lifecycle.begin();
    lock.current = false;
    session
      .load()
      .catch(() => {
        if (!signal.aborted)
          setWarning(
            "Progress is only available while this review stays open.",
          );
      })
      .then(async () => {
        if (signal.aborted) return;
        if (lesson.status === "ready")
          session.update(restoreReviewSnapshot(session.state, lesson.steps));
        if (
          session.state.pendingFinish &&
          completionConfirmed(game, session.state.pendingFinish)
        ) {
          await session.clear().catch(() => {});
          if (!signal.aborted)
            router.replace({
              pathname: "/games/[id]/done",
              params: { id: String(game.id) },
            });
          return;
        }
        setAdvancing(false);
        setError(undefined);
        setLoadedSession(session);
      });
    return () => lifecycle.end(signal);
  }, [session, game, lifecycle, lesson]);
  if (lesson.status === "replay-only")
    return (
      <ReviewFrame gameId={game.id}>
        <View style={{ padding: 16, gap: 16 }}>
          <Text heading>Replay this game</Text>
          <Text selectable>{lesson.reason}</Text>
          <Button
            label="Open All moves"
            onPress={() =>
              router.replace({
                pathname: "/games/[id]/moves",
                params: { id: String(game.id) },
              })
            }
          />
        </View>
      </ReviewFrame>
    );
  if (loadedSession !== session)
    return (
      <ReviewFrame>
        <Text style={{ padding: 16 }}>Restoring your lesson…</Text>
      </ReviewFrame>
    );
  const steps = lesson.steps;
  const index = replayIndex(session.state.step, Math.max(0, steps.length - 1));
  const step = steps[index];
  async function next() {
    const signal = lifecycle.signal;
    if (lock.current || signal.aborted) return;
    lock.current = true;
    setAdvancing(true);
    setError(undefined);
    try {
      let last = true;
      if (step) {
        const advance = nextReviewStep(steps, index, session.state.marks);
        last = advance.last;
        session.update({
          marks: advance.marks,
          ...(!last ? { step: advance.index } : {}),
        });
      }
      if (!last) {
        await session
          .save()
          .catch(() =>
            setWarning("Progress could not be stored. Keep the review open."),
          );
        changed();
      } else {
        const marks = assembleReviewMarks(steps, session.state.marks);
        await finishReview({
          api,
          session,
          gameId: game.id,
          marks,
          baselineReviewedAt: game.reviewed_at,
          signal,
        });
        if (!signal.aborted)
          router.replace({
            pathname: "/games/[id]/done",
            params: { id: String(game.id), celebrate: "1" },
          });
      }
    } catch (e) {
      if (!signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Could not save the review. Try again.",
        );
    } finally {
      if (signal === lifecycle.signal) {
        lock.current = false;
        if (!signal.aborted) setAdvancing(false);
      }
    }
  }
  const done = index + (step && session.state.marks[step.ply] ? 1 : 0);
  return (
    <ReviewFrame
      done={done}
      total={steps.length}
      gameId={game.id}
      ply={step?.ply}
      busy={advancing}
    >
      {warning && (
        <Text tone="danger" selectable style={{ paddingHorizontal: 16 }}>
          {warning}
        </Text>
      )}
      {step ? (
        <ReviewPosition
          key={step.ply}
          api={api}
          game={game}
          step={step}
          session={session}
          practice={practice}
          onNext={() => void next()}
          onChanged={changed}
          last={index === steps.length - 1}
          finishing={advancing}
          finishError={error}
          explanation={
            <ReviewExplanation
              key={step.ply}
              api={api}
              gameId={game.id}
              ply={step.ply}
              enabled={
                step.type !== "praise" &&
                (step.type === "look" ||
                  !!session.state.positions[step.ply]?.outcome)
              }
            />
          }
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <Text heading>A quiet game</Text>
          <Text>
            No key moments to drill. Browse All moves, or finish your review.
          </Text>
          {error && (
            <Text tone="danger" selectable>
              {error}
            </Text>
          )}
          <Button
            label={advancing ? "Saving…" : "Finish review"}
            disabled={advancing}
            onPress={() => void next()}
          />
        </ScrollView>
      )}
    </ReviewFrame>
  );
}
