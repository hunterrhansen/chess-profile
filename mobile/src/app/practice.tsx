import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { Chess, type Square } from "chess.js";
import { AccessibilityInfo, Platform, View } from "react-native";
import { Board } from "@/components/board";
import { Text } from "@/components/ui";
import { KnIcon } from "@/components/kn-icon";
import {
  LessonScreen,
  LessonPrompt,
  LessonBoard,
  LessonBar,
  LessonAction,
} from "@/components/lesson-screen";
import { legalTargets } from "@/lib/practice";
import { type DeckToday, type DeckCard, type DeckAnswer } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import SamplePractice from "@/screens/sample-practice";
export default function Practice() {
  const { connected } = useSession();
  return connected ? <DailyPractice /> : <SamplePractice />;
}
function DailyPractice() {
  const { api } = useSession();
  const [deck, setDeck] = useState<DeckToday>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [missed, setMissed] = useState<DeckCard[]>([]);
  const [redoIndex, setRedoIndex] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const { colors } = useTheme();
  useEffect(() => {
    const abort = new AbortController();
    api<DeckToday>("/api/deck", undefined, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setDeck(value);
      })
      .catch((err) => {
        if (!abort.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [api, refresh]);
  const redo = !!deck && !deck.card && redoIndex < missed.length;
  const card = deck?.card ?? (redo ? missed[redoIndex] : null);
  function next(outcome: string) {
    if (redo) setRedoIndex((i) => i + 1);
    else {
      if (card && (outcome === "helped" || outcome === "shown"))
        setMissed((items) => [...items, card]);
      setLoading(true);
      setError(undefined);
      setRefresh((n) => n + 1);
    }
  }
  if (!loading && !error && deck && card)
    return (
      <Position
        key={`${card.game_id}-${card.ply}-${redo ? "redo" : "first"}`}
        card={card}
        deck={deck}
        redo={redo}
        onNext={next}
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
                  : `${deck.today.done} positions reviewed.`}
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

function Position({
  card,
  deck,
  redo,
  onNext,
}: {
  card: DeckCard;
  deck: DeckToday;
  redo: boolean;
  onNext: (outcome: string) => void;
}) {
  const { api } = useSession();
  const [selected, setSelected] = useState<Square | null>(null);
  const [flipped, setFlipped] = useState(card.color === "black");
  const [fen, setFen] = useState(card.fen_before);
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const [first, setFirst] = useState<DeckAnswer>();
  const [outcome, setOutcome] = useState<string>();
  const [error, setError] = useState<string>();
  const [hints, setHints] = useState(0),
    [hintMove, setHintMove] = useState<string>();
  const [lastMove, setLastMove] = useState<{ from: string; to: string }>();
  const [flash, setFlash] = useState<{
    square: string;
    tone: "right" | "wrong";
    id: number;
  }>();
  const [returning, setReturning] = useState(false);
  const [why, setWhy] = useState<string>();
  const [started] = useState(() => Date.now());
  const [hintReady, setHintReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setHintReady(true), 2000);
    return () => clearTimeout(timer);
  }, []);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!returning) return;
    const timer = setTimeout(() => {
      setFen(card.fen_before);
      setReturning(false);
      setLastMove(undefined);
    }, 750);
    return () => clearTimeout(timer);
  }, [returning, card.fen_before]);
  useEffect(() => {
    if (!outcome) return;
    const abort = new AbortController();
    api<{ best: { summary: string | null } | null }>(
      `/api/games/${card.game_id}/lines/${card.ply}`,
      undefined,
      abort.signal,
    )
      .then((lines) => setWhy(lines.best?.summary ?? undefined))
      .catch(() => {});
    return () => abort.abort();
  }, [outcome, api, card.game_id, card.ply]);
  function announce(text: string) {
    if (Platform.OS !== "web") AccessibilityInfo.announceForAccessibility(text);
  }
  async function submit(uci: string, after?: string) {
    if (busyRef.current || outcome || returning) return;
    busyRef.current = true;
    setBusy(true);
    setSelected(null);
    setError(undefined);
    try {
      const result = await api<DeckAnswer>("/api/deck/answer", {
        game_id: card.game_id,
        ply: card.ply,
        uci,
        hinted: !first && hints > 0,
        redo,
        seconds: !first
          ? Math.min(86400, (Date.now() - started) / 1000)
          : undefined,
      });
      if (!alive.current) return;
      if (!first) setFirst(result);
      if (uci === "0000") {
        setOutcome("shown");
        setHintMove(result.best_uci);
        const shown = new Chess(card.fen_before);
        shown.move({
          from: result.best_uci.slice(0, 2),
          to: result.best_uci.slice(2, 4),
          promotion: result.best_uci[4],
        });
        setFen(shown.fen());
        setLastMove({
          from: result.best_uci.slice(0, 2),
          to: result.best_uci.slice(2, 4),
        });
        announce(`The best move is ${result.best_san}.`);
      } else {
        setFen(after!);
        setLastMove({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
        setFlash({
          square: uci.slice(2, 4),
          tone: result.correct ? "right" : "wrong",
          id: Date.now(),
        });
        if (result.correct) {
          setOutcome(
            !first && hints === 0
              ? result.quality === "good"
                ? "good"
                : "found"
              : "helped",
          );
          announce("You found it. Your answer is saved.");
        } else {
          setReturning(true);
          announce("Try another move. The position will reset.");
        }
      }
    } catch (err) {
      if (alive.current)
        setError(
          err instanceof Error
            ? err.message
            : "Couldn't check the move. Try again.",
        );
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function onSquare(square: Square) {
    if (busyRef.current || outcome || returning) return;
    const chess = new Chess(card.fen_before);
    if (selected && legalTargets(card.fen_before, selected).includes(square)) {
      const move = chess.move({ from: selected, to: square, promotion: "q" });
      void submit(move.from + move.to + (move.promotion ?? ""), chess.fen());
    } else
      setSelected(
        chess.get(square)?.color === chess.turn() && square !== selected
          ? square
          : null,
      );
  }
  async function hint() {
    if (busyRef.current || outcome || returning || hints >= 2) return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const result = hintMove
        ? { best_uci: hintMove }
        : await api<{ best_uci: string }>("/api/deck/hint", {
            game_id: card.game_id,
            ply: card.ply,
          });
      if (!alive.current) return;
      setHintMove(result.best_uci);
      setHints((n) => n + 1);
      announce(
        hints === 0
          ? `Look at the piece on ${result.best_uci.slice(0, 2)}.`
          : `Try ${result.best_uci.slice(0, 2)} to ${result.best_uci.slice(2, 4)}.`,
      );
    } catch (err) {
      if (alive.current)
        setError(err instanceof Error ? err.message : "Couldn't get a hint.");
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const done = deck.today.done + (!redo && first ? 1 : 0);
  const right = !!outcome && outcome !== "shown";
  const title =
    outcome === "shown"
      ? `The move was ${first?.best_san ?? "…"}`
      : outcome === "good"
        ? `Good move! Best was ${first?.best_san ?? "…"}`
        : outcome === "helped"
          ? "Found it, with help!"
          : outcome
            ? "You found it!"
            : busy
              ? "Checking…"
              : flash?.tone === "wrong"
                ? "Not quite"
                : undefined;
  const detail = outcome
    ? (why ??
      (outcome === "shown"
        ? "Try this position again at the end of the session."
        : "A stronger move for this position."))
    : hints >= 2 && hintMove
      ? "The arrow shows the move. Play it."
      : hints > 0 && hintMove
        ? `Look at the piece on ${hintMove.slice(0, 2)}.`
        : flash?.tone === "wrong"
          ? "Try again, or use a hint."
          : selected
            ? "Now pick where it goes."
            : "Tap a piece, then where it goes.";
  return (
    <LessonScreen
      done={done}
      total={Math.max(1, deck.today.total)}
      footer={
        <LessonBar
          tone={
            outcome
              ? right
                ? "right"
                : "wrong"
              : flash?.tone === "wrong"
                ? "retry"
                : "idle"
          }
          title={title}
          detail={error ?? detail}
          note={
            redo
              ? "One more go · Your schedule is unchanged"
              : outcome && first
                ? first.due
                  ? `Next review: ${first.due}`
                  : "Your first answer is saved."
                : undefined
          }
        >
          {outcome ? (
            <LessonAction
              label="Continue"
              danger={!right}
              onPress={() => onNext(outcome)}
            />
          ) : (
            <>
              <LessonAction
                quiet
                glyph="hint"
                label={
                  hints === 0
                    ? "Hint"
                    : hints === 1
                      ? "Show move"
                      : "Hint shown"
                }
                disabled={!hintReady || busy || returning || hints >= 2}
                onPress={() => void hint()}
              />
              <LessonAction
                quiet
                label="Show me"
                disabled={busy || returning}
                onPress={() => void submit("0000")}
              />
              <LessonAction
                quiet
                label="Flip"
                onPress={() => setFlipped((value) => !value)}
              />
            </>
          )}
        </LessonBar>
      }
    >
      <LessonPrompt
        tag={`${redo ? "ONE MORE GO" : card.reviews === 0 ? "NEW" : "REVIEW"} · vs ${card.opponent ?? "opponent"} · move ${card.move_number}`}
        title={`You played ${card.san} here. Find a better move.`}
        detail={`${card.color === "white" ? "White" : "Black"} to move${card.win_pct_before === null ? "" : ` · Winning chance was ${Math.round(card.win_pct_before)}%`}`}
      />
      <LessonBoard>
        <Board
          fen={fen}
          selected={selected}
          targets={selected ? legalTargets(card.fen_before, selected) : []}
          flipped={flipped}
          hintMove={!outcome && hints >= 2 ? hintMove : undefined}
          hintSquare={!outcome && hints > 0 ? hintMove?.slice(0, 2) : undefined}
          disabled={busy || !!outcome || returning}
          onSquare={onSquare}
          flash={flash}
          lastMove={lastMove}
        />
      </LessonBoard>
    </LessonScreen>
  );
}
