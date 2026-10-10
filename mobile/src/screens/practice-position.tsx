import { useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { AccessibilityInfo, Platform, View } from "react-native";
import { HelpDialog } from "@/components/help-dialog";
import { Board } from "@/components/board";
import {
  LessonScreen,
  LessonPrompt,
  LessonBoard,
  LessonBar,
  LessonAction,
} from "@/components/lesson-screen";
import { PromotionChoice } from "@/components/promotion-choice";
import {
  isMoveClassification,
} from "@/components/move-classification";
import {
  PracticeSession,
  practiceHint,
  promotionChoices,
  type Promotion,
} from "@/lib/practice-flow";
import { preparedQuality, practiceFlash } from "@/lib/practice-feedback";
import { checkPracticeAttempt } from "@/lib/practice-attempt";
import { legalTargets } from "@/lib/practice";
import type { Api, DeckToday, DeckCard, DeckAnswer, PracticeFeedback, FeedbackQuality } from "@/lib/api";
export default function PracticePosition({
  api,
  card,
  deck,
  redo,
  onNext,
  practice,
  againLeft,
  previousPosition,
  advancing = false,
}: {
  api: Api;
  card: DeckCard;
  deck: DeckToday;
  redo: boolean;
  onNext: (position: { fen: string; flipped: boolean }) => void;
  practice: PracticeSession;
  againLeft: number;
  previousPosition?: { fen: string; flipped: boolean };
  advancing?: boolean;
}) {
  const attemptSequence = useRef(0);
  const [selected, setSelected] = useState<Square | null>(null);
  const [flipped, setFlipped] = useState(card.color === "black");
  const [fen, setFen] = useState(card.fen_before);
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const [first, setFirst] = useState<DeckAnswer>();
  const [outcome, setOutcome] = useState<string>();
  const [error, setError] = useState<string>();
  const [feedback, setFeedback] = useState(card.feedback);
  const [previewQuality, setPreviewQuality] = useState<FeedbackQuality>();
  const savedHint = practice.hint(card);
  const [hints, setHints] = useState(savedHint?.count ?? 0),
    [hintMove, setHintMove] = useState<string | undefined>(savedHint?.bestMove);
  const guidance = practiceHint(card, hints, hintMove);
  const [promotion, setPromotion] = useState<{
    from: Square;
    to: Square;
    choices: Promotion[];
  } | null>(null);
  const [lastMove, setLastMove] = useState<
    { from: string; to: string } | undefined
  >(
    card.prev_uci
      ? { from: card.prev_uci.slice(0, 2), to: card.prev_uci.slice(2, 4) }
      : undefined,
  );
  const [flash, setFlash] = useState<{
    square: string;
    tone: "right" | "wrong";
    id: number;
  }>();
  const [returning, setReturning] = useState(false);
  const [why, setWhy] = useState<string>();
  // Don't let the original classification appear to grade a new attempt.
  const showPlayedMove =
    !selected && !busy && !returning && !promotion && !outcome &&
    !guidance.showPiece && !guidance.showMove && fen === card.fen_before &&
    /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(card.uci);
  const [started] = useState(() => savedHint?.startedAt ?? Date.now());
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
      setLastMove(
        card.prev_uci
          ? { from: card.prev_uci.slice(0, 2), to: card.prev_uci.slice(2, 4) }
          : undefined,
      );
    }, 750);
    return () => clearTimeout(timer);
  }, [returning, card.fen_before, card.prev_uci]);
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
  useEffect(() => {
    if (feedback || outcome || redo) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function poll() {
      try {
        const result = await api<{ feedback: PracticeFeedback | null }>(
          `/api/deck/feedback/${card.game_id}/${card.ply}`, undefined, abort.signal,
        );
        if (abort.signal.aborted) return;
        if (result.feedback) { setFeedback(result.feedback); return; }
        if (++attempts < 12) timer = setTimeout(() => void poll(), 5000);
      } catch { /* Preparation is optional; live grading still works. */ }
    }
    timer = setTimeout(() => void poll(), 5000);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [api, card.game_id, card.ply, feedback, outcome, redo]);
  function announce(text: string) {
    if (Platform.OS !== "web") AccessibilityInfo.announceForAccessibility(text);
  }
  async function submit(uci: string, after?: string) {
    if (busyRef.current || outcome || returning) return;
    const attempt = ++attemptSequence.current;
    busyRef.current = true;
    setBusy(true);
    setSelected(null);
    setError(undefined);
    setFlash(undefined);
    setPreviewQuality(undefined);
    // Count thinking time at the tap, excluding storage, network and engine waits.
    const seconds = !first ? Math.min(86400, (Date.now() - started) / 1000) : undefined;
    try {
      await checkPracticeAttempt({
        preview: () => {
          if (after) {
            setFen(after);
            setLastMove({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
            const quality = preparedQuality({ ...card, feedback }, uci);
            setPreviewQuality(quality);
            if (quality) setFlash(practiceFlash(attempt, uci, quality !== "wrong"));
          }
        },
        prepare: async () => {
          if (!practice.isCurrentDay())
            throw new Error(
              "A new practice day has started. Return Home and reopen Practice.",
            );
          if (redo) {
            const current = await api<DeckToday>("/api/deck");
            if (
              !current.results.some(
                (r) => r.game_id === card.game_id && r.ply === card.ply,
              )
            )
              throw new Error(
                "This retry is no longer available. Return Home and reopen Practice.",
              );
          }
          if (!redo) await practice.beginAnswer(card, started).catch(() => {});
        },
        request: () => api<DeckAnswer>("/api/deck/answer", {
          game_id: card.game_id,
          ply: card.ply,
          uci,
          hinted: !first && hints > 0,
          redo,
          seconds,
        }),
        settle: async (result) => {
          if (!redo)
            await practice
              .finishAnswer(
                card,
                !result.correct ||
                  hints > 0 ||
                  !!first ||
                  result.rating === null ||
                  uci === "0000",
              )
              .catch(() => {});
        },
        accept: (result) => {
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
            setFlash(practiceFlash(attempt, uci, result.correct));
            if (result.correct) {
              setOutcome(
                !first && hints === 0 && (redo || result.rating !== null)
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
        },
        restore: () => {
          if (!alive.current) return;
          setFen(card.fen_before);
          setPreviewQuality(undefined);
          setFlash(undefined);
          setLastMove(card.prev_uci
            ? { from: card.prev_uci.slice(0, 2), to: card.prev_uci.slice(2, 4) }
            : undefined);
        },
        report: (timing) => {
          if (__DEV__) console.info("Practice attempt timing", timing);
        },
      });
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
    if (busyRef.current || outcome || returning || promotion) return;
    const chess = new Chess(card.fen_before);
    if (selected && legalTargets(card.fen_before, selected).includes(square)) {
      const choices = promotionChoices(card.fen_before, selected, square);
      if (choices.length) {
        setPromotion({ from: selected, to: square, choices });
        setSelected(null);
        return;
      }
      const move = chess.move({ from: selected, to: square });
      void submit(move.from + move.to + (move.promotion ?? ""), chess.fen());
    } else
      setSelected(
        chess.get(square)?.color === chess.turn() && square !== selected
          ? square
          : null,
      );
  }
  async function hint() {
    if (busyRef.current || outcome || returning || !guidance.next) return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const result =
        guidance.next === "tactic"
          ? { best_uci: undefined }
          : hintMove
            ? { best_uci: hintMove }
            : await api<{ best_uci: string }>("/api/deck/hint", {
                game_id: card.game_id,
                ply: card.ply,
              });
      await practice
        .rememberHint(card, hints + 1, result.best_uci, started)
        .catch(() => {});
      if (!alive.current) return;
      setHintMove(result.best_uci);
      setHints((n) => n + 1);
      announce(
        practiceHint(card, hints + 1, result.best_uci).text ?? "Hint shown.",
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
        ? "Good move!"
        : outcome === "helped"
          ? "Found it, with help!"
          : outcome
            ? "You found it!"
            : busy
              ? previewQuality ? (previewQuality === "wrong" ? "Not quite" : "Good move!") : "Checking…"
              : flash?.tone === "wrong"
                ? "Not quite"
                : undefined;
  const detail = outcome
    ? ""
    : guidance.text
      ? guidance.text
      : flash?.tone === "wrong"
        ? "Try again, or use a hint."
        : "";
  return (
    <LessonScreen
      done={done}
      total={Math.max(1, deck.today.total)}
      footer={
        <LessonBar
          feedbackKey={flash?.id}
          reservedHeight={160}
          tone={
            outcome
              ? right
                ? "right"
                : "wrong"
              : flash?.tone === "wrong"
                ? "retry"
                : busy && previewQuality ? "right" : "idle"
          }
          title={promotion ? "Promote your pawn" : title}
          detail={
            promotion
              ? "Choose the piece your pawn becomes."
              : busy ? (previewQuality ? "Saving your attempt…" : "Checking move…") : (error ?? detail)
          }
        >
          {promotion ? (
            <PromotionChoice
              choices={promotion.choices}
              onCancel={() => setPromotion(null)}
              onChoose={(kind) => {
                const chess = new Chess(card.fen_before);
                const move = chess.move({ ...promotion, promotion: kind });
                setPromotion(null);
                void submit(
                  move.from + move.to + (move.promotion ?? ""),
                  chess.fen(),
                );
              }}
            />
          ) : outcome ? (
            <>
              <View style={{ flex: 1 }}>
                <HelpDialog textTrigger label="Why this move?" title={first?.best_san ? `Best move: ${first.best_san}` : "Why this move?"}
                  description={`${why ?? "A stronger move for this position."}\n\nYou played ${card.san} against ${card.opponent ?? "your opponent"}, move ${card.move_number}.${card.win_pct_before === null ? "" : ` Winning chance: ${Math.round(card.win_pct_before)}%.`}\n\n${redo ? `One more go · ${againLeft} remaining. Your schedule is unchanged.` : first?.due ? `Next review: ${first.due}` : "Your first answer is saved."}`} />
              </View>
              <LessonAction label={advancing ? "Next…" : "Continue"} disabled={advancing} danger={!right} onPress={() => onNext({ fen, flipped })} />
            </>
          ) : (
            <>
              <LessonAction
                quiet
                glyph="hint"
                label={guidance.label}
                disabled={!hintReady || busy || returning || !guidance.next}
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
      <LessonBoard ledge={false} prompt={
        <LessonPrompt
          title={`${card.color === "white" ? "White" : "Black"} to move`}
          detail={redo ? "Find the move again." : `Improve on ${card.san}.`}
        />
      }>
        <Board
          fen={fen}
          ledge={false}
          animatePositions
          initialFen={previousPosition?.fen}
          initialFlipped={previousPosition?.flipped}
          selected={selected}
          targets={selected ? legalTargets(card.fen_before, selected) : []}
          flipped={flipped}
          hintMove={!outcome && guidance.showMove ? hintMove : undefined}
          hintSquare={
            !outcome && guidance.showPiece ? hintMove?.slice(0, 2) : undefined
          }
          disabled={busy || !!outcome || returning || !!promotion}
          onSquare={onSquare}
          flash={flash}
          lastMove={lastMove}
          arrows={
            showPlayedMove
              ? [{ from: card.uci.slice(0, 2), to: card.uci.slice(2, 4), tone: "line" }]
              : []
          }
          badge={
            showPlayedMove && isMoveClassification(card.classification)
              ? { square: card.uci.slice(2, 4) as Square, kind: card.classification }
              : null
          }
        />
      </LessonBoard>
    </LessonScreen>
  );
}
