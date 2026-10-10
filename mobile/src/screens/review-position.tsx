import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Platform,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { Chess, type Square } from "chess.js";
import { Board } from "@/components/board";
import { BoardSizeContext } from "@/components/board-size";
import {
  LessonPrompt,
  LessonBar,
  LessonAction,
} from "@/components/lesson-screen";
import { Text, Button } from "@/components/ui";
import { ReviewAttempt } from "@/lib/review-attempt";
import { legalTargets } from "@/lib/practice";
import {
  promotionChoices,
  practiceHint,
  type PracticeSession,
  type Promotion,
} from "@/lib/practice-flow";
import type { Api, DeckCard } from "@/lib/api";
import type { GameDetail } from "@/lib/game-replay";
import type { LessonStep } from "@/lib/review-lesson";
import type { ReviewSession } from "@/lib/review-session";
export default function ReviewPosition({
  api,
  game,
  step,
  session,
  practice,
  onNext,
  onChanged,
  last,
  finishing,
  finishError,
  explanation,
}: {
  api: Api;
  game: GameDetail;
  step: LessonStep;
  session: ReviewSession;
  practice: PracticeSession;
  onNext: () => void;
  onChanged: () => void;
  last: boolean;
  finishing: boolean;
  finishError?: string;
  explanation?: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const [, render] = useState(0);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{
    from: Square;
    to: Square;
    choices: Promotion[];
  } | null>(null);
  const [hintReady, setHintReady] = useState(false);
  const move = game.plies[step.ply - 1];
  const card = useMemo<DeckCard>(
    () => ({
      game_id: game.id,
      ply: step.ply,
      pattern: move.pattern,
      reviews: 0,
      fen_before: step.fenBefore,
      color: move.color,
      san: move.san,
      uci: move.uci,
      move_number: new Chess(step.fenBefore).moveNumber(),
      classification: step.kind,
      opponent: game.color === "white" ? game.black : game.white,
      played_at: game.played_at ?? "",
      win_pct_before: move.win_pct_before,
      prev_uci: game.plies[step.ply - 2]?.uci ?? null,
    }),
    [game, step, move],
  );
  const runner = useMemo(
    () =>
      new ReviewAttempt({
        api,
        session,
        ply: step.ply,
        fen: step.fenBefore,
        gameId: game.id,
        practice,
        card,
      }),
    [api, session, step, game.id, practice, card],
  );
  useEffect(() => {
    const unsub = runner.subscribe(() => {
      render((n) => n + 1);
      onChanged();
    });
    return () => {
      unsub();
      runner.dispose();
    };
  }, [runner, onChanged]);
  useFocusEffect(
    useCallback(() => {
      void runner.refresh();
    }, [runner]),
  );
  useEffect(() => {
    const timer = setTimeout(() => setHintReady(true), 2000);
    return () => clearTimeout(timer);
  }, []);
  const p = runner.progress;
  const answered = step.type !== "find" || !!p.outcome;
  const guidance = practiceHint(
    {
      ...card,
      classification: step.short.startsWith("Missed")
        ? "miss"
        : card.classification,
    },
    p.hints,
    p.hintMove,
  );
  const fen = useMemo(() => {
    if (step.type !== "find") return step.fenAfter;
    const chess = new Chess(step.fenBefore);
    if (p.played)
      chess.move({
        from: p.played.slice(0, 2),
        to: p.played.slice(2, 4),
        promotion: p.played[4],
      });
    return chess.fen();
  }, [step, p.played]);
  useEffect(() => {
    if (p.outcome && Platform.OS !== "web")
      AccessibilityInfo.announceForAccessibility(
        p.outcome === "missed"
          ? "The answer is shown."
          : "Your answer is saved.",
      );
  }, [p.outcome]);
  const disabled =
    step.type !== "find" ||
    runner.busy ||
    !runner.ready ||
    !!p.outcome ||
    !!p.needsRestart ||
    !!promotion;
  function play(from: Square, to: Square) {
    if (disabled) return false;
    const choices = promotionChoices(step.fenBefore, from, to);
    if (choices.length) {
      setPromotion({ from, to, choices });
      setSelected(null);
      return false;
    }
    try {
      const m = new Chess(step.fenBefore).move({ from, to });
      setSelected(null);
      void runner.submit(m.from + m.to);
    } catch {
      /* Illegal moves are never submitted. */
    }
    return false;
  }
  function tap(square: Square) {
    if (disabled) return;
    if (selected && legalTargets(step.fenBefore, selected).includes(square)) {
      play(selected, square);
      return;
    }
    const chess = new Chess(step.fenBefore);
    setSelected(
      chess.get(square)?.color === chess.turn() && square !== selected
        ? square
        : null,
    );
  }
  const title =
    step.type === "praise"
      ? step.short
      : step.type === "look"
        ? `You played ${move.san}.`
        : p.outcome
          ? "Key moment reviewed"
          : step.short.startsWith("Missed")
            ? "Punish their mistake"
            : "Find a better move";
  const verdict =
    p.outcome === "found"
      ? "Found it"
      : p.outcome === "good"
        ? "Good move"
        : p.outcome === "helped"
          ? "Found it, with help"
          : p.outcome === "missed"
            ? `The move was ${p.first?.best_san ?? move.best_san}`
            : step.type === "praise"
              ? "Great move"
              : step.type === "look"
                ? "What happened"
                : p.hadAttempt
                  ? "Try again"
                  : "Your move";
  return (
    <>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 16,
          gap: 12,
        }}
      >
        <LessonPrompt
          tag={step.label}
          title={title}
          detail={
            step.type === "find"
              ? `${move.color === "white" ? "White" : "Black"} to move · Improve on ${move.san}.`
              : step.headline
          }
        />
        <BoardSizeContext.Provider value={width}>
          <Board
            fen={fen}
            selected={selected}
            targets={selected ? legalTargets(step.fenBefore, selected) : []}
            flipped={game.color === "black"}
            disabled={disabled}
            onSquare={tap}
            onMove={play}
            movable={move.color === "white" ? "w" : "b"}
            edgeInset={16}
            ledge={false}
            animatePositions
            lastMove={
              p.played
                ? { from: p.played.slice(0, 2), to: p.played.slice(2, 4) }
                : step.type === "find"
                  ? undefined
                  : { from: move.uci.slice(0, 2), to: move.uci.slice(2, 4) }
            }
            hintMove={
              p.outcome === "missed"
                ? p.played
                : guidance.showMove
                  ? p.hintMove
                  : undefined
            }
            hintSquare={
              !answered && guidance.showPiece
                ? p.hintMove?.slice(0, 2)
                : undefined
            }
            promotion={
              promotion
                ? {
                    ...promotion,
                    onCancel: () => setPromotion(null),
                    onChoose: (kind) => {
                      const m = new Chess(step.fenBefore).move({
                        from: promotion.from,
                        to: promotion.to,
                        promotion: kind,
                      });
                      setPromotion(null);
                      void runner.submit(m.from + m.to + kind);
                    },
                  }
                : undefined
            }
          />
        </BoardSizeContext.Provider>
        {answered && explanation}
        {runner.warning && (
          <Text tone="danger" selectable accessibilityRole="alert">
            {runner.warning}
          </Text>
        )}
      </ScrollView>
      <LessonBar
        tone={
          p.outcome === "missed"
            ? "wrong"
            : p.outcome
              ? "right"
              : p.hadAttempt
                ? "retry"
                : "idle"
        }
        title={verdict}
        detail={
          finishError ??
          runner.error ??
          (runner.busy
            ? "Checking…"
            : p.needsRestart
              ? "A new review day has started. Restart this position to continue."
              : p.outcome
                ? p.first?.due
                  ? `Next practice: ${p.first.due}`
                  : "Your answer is saved."
                : step.type === "praise"
                  ? step.headline
                  : step.type === "look"
                    ? "This moment is for study, not a graded question."
                    : (guidance.text ??
                      "Tap a piece and its destination, or drag it."))
        }
        note={
          !answered
            ? "Your first answer today affects when this position comes back."
            : undefined
        }
        primary={
          answered ? (
            <LessonAction
              label={
                finishing ? "Saving…" : last ? "Finish review" : "Continue"
              }
              disabled={finishing}
              onPress={onNext}
            />
          ) : p.needsRestart ? (
            <LessonAction
              label="Restart position"
              disabled={runner.busy}
              onPress={() => void runner.restart()}
            />
          ) : (
            <LessonAction
              quiet
              label="Show me"
              disabled={disabled}
              onPress={() => void runner.submit("0000")}
            />
          )
        }
        secondary={
          !answered && !p.needsRestart ? (
            <LessonAction
              quiet
              label={
                !runner.ready
                  ? "Retry loading"
                  : p.pendingHint
                    ? "Retry hint"
                    : guidance.label
              }
              disabled={
                runner.busy ||
                !!promotion ||
                (!hintReady && runner.ready) ||
                (!guidance.next && !p.pendingHint && runner.ready)
              }
              onPress={() => {
                if (!runner.ready) void runner.refresh();
                else if (p.pendingHint || guidance.next)
                  void runner.hint(p.pendingHint ?? guidance.next!);
              }}
            />
          ) : undefined
        }
        explanation={
          runner.error && !runner.ready ? (
            <Button
              variant="secondary"
              label="Try again"
              onPress={() => void runner.refresh()}
            />
          ) : undefined
        }
      />
    </>
  );
}
