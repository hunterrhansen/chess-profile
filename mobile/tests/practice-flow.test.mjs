import test from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import {
  promotionChoices,
  practiceHint,
  practiceSummary,
  PracticeSession,
} from "../src/lib/practice-flow.ts";
export const card = {
  game_id: 7,
  ply: 9,
  pattern: "fork",
  reviews: 0,
  fen_before: "7k/P7/8/8/8/8/8/7K w - - 0 1",
  color: "white",
  san: "a8=Q",
  uci: "a7a8q",
  move_number: 5,
  classification: "miss",
  opponent: "A",
  played_at: "2026-10-09",
  win_pct_before: 50,
  prev_uci: "h7h8",
};
const storage = () => {
  const data = new Map();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
  };
};
test("promotion offers all legal pieces and preserves a knight underpromotion", () => {
  assert.deepEqual(promotionChoices(card.fen_before, "a7", "a8"), [
    "q",
    "r",
    "b",
    "n",
  ]);
  const chess = new Chess(card.fen_before);
  const move = chess.move({ from: "a7", to: "a8", promotion: "n" });
  assert.equal(move.from + move.to + move.promotion, "a7a8n");
  assert.equal(chess.get("a8").type, "n");
  assert.deepEqual(promotionChoices(card.fen_before, "h1", "g1"), []);
});
test("tactic hints precede piece and move hints, unknown patterns skip words", () => {
  assert.equal(practiceHint(card, 1).rung, "tactic");
  assert.match(practiceHint(card, 1).text, /fork/);
  assert.equal(practiceHint(card, 1).showPiece, false);
  assert.equal(practiceHint(card, 2, "a7a8n").showPiece, true);
  assert.equal(practiceHint(card, 3, "a7a8n").showMove, true);
  assert.equal(
    practiceHint({ ...card, pattern: null }, 1, "a7a8n").rung,
    "piece",
  );
  assert.equal(
    practiceHint({ ...card, pattern: null }, 2, "a7a8n").showMove,
    true,
  );
  assert.match(
    practiceHint({ ...card, classification: "blunder" }, 1).text,
    /Watch/,
  );
});
test("summary separates independent answers, help and shown moves", () => {
  assert.deepEqual(
    practiceSummary([
      { mark: "found" },
      { mark: "good" },
      { mark: "helped" },
      { mark: "missed" },
    ]),
    { found: 2, helped: 1, missed: 1 },
  );
});
test("retry queue survives reopening and removes only completed retries", async () => {
  const disk = storage();
  const s = new PracticeSession(disk, "server/user-a", "2026-10-09");
  await s.load();
  await s.enqueue(card);
  await s.enqueue(card);
  // A fresh scope forces a disk read, as a fresh process would after app exit.
  const cold = new PracticeSession(
    {
      ...disk,
      getItem: () => disk.getItem("knightly.practice.v1.server/user-a"),
    },
    "server/cold-start",
    "2026-10-09",
  );
  await cold.load();
  assert.equal(cold.queue.length, 1);
  const resumed = new PracticeSession(disk, "server/user-a", "2026-10-09");
  await resumed.load();
  assert.equal(resumed.queue.length, 1);
  await resumed.complete(card);
  const done = new PracticeSession(disk, "server/user-a", "2026-10-09");
  await done.load();
  assert.equal(done.queue.length, 0);
});
test("hints keep grading penalty on reopen and remain isolated by user, server and day", async () => {
  const disk = storage();
  const s = new PracticeSession(disk, "server/user-a", "2026-10-09");
  await s.load();
  await s.rememberHint(card, 1, undefined, 1000);
  await s.enqueue(card);
  const resumed = new PracticeSession(disk, "server/user-a", "2026-10-09");
  await resumed.load();
  assert.equal(resumed.hint(card).count, 1);
  assert.equal(resumed.hint(card).startedAt, 1000);
  for (const [scope, day] of [
    ["server/user-b", "2026-10-09"],
    ["other-server/user-a", "2026-10-09"],
    ["server/user-a", "2026-10-10"],
  ]) {
    const other = new PracticeSession(disk, scope, day);
    await other.load();
    assert.equal(other.queue.length, 0);
    assert.equal(other.hint(card), undefined);
  }
});
test("corrupt storage is ignored and overlapping writes preserve latest queue", async () => {
  const disk = storage();
  const s = new PracticeSession(disk, "s/u", "2026-10-09");
  await s.load();
  await Promise.all([
    s.enqueue(card),
    s.enqueue({ ...card, ply: 11 }),
    s.complete(card),
  ]);
  const resumed = new PracticeSession(disk, "s/u", "2026-10-09");
  await resumed.load();
  assert.deepEqual(
    resumed.queue.map((c) => c.ply),
    [11],
  );
  const broken = new PracticeSession(
    { getItem: async () => "{bad", setItem: async () => {} },
    "s/corrupt",
    "2026-10-09",
  );
  await broken.load();
  assert.equal(broken.queue.length, 0);
});

