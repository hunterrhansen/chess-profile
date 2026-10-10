import { useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { AccessibilityInfo, Platform } from "react-native";
import { Board } from "@/components/board";
import {
  LessonScreen,
  LessonPrompt,
  LessonBoard,
  LessonBar,
  LessonAction,
} from "@/components/lesson-screen";
import { PromotionChoice } from "@/components/promotion-choice";
import { MoveClassification } from "@/components/move-classification";
import {
  PracticeSession,
  practiceHint,
  promotionChoices,
  type Promotion,
} from "@/lib/practice-flow";
import { legalTargets } from "@/lib/practice";
import type { Api, DeckToday, DeckCard, DeckAnswer } from "@/lib/api";
export default function PracticePosition({
  api,
  card,
  deck,
  redo,
  onNext,
  practice,
  againLeft,
}: {
  api: Api;
  card: DeckCard;
  deck: DeckToday;
  redo: boolean;
  onNext: () => void;
  practice: PracticeSession;
  againLeft: number;
}) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [flipped, setFlipped] = useState(card.color === "black");
  const [fen, setFen] = useState(card.fen_before);
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const [first, setFirst] = useState<DeckAnswer>();
  const [outcome, setOutcome] = useState<string>();
  const [error, setError] = useState<string>();
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
    : guidance.text
      ? guidance.text
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
          title={promotion ? "Promote your pawn" : title}
          detail={
            promotion
              ? "Choose the piece your pawn becomes."
              : (error ?? detail)
          }
          note={
            redo
              ? `One more go · ${againLeft} remaining · Your schedule is unchanged`
              : outcome && first
                ? first.due
                  ? `Next review: ${first.due}`
                  : "Your first answer is saved."
                : undefined
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
            <LessonAction label="Continue" danger={!right} onPress={onNext} />
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
      <LessonPrompt
        tag={`${redo ? "ONE MORE GO" : card.reviews === 0 ? "NEW" : "REVIEW"} · vs ${card.opponent ?? "opponent"} · move ${card.move_number}`}
        badge={<MoveClassification kind={card.classification} />}
        title={
          redo
            ? "You missed this one earlier. Find the move again."
            : `You played ${card.san} here. Find a better move.`
        }
        detail={`${card.color === "white" ? "White" : "Black"} to move${card.win_pct_before === null ? "" : ` · Winning chance was ${Math.round(card.win_pct_before)}%`}`}
      />
      <LessonBoard>
        <Board
          fen={fen}
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
        />
      </LessonBoard>
    </LessonScreen>
  );
}
