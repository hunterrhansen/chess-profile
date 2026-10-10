# Guided mobile game review: audit and proposed first slice

Status: proposed for review; no product code changed. Audited October 10, 2026 at
`b6203a8` (PR #85). This is a source audit, not a live authenticated web walkthrough.

## Intent

Complete the existing-user learning path: a player opens an analysed game, works
through its teachable moments, and explicitly finishes a saved review. Preserve
Clerk identity, server grading and the replay shipped in #85. The first slice must
be usable end to end on iPhone; browser support remains part of the universal app.

## What the web actually does

| Stage | Current behavior | Evidence |
| --- | --- | --- |
| Entry | `/games/:id` loads game detail; `/moves` is full-game browsing. Unanalysed or replay/analysis mismatch redirects to moves. | `web/src/pages/review.tsx`, `web/src/lib/replay.ts` |
| Selection | Own brilliant/great/mistake/blunder/miss moves, plus own response to an opponent's >=20-point winning-chance drop. Responses already included are deduplicated; moments are sorted by ply. Sound responses become praise, including `best`. | `web/src/lib/key-moments.ts`, `classification.ts` |
| Step kind | Sound moment → praise. Bad moment in `deck_plies` → find. Other bad moment → look. Find shows the position BEFORE the move; look/praise show AFTER it. | `key-moments.ts`, `review.tsx` |
| Find | Legal tap/drag move submits to deck answer. Wrong answers reset and permit retries. Hints progress through tactic (when available), piece, arrow; Hint waits two seconds. Show me sends `0000`. Accepted outcomes map found/good/helped/shown → found/good/helped/missed. | `web/src/lib/find-move.ts`, `components/find-bar.tsx` |
| Grading | First answer of the server day updates FSRS. Hint or wrong/show-me means Again; a good accepted alternative can mean Hard; a quick best move can mean Easy. Later answers that day do not reschedule, but successful retries record solved. Cards can sync on the first answer before Finish review. | `src/knightly/deck.py:answer`, `hint`; `api.py:deck_answer` |
| Explanation | After find is resolved, or on look, engine lines supply a summary. Praise uses classification text. Web also supports before/after, full engine lines, free variations and bounded Stockfish previews. | `review.tsx`, `replay.ts`, `variation.ts` |
| Resume | Browser storage saves step and marks under game ID; URL `step` can select a step. The find hook itself resets on remount, so answer/hint state is not fully restored. | `review.tsx:loadProgress/saveProgress` |
| Finish | Only explicit Finish review posts all marks. Missing marks default to praise/seen. Success clears local progress and opens done; error currently just re-enables the button. Re-finishing replaces marks and advances the timestamp. Quiet analysed games can finish with zero marks. | `review.tsx:finish`, `api.py:finish_review` |
| Results | Reloads server `review_marks`; found/good count as found, helped/missed as needing another go, praise/seen are excluded from the question count. Phone shows trophy, Found/Accuracy/To fix, marks, Practice/Home exits. Celebration only on arrival from finishing. | `web/src/pages/review-done.tsx` |

### Discrepancies and constraints to carry forward

- `docs/screens/review.md` says opponent misses are not lesson steps. Actual code
  includes the USER'S response to an opponent blunder, not an opponent solve step.
  Preserve that distinction and reconcile the spec when implementation lands.
- Web local progress is game-only, not account/server scoped. Mobile must use
  `practiceScope` (server origin + Clerk user ID), game ID and a lesson fingerprint.
- Web move labels infer numbering from ply. Mobile must use replay's actual side
  and full-move number for custom starting FENs.
- Mobile `GameDetail` currently omits selection/result fields. Add typed analysis,
  deck membership, accuracy and review marks; do not assume every bad move is a card.
- `PracticePosition` owns daily progress, exits and redo mechanics. Reuse helpers
  and lesson components; do not pass fabricated daily counts or fork the whole screen.
- Existing lesson shell limits width/board height. Guided review must preserve the
  user's full-width square-edged board requirement, with scrollable content and
  pinned actions rather than shrinking the board to fit the screen height.
- Review input allows at most 200 marks. An oversized lesson must show a clear
  unsupported state with replay available, not silently omit marks or partially save.
- Deck responses do not expose the server day, while grading uses server
  `date.today()`. The existing mobile UTC-day guard cannot guarantee a retry
  remains ungraded at the server midnight boundary. Include additive server-day
  metadata and an optional expected-day answer guard in this slice; no migration
  is needed. Old clients remain compatible.
- Finish is an upsert, not an idempotency-key API. A lost finish response can be
  reconciled through game detail; explicit retries can advance the timestamp.
  There is no atomic server transaction combining individual answers with finish.

## Recommended scope and alternatives

**Recommended: complete basic guided journey (estimate 3–5 developer days).**
Find/look/praise, durable progress, optional explanation text, explicit completion,
and a compact saved-results screen. It has a visible outcome and tests the real
server contract without adding interactive exploration.

A read-only key-moment tour is smaller but leaves the learning/deck contract
unfinished. Full web parity adds lines, variations, evaluation and clocks to the
same change and makes recovery harder to review. Defer those to subsequent slices.

## Proposed behavior

1. `/games/[id]` becomes guided review; `/games/[id]/moves` remains replay.
   Unconfigured sample replay stays read-only. Unknown player color, unanalysed
   games, invalid FEN/SAN or misaligned analysis offer replay with a reason and do
   not submit answers/completion. An analysed, aligned game with zero moments gets
   the quiet-game state and explicit Finish review.
2. Show Key moments progress, Exit to Games and All moves. All moves starts at
   the lesson's ply, returns to the existing lesson, and preserves its state.
   The board remains full width, square-edged and oriented to the player's side.
   Prompt and explanations can scroll; Hint/Show me/Continue stay reachable.
3. Find uses legal native board interaction including underpromotion. The server
   alone accepts/rejects/schedules moves. Wrong moves return to the initial position;
   hints and misses persist. No Continue before a resolved answer. Look/praise
   receive seen/praise when Continue is pressed. Do not reveal best-move text in
   find prompts before answer/hint; web headlines can contain spoilers.
4. Optional explanation summaries load only after resolution/on look. Engine
   unavailable/quota/network errors show retry and a factual fallback, never block
   Continue or imply engine analysis succeeded. No Show the line action yet.
5. Persist current step, first response, outcome, hint count/move, submitted UCI,
   start time, pending attempt and marks. Scope by server/user/game/fingerprint;
   preserve resolved learning progress across dates, but reconcile pending answers
   against `/api/deck` on reopen/foreground before accepting another graded attempt.
   Storage failure is visible; learning can continue in memory without claiming
   durable resume. Stale responses from a previous identity never affect the new one.
6. Explicit Finish persists the exact full ordered mark set as pending before POST.
   During save, block duplicate actions. On success clear the session and replace
   with done. On failure preserve state and show Retry. After an ambiguous response,
   refetch game detail and compare saved marks and reviewed timestamp with the
   pre-request baseline before deciding whether completion was saved. Matching an
   old review alone is not proof of this finish. Never automatically resend across
   an identity or day change. Exit/replay/answer actions never mark the game reviewed.
7. Done loads server marks and shows Found, Accuracy, To fix and accessible moment
   marks, with Practice and Home exits. Missing/unreviewed data shows a truthful
   state rather than the current success placeholder. Celebrate only after confirmed
   completion; respect Reduce Motion. Refocus Home to refresh its review counter.

## Recovery policy

Use shared `PracticeSession` hint/pending bookkeeping where useful so review and
Practice cannot disagree about help already used. Keep review step/marks in a
separate scoped `ReviewSession`; do not couple advancement to the daily redo queue.
Refresh `/api/deck` on entry and pending-answer recovery. Today's server result is
scheduling evidence, not a substitute for the exact answer response. If an answer
response was lost, keep its recorded hint/miss history, conservatively classify a
later success as helped and ask the player to solve again; the server prevents a
second same-day schedule change. Do not claim first-try found from incomplete data.
At a date boundary, retain lesson progress but pause unresolved attempts and show
an explicit restart-this-position action after refreshing current deck state. Never
silently turn a yesterday retry into today's first answer.

## Contracts (no schema change proposed)

- `GET /api/games/{id}`: SAN/start FEN, analysed plies, color, `deck_plies`, accuracy,
  `review_marks`, `reviewed_at` through game facts.
- `POST /api/deck/answer`: `{game_id, ply, uci, hinted, redo:false, seconds, expected_day}`;
  response is existing `DeckAnswer`. Clamp finite think time to 0–86400 seconds.
- `POST /api/deck/hint`: `{game_id, ply}` → `best_uci`.
- Add `server_day` (ISO date) to `GET /api/deck`; add optional `expected_day`
  to AnswerIn. Check it against the same captured server date used for grading
  before any scheduling mutation; return 409 on mismatch. Keep it optional for
  existing clients.
- `GET /api/deck`: authoritative today's results for pending recovery and shared
  Practice reconciliation. `GET /api/deck/feedback/{id}/{ply}` is optional prepared
  feedback; it cannot prove a save and is not required for this slice.
- `GET /api/games/{id}/lines/{ply}`: optional `best.summary` explanation;
  account/ply-scoped, cancellable cache with retry. No `/api/review/position` calls.
- `POST /api/games/{id}/review`: `{marks:[{ply,mark}]}` → `reviewed_at`.

## Acceptance gate

Automated: selection/deduplication, both colors/custom FEN, alignment guards,
find/look/praise, accepted alternatives, hinted/retry/show-me marks, promotion,
scoped persistence/corrupt storage, response loss/day rollover, duplicate finish,
finish failure/reconciliation and results counts. Existing Practice/replay tests
must remain green. Run mobile tokens, lint, typecheck, tests, iOS and web exports.
Run backend tests with a dedicated test database for the additive day guard; never
use hosted production data for tests.

iPhone: real analysed game with all three step types; wrong→retry, hint→solve,
Show me, underpromotion fixture, exit/reopen and All moves round-trip, offline
answer and finish recovery, quiet/unanalysed cases, account switch, large text,
VoiceOver, Reduce Motion, short screen and pinned controls. Browser separately.
Update screen spec and native/browser pictures with the implemented UI. Native
replay acceptance from #85 is still outstanding and should be checked here.
