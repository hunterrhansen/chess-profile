import test from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import {
  piecesAt,
  transitionPieces,
  coordinates,
} from "../src/lib/board-motion.ts";
function step(fen, uci) {
  const chess = new Chess(fen);
  const move = chess.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4],
  });
  return { move, after: chess.fen(), before: piecesAt(fen) };
}
test("a move and its retry return preserve the moving piece identity", () => {
  const fen = "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1";
  const { after, before } = step(fen, "e1e2");
  const moved = transitionPieces(before, fen, after);
  assert.equal(moved.animate, true);
  assert.equal(
    moved.pieces.find((p) => p.square === "e2").id,
    before.find((p) => p.square === "e1").id,
  );
  const returned = transitionPieces(moved.pieces, after, fen);
  assert.deepEqual(returned.pieces, before);
});
test("capture removes only the captured piece and preserves the attacker", () => {
  const fen = "4k3/8/8/8/8/8/4p3/4R1K1 w - - 0 1";
  const { after, before } = step(fen, "e1e2");
  const result = transitionPieces(before, fen, after);
  assert.equal(result.captured.length, 1);
  assert.equal(result.captured[0].side, "b");
  assert.equal(
    result.pieces.find((p) => p.square === "e2").id,
    before.find((p) => p.square === "e1").id,
  );
});
test("en passant fades the pawn off the destination square", () => {
  const fen = "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1";
  const { after, before } = step(fen, "e5d6");
  const result = transitionPieces(before, fen, after);
  assert.equal(result.captured[0].square, "d5");
  assert.equal(
    result.pieces.find((p) => p.square === "d6").id,
    before.find((p) => p.square === "e5").id,
  );
});
test("castling moves the existing king and rook together", () => {
  const fen = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
  const { after, before } = step(fen, "e1g1");
  const result = transitionPieces(before, fen, after);
  assert.equal(
    result.pieces.find((p) => p.square === "g1").id,
    before.find((p) => p.square === "e1").id,
  );
  assert.equal(
    result.pieces.find((p) => p.square === "f1").id,
    before.find((p) => p.square === "h1").id,
  );
  assert.equal(result.captured.length, 0);
});
test("promotion retains identity while changing the piece shape", () => {
  const fen = "4k3/P7/8/8/8/8/8/4K3 w - - 0 1";
  const { after, before } = step(fen, "a7a8n");
  const result = transitionPieces(before, fen, after);
  assert.equal(result.pieces.find((p) => p.square === "a8").kind, "n");
  assert.equal(
    result.pieces.find((p) => p.square === "a8").id,
    before.find((p) => p.square === "a7").id,
  );
});
test("unrelated positions reset and flipping mirrors both coordinates", () => {
  const chess = new Chess();
  const from = chess.fen();
  chess.move("e4");
  chess.move("e5");
  assert.equal(
    transitionPieces(piecesAt(from), from, chess.fen()).animate,
    false,
  );
  assert.deepEqual(coordinates("a8", false), { x: 0, y: 0 });
  assert.deepEqual(coordinates("a8", true), { x: 7, y: 7 });
});
