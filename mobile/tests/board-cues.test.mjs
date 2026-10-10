import test from "node:test";
import assert from "node:assert/strict";
import { answerSound } from "../src/lib/board-cues.ts";

test("checkmate plays one celebration instead of stacking answer and mate chords", () => {
  assert.equal(answerSound("right", "checkmate"), null);
  assert.equal(answerSound("wrong", "checkmate"), "wrong");
  assert.equal(answerSound("right", "move"), "right");
  assert.equal(answerSound(undefined, "checkmate"), null);
});

test('graded moves acknowledge immediately, including the single checkmate celebration', async () => {
  const { moveSoundDelay } = await import('../src/lib/board-cues.ts');
  assert.equal(moveSoundDelay('right', 200), 0);
  assert.equal(moveSoundDelay('wrong', 200), 0);
  assert.equal(moveSoundDelay(undefined, 200), 200);
});
