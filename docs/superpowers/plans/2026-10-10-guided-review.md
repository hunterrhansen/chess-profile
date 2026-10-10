# Guided Mobile Game Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Proposed; review the scope before implementation. No implementation has started.

**Goal:** Complete a saved, resumable find/look/praise game-review journey on iPhone.

**Architecture:** Adapt pure web key-moment selection onto mobile's SAN replay. Use a scoped review session and a focused position runner built from existing Practice helpers, not the daily Practice screen. Keep all grading and completion writes on the existing backend.

**Tech Stack:** Installed Expo SDK 57, React Native 0.86, Expo Router, chess.js,
AsyncStorage, existing Clerk session/API and native board/lesson components.

**Spec:** `docs/superpowers/specs/2026-10-10-guided-review-design.md` (audit, scope and recovery policy).

## Global Constraints

- Preserve Clerk identity, server grading and the replay shipped in #85.
- The board remains full width, square-edged and oriented to the player's side.
- Exit/replay/answer actions never mark the game reviewed.
- No schema change proposed; no new product dependency required.
- Implement iPhone first and verify browser behavior separately.

## Review Focus

- Lost answer response: retain help history, reconcile scheduling, never invent first-try success.
- Identity/date change: isolate sessions and stale responses; pause unresolved old-day attempts.
- Invalid/partial analysis or unknown color: replay remains available; grading/completion are blocked.
- App exit or All moves detour: resolved outcomes, hint history and step are preserved.
- Ambiguous finish response: confirm newly saved matching marks, or show retry without false celebration.

## Delivery order

Five deliverables; estimate 3–5 developer days including focused device checks.
Tasks 1–2 establish the safety boundaries; 3–5 complete the visible journey.
Keep the first slice in one feature branch/PR, with a focused commit per task.
Use the existing managed-worktree workflow at implementation time; preserve unrelated work.

### Task 1: Typed lesson selection

**Files:** extend `mobile/src/lib/game-replay.ts`; create
`mobile/src/lib/review-lesson.ts`, `mobile/tests/review-lesson.test.mjs` and
`mobile/tests/fixtures/review-game.mjs`.

**Consumes:** current `GameDetail`, `replayGame(game)` positions/moves/error.
**Produces:** `ReviewMove` with the web MoveRow fields; `StepMark` union;
`LessonStep = {ply:number, type:'find'|'look'|'praise', kind:string,
label:string, headline:string, fenBefore:string, fenAfter:string}`;
`buildReviewLesson(game:GameDetail)` returns
`{status:'ready',steps:LessonStep[],fingerprint:string}` or
`{status:'replay-only',reason:string}`. Expand detail with `deck_plies`,
`review_marks`, `reviewed_at`, `accuracy` and typed analysis rows. Update sample
and existing tests with explicit empty fields, preserving replay behavior.

- [ ] Add fixed fixture data for White, Black, custom Black-to-move FEN, quiet,
  unanalysed and incomplete analysis. Start with a legal SAN sequence and derive
  its UCI/color from chess.js; overlay classifications/deck membership explicitly.
