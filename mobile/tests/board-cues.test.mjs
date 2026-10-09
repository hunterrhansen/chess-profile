import test from "node:test";
import assert from "node:assert/strict";
import { answerSound } from "../src/lib/board-cues.ts";

test("checkmate plays one celebration instead of stacking answer and mate chords", () => {
  assert.equal(answerSound("right", "checkmate"), null);
  assert.equal(answerSound("wrong", "checkmate"), "wrong");
  assert.equal(answerSound("right", "move"), "right");
  assert.equal(answerSound(undefined, "checkmate"), null);
});
