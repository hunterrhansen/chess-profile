import test from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import {
  piecesAt,
  transitionPieces,
  coordinates,
} from "../src/lib/board-motion.ts";
import * as board from "../src/lib/board-motion.ts";
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

test("replay counters do not prevent a legal piece slide", () => {
  const { before, after } = step(new Chess().fen(), "e2e4");
  const replay = after.split(" ");
  replay[5] = "24";
  const result = transitionPieces(before, new Chess().fen(), replay.join(" "));
  assert.equal(result.animate, true);
  assert.equal(result.sound, "move");
});

test("check identifies both the king and the checking rook's ray", () => {
  assert.equal(typeof board.checkSquares, "function");
  assert.deepEqual(board.checkSquares("4k3/8/8/8/8/8/8/4R1K1 b - - 0 1"), {
    king: "e8",
    path: ["e1", "e2", "e3", "e4", "e5", "e6", "e7"],
  });
  assert.equal(board.checkSquares(new Chess().fen()), null);
});

test("knight checks mark only the attacking square", () => {
  assert.equal(typeof board.checkSquares, "function");
  assert.deepEqual(board.checkSquares("4k3/8/5N2/8/8/8/8/4K3 b - - 0 1"), {
    king: "e8",
    path: ["f6"],
  });
});

test("drag coordinates respect orientation and reject board edges", () => {
  assert.equal(typeof board.squareAtPoint, "function");
  assert.equal(board.squareAtPoint(25, 375, 400, false), "a1");
  assert.equal(board.squareAtPoint(25, 375, 400, true), "h8");
  for (const [x, y, width] of [
    [-1, 20, 400],
    [400, 20, 400],
    [20, 400, 400],
    [0, 0, 0],
  ])
    assert.equal(board.squareAtPoint(x, y, width, false), null);
});

test("drag commits only legal moves from the side to move", () => {
  assert.equal(typeof board.canDrop, "function");
  const fen = new Chess().fen();
  assert.equal(board.canDrop(fen, "e2", "e4"), true);
  assert.equal(board.canDrop(fen, "e2", "e5"), false);
  assert.equal(board.canDrop(fen, "e7", "e5"), false);
  assert.equal(board.canDrop(fen, "e2", null), false);
});

test("a cancelled drag over a legal destination never commits", () => {
  assert.equal(typeof board.resolveDrop, "function");
  assert.equal(board.resolveDrop(false, 225, 225, 400, false, ["e4"]), null);
  assert.equal(board.resolveDrop(true, 225, 225, 400, false, ["e4"]), "e4");
  assert.equal(board.resolveDrop(true, 225, 175, 400, false, ["e4"]), null);
  assert.equal(board.resolveDrop(true, -1, 225, 400, false, ["e4"]), null);
});

test("mate celebrates once on a forward move, never on load or revisit", () => {
  assert.equal(typeof board.matePresentation, "function");
  const fen = "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1";
  const { after } = step(fen, "e1e8");
  const first = board.matePresentation(fen, after, []);
  assert.equal(first.fall, true);
  assert.equal(first.mated, "g8");
  assert.equal(first.winner, "g1");
  assert.equal(board.matePresentation(after, after, []).fall, false);
  assert.equal(board.matePresentation(fen, after, first.seen).fall, false);
});

test("move sounds distinguish captures, castles, promotion, mate and undo", () => {
  for (const [fen, uci, sound] of [
    ["7k/8/8/8/8/8/4p3/4R1K1 w - - 0 1", "e1e2", "capture"],
    ["4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", "e5d6", "capture"],
    ["r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "e1g1", "castle"],
    ["4k3/P7/8/8/8/8/8/4K3 w - - 0 1", "a7a8n", "promote"],
    ["6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", "e1e8", "checkmate"],
  ]) {
    const { after, before } = step(fen, uci);
    const result = transitionPieces(before, fen, after);
    assert.equal(result.sound, sound);
    assert.equal(transitionPieces(result.pieces, after, fen).sound, "move");
  }
});
