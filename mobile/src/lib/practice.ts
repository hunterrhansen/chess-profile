import { Chess, type Square } from "chess.js";
// Deliberately local fixtures: this UI experiment never changes a real review schedule.
export const exercises = [
  {
    fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
    solution: "e1e8",
    title: "Finish the game",
    hint: "Their pawns leave the king trapped on the back rank.",
    explanation: "Re8# seals the back rank. The king has no safe square.",
  },
  {
    fen: "7k/6pp/8/8/8/8/5PPP/R5K1 w - - 0 1",
    solution: "a1a8",
    title: "One more back-rank mate",
    hint: "Look for a rook move that controls the eighth rank.",
    explanation: "Ra8# controls every escape square on the back rank.",
  },
] as const;
export type Exercise = (typeof exercises)[number];
export function legalTargets(fen: string, from: Square): Square[] {
  return [
    ...new Set(
      new Chess(fen).moves({ square: from, verbose: true }).map((m) => m.to),
    ),
  ];
}
export function evaluateMove(
  exercise: Exercise,
  from: Square,
  to: Square,
  promotion = "q",
) {
  const chess = new Chess(exercise.fen);
  try {
    const move = chess.move({ from, to, promotion });
    const uci = move.from + move.to + (move.promotion ?? "");
    return {
      legal: true,
      correct: uci === exercise.solution,
      fen: chess.fen(),
      san: move.san,
    };
  } catch {
    return { legal: false, correct: false, fen: exercise.fen, san: null };
  }
}
export function boardSquares(flipped: boolean): Square[] {
  const squares = Array.from(
    { length: 64 },
    (_, i) => `${"abcdefgh"[i % 8]}${8 - Math.floor(i / 8)}` as Square,
  );
  return flipped ? squares.reverse() : squares;
}
