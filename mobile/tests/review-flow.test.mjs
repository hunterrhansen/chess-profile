import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nextReviewStep,
  reviewPrompt,
  loadExplanation,
} from "../src/lib/review-flow.ts";
import { buildReviewLesson } from "../src/lib/review-lesson.ts";
import { reviewGame } from "./fixtures/review-game.mjs";
test("unresolved find cannot advance; informational step records its mark", () => {
  const steps = buildReviewLesson(reviewGame).steps;
  assert.throws(() => nextReviewStep(steps, 0, {}));
  assert.deepEqual(nextReviewStep(steps, 0, { 1: "found" }), {
    index: 1,
    marks: { 1: "found" },
    last: false,
  });
  assert.equal(nextReviewStep(steps, 1, { 1: "found" }).marks[3], "praise");
  assert.equal(
    nextReviewStep(steps, 2, { 1: "found", 3: "praise" }).last,
    true,
  );
});
test("find prompt does not leak best SAN from headline", () => {
  const step = buildReviewLesson(reviewGame).steps[0];
  assert.equal(
    reviewPrompt(
      { ...step, headline: "Secret: Qh5 was best." },
      reviewGame.plies[0],
    ).includes("Qh5"),
    false,
  );
});
test("summary request is suppressed before resolution and can retry quota errors", async () => {
  let calls = 0;
  const api = async () => {
    calls++;
    if (calls === 1) throw Error("quota");
    return { best: { summary: "Protect the king." } };
  };
  assert.equal(await loadExplanation(api, 1, 1, false), null);
  assert.equal(calls, 0);
  await assert.rejects(loadExplanation(api, 1, 1, true));
  assert.equal(await loadExplanation(api, 1, 1, true), "Protect the king.");
});
test("a replacement review lifecycle stays active after old cleanup", async () => {
  const { ReviewLifecycle } = await import("../src/lib/review-flow.ts");
  const flow = new ReviewLifecycle();
  const old = flow.begin();
  flow.end(old);
  const next = flow.begin();
  assert.equal(old.aborted, true);
  assert.equal(next.aborted, false);
  flow.end(old);
  assert.equal(next.aborted, false);
  flow.end(next);
  assert.equal(next.aborted, true);
});