test("lost answer response recovers retry from server results, without inventing grades", async () => {
  for (const mark of ["missed", "helped", "found", null]) {
    const disk = storage();
    const s = new PracticeSession(disk, `server/user/${mark}`, "2026-10-09");
    await s.beginAnswer(card, 1234);
    const resumed = new PracticeSession(
      disk,
      `server/user/${mark}`,
      "2026-10-09",
    );
    await resumed.load();
    assert.equal(resumed.hint(card).startedAt, 1234);
    await resumed.reconcile({ results: mark ? [{ ...card, mark }] : [] });
    assert.equal(
      resumed.queue.length,
      ["missed", "helped"].includes(mark) ? 1 : 0,
    );
    if (resumed.queue.length) await resumed.complete(card);
    const reopened = new PracticeSession(
      disk,
      `server/user/${mark}`,
      "2026-10-09",
    );
    await reopened.load();
    await reopened.reconcile({ results: [{ ...card, mark: "missed" }] });
    assert.equal(
      reopened.queue.length,
      mark === null ? 1 : 0,
      "unresolved POST survives a GET before commit; completed cards stay removed",
    );
  }
});
test("reconciliation removes old retries and loading waits for prior instance writes", async () => {
  const disk = storage();
  const s = new PracticeSession(disk, "server/user", "2026-10-09");
  const write = s.enqueue(card);
  const resumed = new PracticeSession(disk, "server/user", "2026-10-09");
  await resumed.load();
  await write;
  assert.equal(resumed.queue.length, 1);
  await resumed.reconcile({ results: [] });
  assert.equal(resumed.queue.length, 0);
});

test("late response cannot resurrect a retry completed by a reopened screen", async () => {
  const disk = storage();
  const original = new PracticeSession(disk, "server/race", "2026-10-09");
  await original.beginAnswer(card, 1000);
  const reopened = new PracticeSession(disk, "server/race", "2026-10-09");
  await reopened.load();
  await reopened.reconcile({ results: [{ ...card, mark: "missed" }] });
  await reopened.complete(card);
  await original.finishAnswer(card, true);
  const latest = new PracticeSession(disk, "server/race", "2026-10-09");
  await latest.load();
  assert.equal(latest.queue.length, 0);
});
test("GET started before answer acknowledgement cannot discard the new retry", async () => {
  const s = new PracticeSession(storage(), "server/get-race", "2026-10-09");
  await s.beginAnswer(card, 1000);
  const checkpoint = s.checkpoint();
  await s.finishAnswer(card, true);
  await s.reconcile({ results: [] }, checkpoint);
  assert.equal(s.queue.length, 1);
  await s.reconcile({ results: [{ ...card, mark: "missed" }] }, s.checkpoint());
  assert.equal(s.queue.length, 1);
});
