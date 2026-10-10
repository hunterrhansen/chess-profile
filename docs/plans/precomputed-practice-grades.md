# Precomputed practice grades

Implement a versioned, per-move JSON grade cache on the existing RLS-protected
moves table. The existing worker prepares today's due cards in bounded batches,
using one single-threaded Stockfish process per batch, outside transactions. The
API queues preparation without waiting, supplies valid cached feedback with the
card, and uses that same cache before scheduling an answer. Cache identity binds
full FEN, best move, reference evaluation, grading/search policy, and engine build.
Incomplete searches omit moves; absent/stale grades use live server grading.
Engine failures return an unavailable error rather than scheduling a wrong grade.

The phone flashes prepared feedback immediately and labels it as saving. Final
success and Continue still require the authoritative response and a local settlement attempt (existing best-effort
storage behavior). Failed saves roll back as before. Unknown moves stay “Checking…”.
This stage does not add offline grading or a background attempt outbox.

Verification: grading thresholds, mate and promotion handling, incomplete-search
fallback, fingerprint invalidation, worker deduplication/batching, cache-backed
answer skipping Stockfish, unchanged first-answer scheduling, cache RLS, immediate
client feedback without early Continue, delayed/failed save recovery, and full
backend/mobile suites on an isolated local test database. No hosted writes.
