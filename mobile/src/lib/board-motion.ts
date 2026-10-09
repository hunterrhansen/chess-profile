import { Chess, type Square, type PieceSymbol, type Color } from "chess.js";
export const MOVE_MS = 200;
export type BoardPiece = {
  id: string;
  square: Square;
  kind: PieceSymbol;
  side: Color;
};
export function piecesAt(fen: string): BoardPiece[] {
  return new Chess(fen).board().flatMap((row) =>
    row.flatMap((piece) =>
      piece
        ? [
            {
              id: `${piece.color}${piece.type}-${piece.square}`,
              square: piece.square,
              kind: piece.type,
              side: piece.color,
            },
          ]
        : [],
    ),
  );
}
function moveBetween(from: string, to: string) {
  const chess = new Chess(from);
  for (const move of chess.moves({ verbose: true })) {
    chess.move(move);
    const match = chess.fen() === to;
    chess.undo();
    if (match) return move;
  }
  return null;
}
/** Preserve piece identity for a legal move (including castles and promotion).
 * Unrelated positions reset immediately instead of sending every piece across the board. */
export function transitionPieces(
  previous: BoardPiece[],
  from: string,
  to: string,
) {
  const move = moveBetween(from, to);
  const undo = move ? null : moveBetween(to, from);
  const changed = move ?? undo;
  if (!changed)
    return {
      pieces: piecesAt(to),
      captured: [] as BoardPiece[],
      animate: false,
    };
  const source = move ? changed.from : changed.to;
  const destination = move ? changed.to : changed.from;
  const castle = changed.flags.includes("k") || changed.flags.includes("q");
  const rank = changed.from[1];
  const rookFrom = `${changed.flags.includes("k") ? "h" : "a"}${rank}`;
  const rookTo = `${changed.flags.includes("k") ? "f" : "d"}${rank}`;
  const pieces = piecesAt(to).map((piece) => {
    let oldSquare = piece.square;
    if (piece.square === destination) oldSquare = source;
    else if (castle && piece.square === (move ? rookTo : rookFrom))
      oldSquare = (move ? rookFrom : rookTo) as Square;
    const old = previous.find(
      (p) => p.square === oldSquare && p.side === piece.side,
    );
    return { ...piece, id: old?.id ?? `${piece.id}-restored` };
  });
  return {
    pieces,
    captured: previous.filter((p) => !pieces.some((next) => next.id === p.id)),
    animate: true,
  };
}
export function coordinates(square: Square, flipped: boolean) {
  const file = square.charCodeAt(0) - 97,
    rank = 8 - Number(square[1]);
  return flipped ? { x: 7 - file, y: 7 - rank } : { x: file, y: rank };
}
