import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Chess, type Square } from "chess.js";
import { View, AccessibilityInfo, Platform } from "react-native";
import { Board } from "@/components/board";
import { Text } from "@/components/ui";
import {
  LessonScreen,
  LessonPrompt,
  LessonBoard,
  LessonBar,
  LessonAction,
} from "@/components/lesson-screen";
import { exercises, legalTargets, evaluateMove } from "@/lib/practice";
import { PromotionChoice } from "@/components/promotion-choice";
import { promotionChoices, type Promotion } from "@/lib/practice-flow";
import { KnIcon } from "@/components/kn-icon";
export default function PracticePreview() {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Square | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [hints, setHints] = useState(0);
  const [promotion, setPromotion] = useState<{
    from: Square;
    to: Square;
    choices: Promotion[];
  } | null>(null);
  const hint = hints > 0;
  const [hintReady, setHintReady] = useState(false);
  const [shown, setShown] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [done, setDone] = useState(false);
  const exercise = exercises[index];
  useEffect(() => {
    const timer = setTimeout(() => setHintReady(true), 2000);
    return () => clearTimeout(timer);
  }, [index]);
  const [flash, setFlash] = useState<{
    square: string;
    tone: "right" | "wrong";
    id: number;
  }>();
  const [lastMove, setLastMove] = useState<{ from: string; to: string }>();
  const [returning, setReturning] = useState(false);
  const [playedFen, setPlayedFen] = useState<string | null>(null);
  useEffect(() => {
    if (!returning) return;
    const timer = setTimeout(() => {
      setPlayedFen(null);
      setReturning(false);
      setLastMove(undefined);
    }, 750);
    return () => clearTimeout(timer);
  }, [returning]);
  const targets =
    selected && !correct ? legalTargets(exercise.fen, selected) : [];
  const reset = (next = 0) => {
    setIndex(next);
    setHintReady(false);
    setSelected(null);
    setHints(0);
    setPromotion(null);
    setShown(false);
    setCorrect(false);
    setWrong(false);
    setPlayedFen(null);
    setFlash(undefined);
    setLastMove(undefined);
    setReturning(false);
    setDone(false);
  };
  function onSquare(square: Square) {
    if (correct || shown || returning || promotion) return;
    const chess = new Chess(exercise.fen);
    const piece = chess.get(square);
    if (piece?.color === chess.turn()) {
      setSelected(selected === square ? null : square);
      setWrong(false);
      return;
    }
    if (!selected || !targets.includes(square)) return;
    const choices = promotionChoices(exercise.fen, selected, square);
    if (choices.length) {
      setPromotion({ from: selected, to: square, choices });
      setSelected(null);
      return;
    }
    answerMove(selected, square);
  }
  function answerMove(from: Square, square: Square, piece: Promotion = "q") {
    const answer = evaluateMove(exercise, from, square, piece);
    setSelected(null);
    setWrong(!answer.correct);
    if (Platform.OS !== "web")
      AccessibilityInfo.announceForAccessibility(
        answer.correct
          ? "You found checkmate."
          : "Try another move. The position will reset.",
      );
    setFlash({
      square,
      tone: answer.correct ? "right" : "wrong",
      id: Date.now(),
    });
    setLastMove({ from, to: square });
    setPlayedFen(answer.fen);
    if (!answer.correct) setReturning(true);
    if (answer.correct) {
      setCorrect(true);
      setPlayedFen(answer.fen);
    }
  }
  const answered = correct || shown;
  function next() {
    if (index === exercises.length - 1) setDone(true);
    else reset(index + 1);
  }
  function showMove() {
    const chess = new Chess(exercise.fen);
    const from = exercise.solution.slice(0, 2),
      to = exercise.solution.slice(2, 4);
    chess.move({ from, to, promotion: exercise.solution[4] });
    setPlayedFen(chess.fen());
    setLastMove({ from, to });
    setShown(true);
    setWrong(false);
  }
  const footer = done ? (
    <LessonBar detail="Sample positions · Your review progress is unchanged">
      <LessonAction quiet label="Practice again" onPress={() => reset()} />
      <LessonAction label="Back home" onPress={() => router.dismissTo("/")} />
    </LessonBar>
  ) : (
    <LessonBar
      tone={correct ? "right" : shown ? "wrong" : wrong ? "retry" : "idle"}
      title={
        promotion
          ? "Promote your pawn"
          : correct
            ? hint
              ? "Found it, with help!"
              : "You found it!"
            : shown
              ? "Here's the move"
              : wrong
                ? "Not quite"
                : undefined
      }
      detail={
        promotion
          ? "Choose the piece your pawn becomes."
          : answered
            ? exercise.explanation
            : wrong
              ? "Try again, or use a hint."
              : hint
                ? hints === 1
                  ? exercise.hint
                  : hints === 2
                    ? `Look at the piece on ${exercise.solution.slice(0, 2)}.`
                    : "The arrow shows the move. Play it."
                : selected
                  ? `${selected} selected. Tap a highlighted square.`
                  : "Tap a piece, then where it goes."
      }
      note="Sample positions · Your review progress is unchanged"
    >
      {promotion ? (
        <PromotionChoice
          choices={promotion.choices}
          onCancel={() => setPromotion(null)}
          onChoose={(kind) => {
            answerMove(promotion.from, promotion.to, kind);
            setPromotion(null);
          }}
        />
      ) : answered ? (
        <LessonAction label="Continue" danger={shown} onPress={next} />
      ) : (
        <>
          <LessonAction
            quiet
            glyph="hint"
            label={
              hints === 0
                ? "Hint"
                : hints === 1
                  ? "Show piece"
                  : hints === 2
                    ? "Show move"
                    : "Hint shown"
            }
            disabled={!hintReady || hints >= 3 || returning}
            onPress={() => {
              setHints((n) => n + 1);
              setWrong(false);
            }}
          />
          <LessonAction
            quiet
            label="Show me"
            disabled={returning}
            onPress={showMove}
          />
          <LessonAction
            quiet
            label="Flip"
            onPress={() => setFlipped(!flipped)}
          />
        </>
      )}
    </LessonBar>
  );
  return (
    <LessonScreen
      title="Sample practice"
      done={done ? exercises.length : index + (answered ? 1 : 0)}
      total={exercises.length}
      footer={footer}
    >
      {done ? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            gap: 16,
          }}
        >
          <KnIcon glyph="check" size={64} />
          <Text heading style={{ fontSize: 28, lineHeight: 34 }}>
            Nicely done.
          </Text>
          <Text tone="muted" style={{ textAlign: "center" }}>
            Three ideas to take into your next game.
          </Text>
        </View>
      ) : (
        <>
          <LessonPrompt
            tag="SAMPLE POSITION"
            title={exercise.title}
            detail="White to move · Find checkmate in one."
          />
          <LessonBoard>
            <Board
              key={index}
              flash={flash}
              lastMove={lastMove}
              fen={playedFen ?? exercise.fen}
              selected={selected}
              targets={targets}
              flipped={flipped}
              hintSquare={
                hints === 2 && !answered
                  ? exercise.solution.slice(0, 2)
                  : undefined
              }
              hintMove={hints >= 3 && !answered ? exercise.solution : undefined}
              disabled={answered || returning || !!promotion}
              onSquare={onSquare}
            />
          </LessonBoard>
        </>
      )}
    </LessonScreen>
  );
}