- [ ] Write failing selection tests. At minimum:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReviewLesson } from '../src/lib/review-lesson.ts';
import { reviewGame } from './fixtures/review-game.mjs';
test('bad deck move is find; praise and non-card mistake are separate steps', () => {
  const lesson = buildReviewLesson(reviewGame);
  assert.equal(lesson.status, 'ready');
  assert.deepEqual(lesson.steps.map(s => s.type), ['find', 'praise', 'look']);
});
```

  Fixture must have exactly those three own moments. Add opponent-blunder response
  deduplication, >=20 threshold, custom numbering, correct before/after positions,
  null color, malformed SAN, per-ply SAN/UCI/color mismatch, no moments and >200
  steps. Fingerprint changes when SAN/start FEN/analysis/deck membership changes.
- [ ] Run `cd mobile && node --experimental-strip-types --test tests/review-lesson.test.mjs`;
  confirm failure before adding implementation.
- [ ] Port the two-pass algorithm from `web/src/lib/key-moments.ts`, including
  sound null-classification handling and response deduplication. Use actual replay
  labels; refuse unsafe alignment rather than deriving a lesson from partial rows.
  Generate fingerprint from the ordered lesson inputs, without adding a dependency.
- [ ] Rerun selection and existing replay tests; commit `feat: derive mobile review lessons`.

### Task 2: Scoped review state and interrupted-write recovery

**Files:** create `mobile/src/lib/review-session.ts`,
`mobile/tests/review-session.test.mjs`; extend `mobile/src/lib/api.ts`,
`src/knightly/api.py`, and `tests/test_api.py` for the server-day guard; reuse
`practice-flow.ts` without changing
its daily queue semantics. Scope comes from `session.tsx:practiceScope`.

**Consumes:** Task 1 steps/fingerprint and existing `DeckToday`, `DeckAnswer`.
**Produces:** `ReviewSession(storage,scope,gameId,fingerprint)` with async
`load()`, `save(snapshot)`, `clear()`; `ReviewSnapshot` records step index,
per-ply hints/start time/first answer/outcome/pending UCI/server day, marks and pending
finish `{marks,baselineReviewedAt}`. Pure
`completionConfirmed(game,pending):boolean` requires equal ordered marks and a
non-null timestamp changed from the baseline. Version and validate persisted data.

- [ ] Add backend tests for GET deck `server_day`, answer with matching day,
  mismatched day returning 409 without a scheduling mutation, and absent
  expected_day retaining current behavior. Extend AnswerIn with
  `expected_day: date | None = None`; capture `today = date.today()` once, check
  expected_day before writing, and pass that same `today` into `deck.answer`.
  GET deck captures one day for stats/results/queue too. Add required `server_day`
  to mobile DeckToday and update its fixtures. Fail clearly if a configured
  backend lacks this field; deploy the backward-compatible backend before the client.
- [ ] Write in-memory-storage tests for load/save/clear, corrupt JSON, scope/game/
  fingerprint isolation, serialized write order and storage failures. Assert that
  pending finish is preserved after save failure and old marks alone do not confirm
  completion:

```js
test('old saved marks do not confirm the new finish', () => {
  const pending = { marks: [{ply:1,mark:'found'}], baselineReviewedAt:'2026-10-10T10:00:00Z' };
  assert.equal(completionConfirmed({review_marks:pending.marks,
    reviewed_at:pending.baselineReviewedAt}, pending), false);
});
```

- [ ] Run the session test file and observe failure; implement validated storage
  with keys including version/scope/game/fingerprint and serialized writes.
- [ ] Add recovery tests for pending answer with/without today's deck result,
  yesterday's unresolved attempt, hint used before app exit, and previous identity
  response arriving late. Recovery never fabricates the exact DeckAnswer.
- [ ] Integrate shared Practice pending/hint bookkeeping using real card data
  derived from Task 1 (no fake daily counts). Keep review marks in ReviewSession.
  Expose unresolved answer as a visible solve-again state; resumed success is helped.
  Use fresh server_day for answer expected_day. On a 409/date boundary require
  explicit restart after fresh deck read. Resolved review
  steps remain resumable across dates.
- [ ] Rerun session and Practice flow tests plus backend day-guard tests using
  a dedicated test database as configured by the test suite; commit `feat: persist scoped review progress`.

### Task 3: Server-checked find position runner

**Files:** create `mobile/src/lib/review-attempt.ts`,
`mobile/src/screens/review-position.tsx`, `mobile/tests/review-attempt.test.mjs`.
Reuse `practice-attempt.ts`, `practice-flow.ts:promotionChoices/practiceHint`,
`practice-feedback.ts`, `board.tsx`, promotion picker, lesson prompt and
`bottom-actions.tsx`. Keep `practice-position.tsx` behavior intact.

**Consumes:** find step, typed move, Api, ReviewSession and PracticeSession.
**Produces:** position UI callback `onResolved(mark:StepMark)` only after an
accepted server response and recovery-settlement attempt; exported pure
`reviewOutcome({uci,answer,hadHelp,hadFirstAttempt})` returns
`'found'|'good'|'helped'|'missed'|null` (wrong returns null).

- [ ] Test accepted best/excellent/good alternatives, wrong→retry, hint→solve,
  Show me, `rating:null` and pending-response recovery. Example:

```js
test('a later accepted answer cannot become a first-try mark', () => {
  assert.equal(reviewOutcome({uci:'e2e4',answer:{correct:true,quality:'best',rating:null},
    hadHelp:false,hadFirstAttempt:false}), 'helped');
});
```

- [ ] Use fake Api/storage tests to assert exact request body and ordering:
  persist pending → POST `/api/deck/answer` → settle → resolve. Check double taps,
  offline/lost response, unmount/identity change and finite 0–86400 thinking time and expected_day from the deck preflight.
  Run tests and confirm red before implementation.
- [ ] Implement board tap/drag legality and all four promotion choices using
  existing helpers. Hint delays two seconds, advances tactic/piece/move, persists
  help, and loads `/api/deck/hint` only when needed. Show me submits `0000`.
  Wrong move returns to fenBefore; checking/error states never enable Continue.
- [ ] Implement outcome/mark mapping with server-authoritative correctness. A
  prepared verdict is optional preview only; do not build that optimization here.
  Keep help history through failed writes and navigation.
- [ ] Rerun attempt and existing Practice tests; commit `feat: solve guided review positions`.

### Task 4: Guided screen and replay round-trip

**Files:** create `mobile/src/screens/game-review.tsx`; change
`mobile/src/app/games/[id]/index.tsx`; extend `mobile/src/screens/game-replay.tsx`
for initial-ply and return-to-lesson behavior; keep `/moves` routed to replay.
Add `mobile/tests/review-flow.test.mjs` for pure progression/mark assembly.

**Consumes:** Tasks 1–3. **Produces:** guided route with find/look/praise and
quiet/replay-only/error states; ordered marks with no unresolved find step.
`assembleReviewMarks(steps,marks)` rejects missing/unresolved marks. Explicit
Continue records praise/seen for informational steps; it cannot skip find.

- [ ] Test next/final transitions, no skip of unresolved find, ordered marks,
  quiet-game empty mark set, restored step bounds and blocked completion for
  unsafe analysis. Run the test file and confirm failure.
- [ ] Compose review-owned header and full-width scrolling board with shared
  native prompt/footer components. Do not use LessonScreen's capped/shrinking
  geometry unchanged. Exit goes to Games; All moves pushes `/moves?ply=N` and
  returns via back to the mounted lesson. Replay direct-link exit stays Games.
- [ ] Wire find, look and praise. Protect unresolved prompts from best-SAN/headline
  spoilers. Add cancellable, scope/game/ply-keyed explanation-summary requests
  after resolution/on look, with retry/factual fallback; omit interactive line UI.
  Test summary request suppression before resolution, quota/503 failure, explicit
  retry and stale scope/ply response handling with fake Api calls.
- [ ] Check browser round-trip, progress, wrong answer reset, pinned actions and
  320px/390px/large-text layouts; check iPhone tap/drag/promotion and accessibility.
- [ ] Run tests/types/lint; commit `feat: add guided mobile review journey`.

### Task 5: Explicit finish and saved results

**Files:** create `mobile/src/lib/review-completion.ts`,
`mobile/src/screens/game-review-done.tsx`, `mobile/tests/review-completion.test.mjs`;
replace `mobile/src/app/games/[id]/done.tsx` placeholder; update
`docs/screens/review.md`, screen pictures, `docs/mobile-parity-audit.md`,
`docs/migration-progress.md` and `mobile/README.md`.

**Consumes:** ordered marks/ReviewSession, Api and saved detail.
**Produces:** `finishReview({api,gameId,marks,session,baselineReviewedAt})` persists
pending before POST; reconciles ambiguous failure through GET detail; clears only
on confirmed success. `reviewResults(game)` counts found/good, helped/missed and
praise/seen separately. Done never writes completion itself.

- [ ] Test duplicate finish, failure/retry, lost response with newly saved exact
  marks, old matching review, differing marks, stale identity and zero-moment
  completion. Test results counts and absent saved-review state.
- [ ] Run completion tests, confirm red; implement persistence → POST → clear →
  replace-to-done order. On ambiguous GET evidence, retain pending and visible
  retry; no automatic resubmit. Network failure must not show a success screen.
- [ ] Build saved-results view with Found/Accuracy/To fix, labeled marks, Practice
  and Home actions; use existing tokens/icons/celebration components. Celebration
  is only for confirmed Finish arrival and obeys Reduce Motion.
- [ ] Update the review spec's opponent-response wording and add native/browser
  pictures. Record actual evidence; do not call browser pictures native evidence.
- [ ] Run `pnpm tokens:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm export:ios`, and `pnpm export:web` from mobile. Confirm scripts exist before
  execution; use `pnpm exec expo export --platform web` if no web script exists.
  No Expo Doctor needed unless native dependencies/config change. Run backend
  `uv run pytest` with the dedicated test database for the day-guard change.
- [ ] Complete the spec's real-account iPhone and browser acceptance journeys.
  Review the final diff for answer leakage, user isolation and completion truth.
  Commit `feat: save mobile review completion and results`.

## Handoff

Recommended execution: implement directly in this session, task by task, with a
whole-change review before merging. The tasks share one lesson/recovery contract,
so sequential execution keeps those interfaces consistent. This recommendation
is not authorization to start implementation or spawn agents.

First action after scope approval: create the typed fixtures and failing
`review-lesson.test.mjs` tests in Task 1.
