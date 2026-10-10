import assert from "node:assert/strict";
import { test } from "node:test";
import { finishReview, reviewResults } from "../src/lib/review-completion.ts";
import { ReviewSession } from "../src/lib/review-session.ts";
import { reviewGame } from "./fixtures/review-game.mjs";
const setup = () =>
  new ReviewSession(
    {
      getItem: async () => null,
      setItem: async () => {},
      removeItem: async () => {},
    },
    "scope",
    12,
    "lesson",
  );
const marks = [
  { ply: 1, mark: "found" },
  { ply: 3, mark: "praise" },
  { ply: 5, mark: "seen" },
];
test("finish persists before POST and clears only after confirmation", async () => {
  const session = setup();
  let posted = false;
  await finishReview({
    session,
    gameId: 12,
    marks,
    baselineReviewedAt: null,
    api: async (path, body) => {
      assert.ok(session.state.pendingFinish);
      assert.deepEqual(body, { marks });
      posted = true;
      return { reviewed_at: "new" };
    },
  });
  assert.equal(posted, true);
  assert.equal(session.state.pendingFinish, undefined);
});
test("lost finish response reconciles newly saved marks; old match does not count", async () => {
  const session = setup();
  const api = async (path, body) => {
    if (body) throw Error("lost");
    return { reviewed_at: "new", review_marks: marks };
  };
  await finishReview({
    session,
    api,
    gameId: 12,
    marks,
    baselineReviewedAt: "old",
  });
  const pending = setup();
  await assert.rejects(
    finishReview({
      session: pending,
      gameId: 12,
      marks,
      baselineReviewedAt: "old",
      api: async (path, b) => {
        if (b) throw Error("offline");
        return { reviewed_at: "old", review_marks: marks };
      },
    }),
  );
  assert.ok(pending.state.pendingFinish);
});
test("double finish shares a single write and aborted identity never clears", async () => {
  const session = setup();
  let posts = 0,
    release;
  const api = async () => {
    posts++;
    return new Promise((r) => (release = r));
  };
  const args = { session, api, gameId: 12, marks, baselineReviewedAt: null };
  const a = finishReview(args),
    b = finishReview(args);
  await new Promise((r) => setTimeout(r, 0));
  release({ reviewed_at: "new" });
  await Promise.all([a, b]);
  assert.equal(posts, 1);
  const other = setup(),
    abort = new AbortController();
  abort.abort();
  await assert.rejects(
    finishReview({ ...args, session: other, signal: abort.signal }),
  );
  assert.equal(posts, 1);
});
test("saved results distinguish found/helped/missed and informational marks", () => {
  const game = {
    ...reviewGame,
    reviewed_at: "saved",
    review_marks: [
      { ply: 1, mark: "found" },
      { ply: 3, mark: "helped" },
      { ply: 5, mark: "missed" },
      { ply: 2, mark: "praise" },
      { ply: 4, mark: "seen" },
    ],
  };
  assert.deepEqual(reviewResults(game), {
    found: 1,
    asked: 3,
    helped: 1,
    missed: 1,
    toFix: 2,
  });
  assert.equal(reviewResults({ ...game, reviewed_at: null }), null);
});
test("quiet game can save empty marks; failed retry preserves original baseline", async () => {
  const session = setup();
  session.state.pendingFinish = { marks: [], baselineReviewedAt: "original" };
  await assert.rejects(
    finishReview({
      session,
      gameId: 12,
      marks: [],
      baselineReviewedAt: "changed",
      api: async () => {
        throw Error("offline");
      },
    }),
  );
  assert.equal(session.state.pendingFinish.baselineReviewedAt, "original");
});
