import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { Chess, type Square } from "chess.js";
import {
  AccessibilityInfo,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Board } from "../components/board";
import { HelpDialog } from "../components/help-dialog";
import { Button, Text, Card, Progress } from "../components/ui";
import { legalTargets } from "../lib/practice";
import { type DeckToday, type DeckCard, type DeckAnswer } from "../lib/api";
import { useSession } from "../lib/session";
import { useTheme } from "../lib/theme";
import SamplePractice from "../screens/sample-practice";
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
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <View style={styles.header}>
            <Button
              label="Home"
              variant="secondary"
              onPress={() => router.replace("/")}
            />
            <HelpDialog />
          </View>
          {loading ? (
            <Text>Loading your practice…</Text>
          ) : error ? (
            <Card>
              <Text tone="danger" accessibilityRole="alert">
                {error}
              </Text>
              <Button
                label="Try again"
                onPress={() => {
                  setLoading(true);
                  setError(undefined);
                  setRefresh((n) => n + 1);
                }}
              />
            </Card>
          ) : deck && card ? (
            <Position
              key={`${card.game_id}-${card.ply}-${redo ? "redo" : "first"}`}
              card={card}
              deck={deck}
              redo={redo}
              onNext={next}
            />
          ) : (
            deck && (
              <>
                <Text heading accessibilityRole="header" style={styles.title}>
                  {deck.total === 0 ? "No positions yet" : "Done for today"}
                </Text>
                <Text tone="muted">
                  {deck.total === 0
                    ? "Your practice positions come from analysed games. Import and analyse games in Knightly on the web, then come back."
                    : `${deck.today.done} positions reviewed. Your next review dates are saved to your Knightly account.`}
                </Text>
                {deck.results.map((result, index) => (
                  <Card key={`${result.game_id}-${result.ply}`}>
                    <Text>
                      Position {index + 1} · {result.san} ·{" "}
                      {result.opponent ?? "opponent"}
                    </Text>
                    <Text tone="muted">
                      {result.mark === "found"
                        ? "Found"
                        : result.mark === "helped"
                          ? "With help"
                          : result.mark === "good"
                            ? "Good move"
                            : "Shown"}
                    </Text>
                  </Card>
                ))}
                <Text>
                  {deck.mastered} mastered · {deck.learning} learning ·{" "}
                  {deck.new} new
                </Text>
              </>
            )
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
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
  return (
    <>
      <Text tone="muted">
        {redo
          ? "One more go · Ungraded"
          : `${done} of ${deck.today.total} today`}
      </Text>
      <Progress value={done} total={Math.max(1, deck.today.total)} />
      <Text heading accessibilityRole="header" style={styles.title}>
        You played {card.san} here. Find a better move.
      </Text>
      <Text tone="muted">
        {card.color === "white" ? "White" : "Black"} to move · vs{" "}
        {card.opponent ?? "opponent"} · move {card.move_number}
      </Text>
      <Board
        edgeInset={20}
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
      {error && (
        <Text tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      )}
      <View style={styles.actions}>
        <View style={styles.grow}>
          <Button
            label={
              hints === 0
                ? "Hint"
                : hints === 1
                  ? "Show the move"
                  : "Hint shown"
            }
            variant="secondary"
            disabled={busy || !!outcome || returning || hints >= 2}
            onPress={hint}
          />
        </View>
        <View style={styles.grow}>
          <Button
            label="Flip board"
            variant="secondary"
            onPress={() => setFlipped((value) => !value)}
          />
        </View>
      </View>
      <Card>
        <Text heading style={{ fontSize: 22 }}>
          {outcome === "shown"
            ? "Here's the move"
            : outcome
              ? "You found it!"
              : busy
                ? "Checking…"
                : flash?.tone === "wrong"
                  ? "Try another move"
                  : "Your move"}
        </Text>
        <Text tone="muted">
          {outcome
            ? (why ??
              (outcome === "shown"
                ? `Best move: ${first?.best_san}. Try this position again at the end of the session.`
                : "A stronger move for this position."))
            : hints >= 2 && hintMove
              ? `Try ${hintMove.slice(0, 2)} → ${hintMove.slice(2, 4)}.`
              : hints > 0 && hintMove
                ? `Look at the piece on ${hintMove.slice(0, 2)}.`
                : "Tap a piece to see its legal moves."}
        </Text>
        {outcome && first && (
          <Text tone="muted">
            {redo
              ? "For learning; your schedule is unchanged."
              : first.due
                ? `Next review: ${first.due}`
                : "Your first answer is saved."}
          </Text>
        )}
      </Card>
      {outcome ? (
        <Button label="Next position" onPress={() => onNext(outcome)} />
      ) : (
        <Button
          label="Show me"
          variant="secondary"
          disabled={busy || returning}
          onPress={() => void submit("0000")}
        />
      )}
    </>
  );
}
const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: 20, alignItems: "center" },
  column: { width: "100%", maxWidth: 440, gap: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 29, lineHeight: 36 },
  actions: { flexDirection: "row", gap: 12, alignItems: "center" },
  grow: { flex: 1 },
});
