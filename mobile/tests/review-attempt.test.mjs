import assert from "node:assert/strict";
import { test } from "node:test";
import { ReviewAttempt, reviewOutcome } from "../src/lib/review-attempt.ts";
import { ReviewSession } from "../src/lib/review-session.ts";
import { makeGame } from "./fixtures/review-game.mjs";
const answer = {
  correct: true,
  quality: "best",
  rating: "good",
  best_uci: "e2e4",
  best_san: "e4",
  due: "2026-10-12",
  mastered: false,
};
const setup = (api) => {
  const s = new ReviewSession(
    {
      getItem: async () => null,
      setItem: async () => {},
      removeItem: async () => {},
    },
    "x",
    1,
    "f",
  );
  return {
    s,
    c: new ReviewAttempt({
      api,
      session: s,
      ply: 1,
      fen:
        makeGame().start_fen ??
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      gameId: 1,
    }),
  };
};
const today = { server_day: "2026-10-10", results: [] };
test("authoritative outcomes include alternatives, help, shown and wrong", () => {
  const result = (a, extra = {}) =>
    reviewOutcome({
      uci: "e2e4",
      answer: a,
      hadHelp: false,
      hadFirstAttempt: false,
      ...extra,
    });
  assert.equal(result(answer), "found");
  assert.equal(result({ ...answer, quality: "good" }), "good");
  assert.equal(result({ ...answer, rating: null }), "helped");
  assert.equal(result(answer, { hadHelp: true }), "helped");
  assert.equal(result({ ...answer, correct: false, quality: "wrong" }), null);
  assert.equal(result(answer, { uci: "0000" }), "missed");
});
test("pending is persisted before answer; exact expected day is sent", async () => {
  let body;
  const { s, c } = setup(async (path, b) => {
    if (path === "/api/deck") return today;
    assert.ok(s.state.positions[1].pending);
    body = b;
    return answer;
  });
  await c.refresh();
  await c.submit("e2e4");
  assert.equal(body.expected_day, today.server_day);
  assert.equal(body.redo, false);
  assert.equal(s.state.marks[1], "found");
});
test("wrong then right is helped and failed request preserves uncertainty", async () => {
  let n = 0;
  const { c } = setup(async (path) =>
    path === "/api/deck"
      ? today
      : ++n === 1
        ? { ...answer, correct: false, quality: "wrong" }
        : answer,
  );
  await c.refresh();
  await c.submit("d2d4");
  assert.equal(c.progress.outcome, undefined);
  await c.submit("e2e4");
  assert.equal(c.progress.outcome, "helped");
  const lost = setup(async (path) => {
    if (path === "/api/deck") return today;
    throw Error("offline");
  });
  await lost.c.refresh();
  await lost.c.submit("e2e4");
  assert.ok(lost.c.progress.pending);
  assert.ok(lost.c.error);
});
test("day change pauses, explicit restart permits current-day answer", async () => {
  let day = "2026-10-10";
  const { c } = setup(async (path) =>
    path === "/api/deck" ? { ...today, server_day: day } : answer,
  );
  await c.refresh();
  c.progress.hadAttempt = true;
  day = "2026-10-11";
  await c.submit("e2e4");
  assert.equal(c.progress.needsRestart, true);
  await c.restart();
  await c.submit("e2e4");
  assert.equal(c.progress.outcome, "helped");
});
test("double submit and disposed response do not resolve twice", async () => {
  let resolve;
  let posts = 0;
  const { c, s } = setup(async (path) => {
    if (path === "/api/deck") return today;
    posts++;
    return new Promise((r) => (resolve = r));
  });
  await c.refresh();
  const p = c.submit("e2e4");
  await new Promise((r) => setTimeout(r, 0));
  await c.submit("e2e4");
  c.dispose();
  resolve(answer);
  await p;
  assert.equal(posts, 1);
  assert.equal(s.state.marks[1], undefined);
});
test("hint persists help and answer time excludes network", async () => {
  const { c } = setup(async (path) =>
    path === "/api/deck"
      ? today
      : path === "/api/deck/hint"
        ? { best_uci: "e2e4" }
        : answer,
  );
  await c.refresh();
  await c.hint("piece");
  assert.equal(c.progress.hints, 1);
  assert.equal(c.progress.hintMove, "e2e4");
  await c.submit("e2e4");
  assert.equal(c.progress.outcome, "helped");
});
test("failed hint retries the same rung after reload without revealing the next", async () => {
  let n = 0;
  const api = async (path) => {
    if (path === "/api/deck") return today;
    if (++n === 1) throw Error("offline");
    return { best_uci: "e2e4" };
  };
  const { c, s } = setup(api);
  await c.refresh();
  await c.hint("piece");
  assert.equal(c.progress.hints, 1);
  assert.equal(c.progress.pendingHint, "piece");
  const resumed = new ReviewAttempt({
    api,
    session: s,
    ply: 1,
    gameId: 1,
    fen: makeGame().start_fen ?? new (await import("chess.js")).Chess().fen(),
  });
  await resumed.refresh();
  await resumed.hint("move");
  assert.equal(resumed.progress.hints, 1);
  assert.equal(resumed.progress.pendingHint, undefined);
  assert.equal(resumed.progress.hintMove, "e2e4");
});
