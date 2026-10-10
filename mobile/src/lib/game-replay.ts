import { Chess, type Square } from "chess.js";

export type ReplayMove = { ply: number; san: string; label: string; color: "white" | "black" };
export type ReplayPosition = { fen: string; lastMove: { from: Square; to: Square } | null };

/** SAN is available even before analysis. Never reconstruct from analysed plies. */
export function replayGame(game: { start_fen?: string | null; san: string[] }) {
  let chess: Chess;
  try {
    chess = new Chess(game.start_fen ?? undefined);
  } catch {
    throw new Error("This game's starting position could not be read.");
  }
  const positions: ReplayPosition[] = [{ fen: chess.fen(), lastMove: null }];
  const moves: ReplayMove[] = [];
  let error: string | null = null;
  for (const san of game.san) {
    const number = chess.moveNumber();
    try {
      const move = chess.move(san);
      moves.push({ ply: moves.length + 1, san: move.san,
        label: `${number}${move.color === "w" ? ". " : "… "}${move.san}`,
        color: move.color === "w" ? "white" : "black" });
      positions.push({ fen: chess.fen(), lastMove: { from: move.from, to: move.to } });
    } catch {
      error = `Couldn’t replay half-move ${moves.length + 1} (${san}). Showing the last valid position.`;
      break;
    }
  }
  return { positions, moves, error };
}

export function replayIndex(index: number, last: number) {
  return Number.isFinite(index) ? Math.max(0, Math.min(last, Math.trunc(index))) : 0;
}

export type StepMark = 'found' | 'good' | 'helped' | 'missed' | 'praise' | 'seen';
export type Classification = 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'miss';
export type ReviewMove = {
  ply: number; san: string; uci: string; color: 'white' | 'black'; is_user: number | null;
  classification: Classification | null; best_san: string | null; best_uci: string | null;
  win_pct_before: number | null; win_pct_after: number | null; pattern: string | null;
  eval_after: number | null; mate_after: number | null; clock_left: number | null; time_spent: number | null;
};
export type GameDetail = {
  id: number; white: string; black: string;
  white_elo: number | null; black_elo: number | null;
  color: "white" | "black" | null;
  played_at: string | null; opening: string | null; outcome: string | null;
  analysed: boolean; start_fen: string | null; san: string[];
  plies: ReviewMove[]; deck_plies: number[]; review_marks: { ply: number; mark: StepMark }[];
  reviewed_at: string | null; accuracy: number | null;
};

/** Explicit unconfigured preview; never used after a failed authenticated request. */
export const sampleGame: GameDetail = {
  id: 0, white: "Sample player", black: "Sample opponent",
  white_elo: null, black_elo: null, color: "white", played_at: null,
  opening: "Scholar’s mate", outcome: "win", analysed: false, start_fen: null,
  san: ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"], plies: [], deck_plies: [], review_marks: [], reviewed_at: null, accuracy: null,
};
