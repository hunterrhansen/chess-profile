import {
  Chess,
  type Square,
  type PieceSymbol,
  type Color,
  type Move,
} from "chess.js";
export const MOVE_MS = 200;
export type MoveSound =
  "move" | "capture" | "castle" | "check" | "promote" | "checkmate";
const placement = (fen: string) => fen.split(" ").slice(0, 2).join(" ");
export type BoardPiece = {
  id: string;
  square: Square;
  kind: PieceSymbol;
  side: Color;
  fromSquare?: Square;
  positionTransition?: boolean;
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
export function moveBetween(from: string, to: string) {
  return (
    new Chess(from)
      .moves({ verbose: true })
      .find((move) => placement(move.after) === placement(to)) ?? null
  );
}
function soundForMove(move: Move): MoveSound {
  if (move.san.includes("#")) return "checkmate";
  if (move.san.includes("+")) return "check";
  if (move.isKingsideCastle() || move.isQueensideCastle()) return "castle";
  if (move.isPromotion()) return "promote";
  if (move.isCapture() || move.isEnPassant()) return "capture";
  return "move";
}
/** Preserve legal-move identity; practice may also rearrange unrelated positions. */
export function transitionPieces(
  previous: BoardPiece[],
  from: string,
  to: string,
  rearrange: boolean | "always" = false,
) {
  if (rearrange === "always") return rearrangePieces(previous, to);
  const move = moveBetween(from, to);
  const undo = move ? null : moveBetween(to, from);
  const changed = move ?? undo;
  if (!changed && rearrange) return rearrangePieces(previous, to);
  if (!changed)
    return {
      pieces: piecesAt(to),
      captured: [] as BoardPiece[],
      animate: false,
      sound: null as MoveSound | null,
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
    captured: previous.filter((p) => !pieces.some((next) => next.id === p.id)).map(currentPiece),
    animate: true,
    sound: move ? soundForMove(move) : ("move" as MoveSound),
  };
}
/** Capture fades use the current square after any earlier rearrangement. */
function currentPiece(piece: BoardPiece): BoardPiece {
  return { id: piece.id, square: piece.square, kind: piece.kind, side: piece.side };
}
/** Match web board movement preferences, without reusing an identity twice. */
function rearrangePieces(previous: BoardPiece[], to: string) {
  const next = piecesAt(to);
  const available = new Set(previous);
  const paired = new Map<BoardPiece, BoardPiece>();
  for (const piece of next) {
    const old = previous.find(p => p.square === piece.square && p.side === piece.side && p.kind === piece.kind);
    if (old) { paired.set(piece, old); available.delete(old); }
  }
  for (const piece of next) {
    if (paired.has(piece)) continue;
    const candidates = [...available].filter(p => p.side === piece.side && p.kind === piece.kind);
    const old = candidates.find(p => {
      const dx = Math.abs(p.square.charCodeAt(0) - piece.square.charCodeAt(0));
      const dy = Math.abs(Number(p.square[1]) - Number(piece.square[1]));
      switch (piece.kind) {
        case "p": return dx === 0;
        case "n": return (dx === 2 && dy === 1) || (dx === 1 && dy === 2);
        case "b": return dx === dy;
        case "r": return dx === 0 || dy === 0;
        case "q": return dx === 0 || dy === 0 || dx === dy;
        case "k": return dx <= 1 && dy <= 1;
      }
    }) ?? candidates[0];
    if (old) { paired.set(piece, old); available.delete(old); }
  }
  const ids = new Set(previous.map(p => p.id));
  const pieces = next.map(piece => {
    const old = paired.get(piece);
    if (old) return { ...piece, id: old.id, fromSquare: old.square, positionTransition: true };
    let id = piece.id;
    while (ids.has(id)) id += "-new";
    ids.add(id);
    return { ...piece, id, positionTransition: true };
  });
  return { pieces, captured: [...available].map(p => ({ ...currentPiece(p), positionTransition: true })), animate: true, sound: null as MoveSound | null };
}
export function coordinates(square: Square, flipped: boolean) {
  const file = square.charCodeAt(0) - 97,
    rank = 8 - Number(square[1]);
  return flipped ? { x: 7 - file, y: 7 - rank } : { x: file, y: rank };
}

/** Removed seed pieces stay at their old screen position until the slide finishes. */
export function pieceCoordinates(piece: BoardPiece, flipped: boolean, initialFlipped?: boolean, captured = false) {
  const oldOrientation = initialFlipped ?? flipped;
  const staysAtOrigin = captured && !!piece.positionTransition;
  return {
    point: coordinates(piece.square, staysAtOrigin ? oldOrientation : flipped),
    origin: coordinates(piece.fromSquare ?? piece.square,
      piece.fromSquare || staysAtOrigin ? oldOrientation : flipped),
  };
}

/** Board-local touch point. Edges outside the grid never become a destination. */
export function squareAtPoint(
  x: number,
  y: number,
  width: number,
  flipped: boolean,
): Square | null {
  "worklet";
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    width <= 0 ||
    x < 0 ||
    y < 0 ||
    x >= width ||
    y >= width
  )
    return null;
  const file = Math.floor(x / (width / 8));
  const row = Math.floor(y / (width / 8));
  return `${"abcdefgh"[flipped ? 7 - file : file]}${flipped ? row + 1 : 8 - row}` as Square;
}
export function canDrop(fen: string, from: Square, to: Square | null) {
  return (
    !!to &&
    new Chess(fen)
      .moves({ square: from, verbose: true })
      .some((move) => move.to === to)
  );
}

/** Gesture Handler also ends cancelled gestures; only a successful release commits. */
export function resolveDrop(
  success: boolean,
  x: number,
  y: number,
  width: number,
  flipped: boolean,
  targets: Square[],
): Square | null {
  "worklet";
  if (!success) return null;
  const square = squareAtPoint(x, y, width, flipped);
  return square && targets.includes(square) ? square : null;
}
export function checkSquares(
  fen: string,
): { king: Square; path: Square[] } | null {
  const chess = new Chess(fen);
  if (!chess.inCheck()) return null;
  const king = chess.findPiece({ type: "k", color: chess.turn() })[0];
  const path: Square[] = [];
  for (const from of chess.attackers(king, chess.turn() === "w" ? "b" : "w")) {
    const df = king.charCodeAt(0) - from.charCodeAt(0);
    const dr = Number(king[1]) - Number(from[1]);
    if (df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr)) {
      for (let i = 0; i < Math.max(Math.abs(df), Math.abs(dr)); i++)
        path.push(
          `${String.fromCharCode(from.charCodeAt(0) + Math.sign(df) * i)}${Number(from[1]) + Math.sign(dr) * i}` as Square,
        );
    } else path.push(from);
  }
  return { king, path };
}
/** Reloads and revisits show the final mate frame; only a new mating move topples. */
export function matePresentation(before: string, fen: string, seen: string[]) {
  const chess = new Chess(fen);
  const mated = chess.isCheckmate()
    ? chess.findPiece({ type: "k", color: chess.turn() })[0]
    : undefined;
  const winner = mated
    ? chess.findPiece({ type: "k", color: chess.turn() === "w" ? "b" : "w" })[0]
    : undefined;
  const key = placement(fen);
  return {
    mated,
    winner,
    fall: !!mated && !seen.includes(key) && !!moveBetween(before, fen),
    seen: mated && !seen.includes(key) ? [...seen, key] : seen,
  };
}
