import { useEffect, useState } from "react";
import { Chess, type Square } from "chess.js";
import { AccessibilityInfo, Platform } from "react-native";
import { HelpDialog } from "@/components/help-dialog";
import { Board } from "@/components/board";
import {
  LessonScreen,
  LessonPrompt,
  LessonBoard,
  LessonBar,
  LessonAction,
} from "@/components/lesson-screen";
import { exercises, legalTargets, evaluateMove } from "@/lib/practice";
import { promotionChoices, type Promotion } from "@/lib/practice-flow";
import { useVerdictHaptics } from "@/lib/board-haptics";
import PracticeComplete from "@/screens/practice-complete";
import { sampleCompletionMark, type CompletionResult } from "@/lib/practice-completion";
export default function PracticePreview() {
  const acknowledge = useVerdictHaptics();
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<CompletionResult[]>([]);
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
  const [hadWrong, setHadWrong] = useState(false);
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
    setHadWrong(false);
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
    const cue = {
      square,
      tone: answer.correct ? "right" as const : "wrong" as const,
      id: Date.now(),
    };
    acknowledge(cue);
    setFlash(cue);
    setSelected(null);
    setWrong(!answer.correct);
    if (Platform.OS !== "web")
      AccessibilityInfo.announceForAccessibility(
        answer.correct
          ? "You found checkmate."
          : "Try another move. The position will reset.",
      );
    setLastMove({ from, to: square });
    setPlayedFen(answer.fen);
    if (!answer.correct) {
      setReturning(true);
      setHadWrong(true);
    }
    if (answer.correct) {
      setCorrect(true);
      setPlayedFen(answer.fen);
    }
  }
  const answered = correct || shown;
  function next() {
    const solution = new Chess(exercise.fen).move({
      from: exercise.solution.slice(0, 2),
      to: exercise.solution.slice(2, 4),
      promotion: exercise.solution[4],
    });
    setResults((previous) => [...previous, {
      mark: sampleCompletionMark(shown, hint, hadWrong),
      name: `Position ${index + 1}`,
      ply: 1,
      san: solution.san,
      opponent: null,
    }]);
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
  const footer = (
    <LessonBar
      feedbackKey={flash?.id}
      tone={correct ? "right" : shown ? "wrong" : wrong ? "retry" : "idle"}
      title={
        correct
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
        answered
            ? ""
            : wrong
              ? "Try again, or use a hint."
              : hint
                ? hints === 1
                  ? exercise.hint
                  : hints === 2
                    ? `Look at the piece on ${exercise.solution.slice(0, 2)}.`
                    : "The arrow shows the move. Play it."
                : ""
      }
      secondary={answered ? (
        <HelpDialog textTrigger label="Why this move?" title="The idea" description={exercise.explanation} />
      ) : (
        <LessonAction quiet glyph="hint" label={hints === 0 ? "Hint" : hints === 1 ? "Show piece" : hints === 2 ? "Show move" : "Hint shown"}
          disabled={!!promotion || !hintReady || hints >= 3 || returning}
          onPress={() => { setHints((n) => n + 1); setWrong(false); }} />
      )}
      primary={answered ? (
        <LessonAction label="Continue" danger={shown} onPress={next} />
      ) : (
        <LessonAction quiet label="Show me" disabled={!!promotion || returning} onPress={showMove} />
      )}
    />
  );
  if (done) return (
    <PracticeComplete
      done={exercises.length}
      results={results}
      onRestart={() => {
        setResults([]);
        reset();
      }}
    />
  );
  return (
    <LessonScreen
      title="Sample practice"
      done={index + (answered ? 1 : 0)}
      total={exercises.length}
      onFlip={() => setFlipped(!flipped)}
      flipDisabled={!!promotion}
      footer={footer}
    >
      <>
          <LessonBoard ledge={false} prompt={
            <LessonPrompt title="White to move" detail="Find checkmate." />
          }>
            <Board
              promotion={promotion ? {
                ...promotion,
                onCancel: () => setPromotion(null),
                onChoose: (kind) => {
                  answerMove(promotion.from, promotion.to, kind);
                  setPromotion(null);
                },
              } : undefined}
              ledge={false}
          animatePositions
              verdictHaptics={false}
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
    </LessonScreen>
  );
}
