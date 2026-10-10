# Practice latency investigation — October 9, 2026

Recommendation: prepare practice move feedback before the learner plays, then
render feedback locally while the server verifies and saves the attempt. Start
with immediate piece animation and server timing instrumentation; retain support
for alternative good moves and authoritative server-side scheduling.

## What is confirmed

| Wait | Evidence | Effect |
| --- | --- | --- |
| Phone waits before moving the piece | `mobile/src/screens/practice-position.tsx`: `setFen(after)` is after `/api/deck/answer` and `finishAnswer` | Network, database and engine latency look like an unresponsive board |
| Every legal alternative starts a fresh engine | `src/knightly/deck.py:judge`: `popen_uci` inside each call | Startup and a cold engine hash on every such attempt |
| Unbounded wall-clock search | Judge uses only `Limit(depth=14)` | Difficult positions and server load can extend the wait; no explicit time/node ceiling |
| Repeated attempts repeat search | No judge cache | Same card/move pays again, including the end-of-session redo |
| Even the known best waits for the server | Best equality short-circuits engine work, but mobile still awaits the POST | Correct answers still depend on network/database/local storage |
| Additional serialized work | First answer awaits local pending storage before POST, then local settlement storage before feedback; redo GETs `/api/deck` before POST | Additional latency, though storage protects recovery and must not simply be removed |
| Explanation is a separate cold computation | Mobile requests `/lines/{ply}` only after outcome; endpoint computes best and played lines at default depth on a miss | Explanation can appear later; it does not block the initial verdict |

`deck.answer` keeps a database connection and transaction open during the engine
search, then performs scheduling queries and writes. Hosted database round trips
and CPU contention are possible contributors; their costs are not measured yet.
`/api/deck` also synchronizes cards and tags patterns before returning its next
card, so the redo refresh may be more than a cheap existence check.

The grader currently converts engine failure into `wrong`. Performance changes
must also prevent an unavailable/timed-out engine from recording a false failure.

## Measurements and limits

Local microbenchmark, 100 calls per case, isolates `judge` only:

- Stored best: median below 0.001ms (no engine).
- Illegal UCI move: median 0.003ms (no engine).
- Show answer: median below 0.001ms (no engine).

One public production health probe using curl returned HTTP 200 in 519ms. This
includes transport and the health database check. It is not an authenticated
answer timing, a network-only timing, or a percentile measurement. Python's
urllib probe was rejected with HTTP 403; curl succeeded.

Local Stockfish is not installed. An attempted read-only server engine benchmark
could not connect because the documented local deploy key is absent and host trust
was unavailable. No host-trust bypass, production game reads, answer writes, or
configuration changes were performed. Exact production engine/search/DB timing
remains unmeasured.

## Why Lichess feels immediate

Lichess puzzle `moveTest.ts` compares the played UCI sequence to the solution
already present in the puzzle data (including castle normalization and accepting
checkmate). `ctrl.ts` applies feedback locally and sends the result separately.
Analysis is enabled after solving/viewing, rather than used to validate every
puzzle move. This is a verified puzzle implementation, not a claim about every
Lichess mode or the proprietary internals of Chess.com/Duolingo.

Sources:
- https://github.com/lichess-org/lila/blob/master/ui/puzzle/src/moveTest.ts
- https://github.com/lichess-org/lila/blob/master/ui/puzzle/src/ctrl.ts

Knightly deliberately accepts alternative excellent/good moves (2/5 winning-
chance point thresholds). Comparing only the stored best would change that rule.

## Implementation order

1. **Immediate board response and measured backend.** Animate a legal move on
   submission, show “Checking…” while needed, retain retry state on save failure,
   and restore the position predictably. Separate verdict rendering from local
   settlement storage without weakening durable first-attempt recovery. Add
   timings for token, pending write, network, engine startup/search, database,
   save and feedback. Measure cold/warm best and alternatives separately.
2. **Compute once, reuse.** Prepare a versioned grading map for each card before
   it is served, covering all legal UCI moves including promotions, using the same
   server grading thresholds and reference evaluation. Prioritize today's current
   and next cards in the background worker; deduplicate identical work. Cache keys
   include exact position, best/reference evaluation, engine/search policy and
   grading version. Use a bounded reusable engine pool with exclusive per-engine
   jobs and CPU limits. A time-limited incomplete evaluation is not automatically
   a definitive wrong answer. Keep preparation outside request transactions.
3. **Local feedback, verified background save.** Download the prepared grading map
   with the card and use it for instant feedback/hints; keep server verification
   and FSRS authoritative. Introduce a durable attempt outbox containing UCI,
   hint state, elapsed time, user/day scope, ordered attempt ID and save status.
   Server idempotency must prevent duplicate grades; first-attempt semantics must
   survive retries, reopening, multiple devices and midnight. Clearly display
   unsaved/retry status. Prefetch next cards and explanations without revealing the
   solution until requested. Unprepared alternatives fall back to the server.

The known-best/mate subset can be made immediate earlier, but other moves must
not be called wrong just because they are absent from that partial subset. It is
safer to show pending feedback than a false grade. Client maps are presentation
hints, never permission to accept a client-supplied grade.

A native Stockfish engine or browser WASM engine is a later option for freeform
analysis. It adds native build, battery, engine-version and cross-platform costs;
precomputed practice grading addresses this narrower problem without requiring it.

## Acceptance targets (proposed, not measured results)

- Legal piece movement begins within 100ms of the final tap on a physical phone.
- Prepared verdict appears within 100ms, independently of network latency.
- Warm authenticated save p95 below 500ms; collect baseline before committing SLA.
- Repeating a prepared move performs zero new engine searches.
- Preserve alternative good moves, legal mate, required underpromotion, hint grade,
  first-answer-only FSRS, durable retry recovery and user isolation.
- Test delayed network, failed save then retry, out-of-order replies, duplicate
  submissions, cache invalidation, day rollover and engine timeout/unavailability.

This audit changes documentation only. Prior board-context edits remain separate
uncommitted work; no deployment or new Expo build was started for this investigation.

## First implementation

Implemented immediate mobile attempt preview, explicit checking feedback, rollback
on failed requests, and tap-time elapsed capture. Durable preparation and local
settlement remain ordered around the authoritative POST. Development console
diagnostics report preparation/API/settlement totals, plus token acquisition,
HTTP+JSON wait and any Server-Timing header, without move/user/token payloads.
Production mobile builds do not print these diagnostics.

The answer endpoint logs phase durations and returns Server-Timing for card load,
position reconstruction, grading (including engine startup/search when needed),
scheduling/save SQL, answer body and total including connection/transaction exit.
Phases overlap: engine search is within grade, schedule/save is within answer, and
answer is within total; do not add them together. schedule_save excludes commit;
answer_total includes it. Authentication middleware runs before these timings.
Engine policy and verdict semantics are unchanged. Failed requests are logged too.
No logging contains user IDs, moves, credentials or request bodies.

This is responsiveness and instrumentation only; precomputed feedback, engine
reuse/cache and background verified saves are still the next implementation stages.
