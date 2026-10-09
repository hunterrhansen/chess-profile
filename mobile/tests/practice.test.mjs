import test from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import {
  exercises,
  evaluateMove,
  legalTargets,
  boardSquares,
} from "../src/lib/practice.ts";
test("every fixture solution is a legal checkmate", () => {
  for (const exercise of exercises) {
    const result = evaluateMove(
      exercise,
      exercise.solution.slice(0, 2),
      exercise.solution.slice(2, 4),
    );
    assert.equal(result.correct, true);
    assert.equal(new Chess(result.fen).isCheckmate(), true);
    assert.equal(result.san.endsWith("#"), true);
  }
});
test("legal non-solution is rejected without changing the fixture", () => {
  const original = exercises[0].fen;
  const result = evaluateMove(exercises[0], "e1", "e2");
  assert.equal(result.legal, true);
  assert.equal(result.correct, false);
  assert.equal(exercises[0].fen, original);
});
test("illegal move leaves the original position intact", () => {
  const result = evaluateMove(exercises[0], "e1", "f2");
  assert.equal(result.legal, false);
  assert.equal(result.fen, exercises[0].fen);
});
test("rook targets include mate and exclude friendly pawn", () => {
  assert.ok(legalTargets(exercises[0].fen, "e1").includes("e8"));
  assert.ok(!legalTargets(exercises[0].fen, "e1").includes("f2"));
});
test("flipping reverses all squares without losing their identity", () => {
  const normal = boardSquares(false),
    flipped = boardSquares(true);
  assert.equal(new Set(normal).size, 64);
  assert.equal(normal[0], "a8");
  assert.equal(flipped[0], "h1");
  assert.deepEqual(flipped, [...normal].reverse());
});
