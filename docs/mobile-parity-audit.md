# Web → mobile parity audit

Audited October 10, 2026 against checkout `631ba88`. This is the current
source-based inventory; earlier milestones in `migration-progress.md` are historical.
The initial audit involved no feature implementation, hosted data reads, deployment
or paid build. The read-only replay follow-up is reflected below.

## Recommendation

For the existing-user iPhone preview, deliver **guided review next**. The first
read-only replay slice was implemented after this audit on October 10. Home's suggested game and the Games list already navigate into
the replay screen. Completing the guided journey makes the existing learning path useful
and provides replay infrastructure for lessons, engine lines and saved bot games.

If the next milestone is letting **new users join without the web**, move account
linking/import ahead of review. Both are necessary before mobile can replace the web.
The priority order below assumes the current existing-user preview remains the focus.

## Current coverage

“Implemented” here means source exists, not that every platform/device is verified.

| Area | Mobile today | Remaining web functionality | Source evidence |
| --- | --- | --- | --- |
| Identity and shell | Clerk hosted sign-in, authenticated API, sign-out, four tabs, Settings stack, wide-browser sidebar | Automatic setup routing, linked-account ratings and update status in the shell; public privacy access | `mobile/src/lib/session.tsx`, `mobile/src/components/app-shell.tsx`; `web/src/components/app-shell.tsx`, `web/src/components/account-status.tsx` |
| Home | Server-backed units, learning path, suggested review, due positions, goal counters, other units; focus refresh and retry | One-time unit-complete celebration, rating summary; review/puzzle/play destinations still unfinished | `mobile/src/screens/home.tsx`; `web/src/pages/home.tsx` |
| Daily Practice | Server grading, tactic/piece/move hints, Show me, promotion, durable hints/retries, lost-response reconciliation, completion/results, explanation dialog | Connected recovery and accessibility acceptance checks; foreground/day-change freshness policy | `mobile/src/app/practice.tsx`, `mobile/src/screens/practice-position.tsx`, `mobile/src/lib/practice-flow.ts`; `docs/screens/practice.md` |
| Chessboard | Tap and drag, legal targets, flipping, arrows/badges, promotion overlay, motion, check/mate effects, sound and haptics | User preference controls and physical-device checks; do not re-port these existing capabilities | `mobile/src/components/board.tsx`, `mobile/src/components/board-piece.tsx`, `mobile/src/lib/board-sound.ts`, `mobile/src/lib/board-haptics.ts` |
| Games library | Authenticated pagination, accuracy/opening summaries, retry and buttons opening review routes | Search, quick filters/counts, speed/color/date/analysed/unrated filters, KPI deep links, day grouping, review state and richer game metadata; focus/foreground refresh and return-position behavior | `mobile/src/screens/games.tsx`; `web/src/pages/games.tsx` |
| Account setup/import | Welcome → Link Account → Import Progress navigation previews only | Source/handle input, lookup, confirmation, linking, real import progress/findings, resume, Ready and start-with-ready behavior | `mobile/src/app/{welcome,link-account,import-progress}.tsx`; `web/src/pages/welcome.tsx` |
| Game review | Read-only replay on the game and All moves routes: SAN positions, flip/orientation, last move, selectable strip and pinned navigation; Done remains a placeholder | Clocks/evaluation/history, key-moment lessons and hints, engine lines, variations, resumable lesson state, saved completion marks/results | `mobile/src/app/games/[id]/`; `web/src/pages/{review,review-moves,review-done}.tsx`, `web/src/lib/{replay,key-moments,find-move,variation,variation-tree}.ts` |
| Progress | Placeholder with Games/Puzzles links | Date ranges, rating history, KPI trends, deck composition/mastery, tactic patterns, units, strength/openings and filtered-game links | `mobile/src/app/(tabs)/progress.tsx`; `web/src/pages/overview.tsx` |
| Puzzles | Placeholder; Home supplies a theme parameter | Theme-based selection, setup move/opponent replies, solution sequence, hints, results and daily recording | `mobile/src/app/puzzles.tsx`; `web/src/pages/puzzles.tsx` |
| Play | Placeholder | Strength/color setup, bot turns, blunder check, hints, takeback/resign, resumed game, results/rematch, save and analysis/review handoff | `mobile/src/app/(tabs)/play.tsx`; `web/src/pages/play.tsx` |
| Settings and data | Signed-in account, sign-out, in-memory dark toggle, preview setup and privacy links | Persistent system/light/dark choice, board palette, best-arrow policy, default Progress range and sound switch; linked-account management, update status/history/run action, analysis controls/limits, export and staged account deletion | `mobile/src/app/settings.tsx`, `mobile/src/lib/theme.tsx`; `web/src/pages/settings.tsx`, `web/src/lib/{preferences,delete-account}.ts`, `web/src/lib/auth.tsx` |
| Privacy / developer tools | Privacy placeholder inside the session gate; no Admin/Styleguide | Actual public policy and support/contact entry. Keep Admin/Styleguide on the existing web app unless explicitly needed in the universal client | `mobile/src/app/privacy.tsx`, `mobile/src/app/_layout.tsx`, `mobile/src/lib/session.tsx`; `web/src/pages/{privacy,admin,styleguide}.tsx`, `web/src/main.tsx` |

## Ranked delivery slices

Estimates are rough developer time including focused checks, not commitments. Store
review, server import time and unavailable device/account access are excluded.

1. **Game replay → guided review: 4–7 developer days total.** First slice:
   1–2 days for game-detail loading, SAN replay (including custom start FEN),
   board orientation/last move, move list, start/back/forward/end and safe exits.
   Unanalysed games must still replay; show loading/error/not-found states. Then
   add clocks/evaluation, key moments, graded lessons, saved marks and completion;
   engine lines/variation exploration follow within this milestone. Search/filter
   polish can follow the first playable review rather than block it.
2. **Account setup and essential account/data controls: 3–5 developer days.**
   Deliver Pick → Found → Importing → Ready, automatic setup routing, resume and
   start-with-ready. Include linked accounts, remove/add, update action/status,
   import errors/limits, public privacy, export and staged backend/Clerk deletion.
   Split export/deletion into their own reviewable slice; retain confirmation and
   visible partial failure. Finish before a public standalone release.
3. **Progress and themed Puzzles: 3–5 developer days.** Port Progress's ranges,
   rating/KPI/deck/pattern/unit/opening sections and Games filter links, then the
   themed multi-move puzzle session and results. Reuse native board/lesson primitives.
   Puzzle answers use the puzzle contract; daily deck scheduling stays server-side.
4. **Preferences, freshness and remaining polish: 1–3 developer days.** Persist
   appearance and expose system mode, board/sound/best-arrow/range settings. Add a
   deliberate focus/foreground/day-change policy for Home, Games and Practice;
   Home already refreshes on focus. Restore unit-complete celebration and rating
   summary, shell account/update status, analysis settings and remaining Games
   metadata/filter polish. Ship refresh fixes alongside earlier slices when needed.
5. **Bot Play: 3–5 developer days.** Port setup, server bot/check calls,
   hints/takeback/resign, persistent in-progress state, result/rematch and save →
   analysis → review. The web already executes Stockfish on the backend; this
   does not require adding an on-device engine. Include timeout/quota/retry states.

## Contracts and dependencies

The routes below already exist in `src/knightly/api.py`; this audit identified
no need for a new database schema or a separate mobile backend.

| Slice | Existing contracts | Mobile dependency |
| --- | --- | --- |
| Replay/review | `GET /api/games/{id}`, `GET /api/games/{id}/lines/{ply}`, `POST /api/review/position`, `POST /api/games/{id}/review`, existing deck hint/answer APIs | Game/move/line types; replay and key-moment logic adapted away from web UI; user/server-scoped lesson persistence; quota/loading/failure handling |
| Setup/accounts | `GET /api/accounts`, `GET /api/lookup`, `POST /api/accounts`, `GET /api/onboarding`, `GET /api/settings`, `GET /api/status`, `POST /api/update/run`, `DELETE /api/accounts/{source}/{handle}` | Setup routing; cancellable foreground polling; explicit DELETE and empty-response support |
| Privacy/data/settings | `GET /api/export`, `DELETE /api/account`, `PUT /api/settings/analysis`; public policy content and config contact | Authenticated file export/share with native/web adapters; explicit PUT/DELETE/204 support; Clerk deletion/reverification flow; persistent preferences |
| Progress/puzzles | `GET /api/overview`, `/api/patterns`, `/api/home`, `/api/deck`, `/api/games` filters; `GET /api/puzzles/next`, `POST /api/puzzles/answer` | Charts and filter routes; dedicated puzzle sequence/session state |
| Play | `POST /api/play/move`, `/api/play/check`, `/api/play/games`, `/api/play/games/{id}/analysis` | Persisted game state and API cancellation; completed review destination |

The current mobile API selects only GET/POST from body presence and always parses
JSON. Extend it when account/settings operations need PUT/DELETE, 204 responses or
file responses. Replay and guided review can start on the existing adapter.

Retain Clerk identity, server grading and per-user isolation. The macOS schedule,
local database paths and backups are capability-specific, not missing native features;
honor server flags rather than porting desktop-only controls indiscriminately.

## Acceptance and verification

Source inspection and fresh mobile `pnpm lint` / `pnpm typecheck` passed for this
audit. Prior simulator/browser evidence is recorded in `docs/screens/practice.md`
and `mobile/README.md`; it was not replayed here. No claim of live staging parity,
physical-device acceptance or Android readiness is made by this inventory.

For each slice, use the phone/desktop screen specs and shared tokens; update the
spec/picture when its design changes. Run mobile lint, types, tests and token checks;
native dependency/config changes also require Expo Doctor and iOS export. Verify
the actual journey on iOS, and browser behavior separately for universal-client parity.

Before release, check connected interrupted practice, large text/VoiceOver/Reduce
Motion, physical sound/haptics/drag cancellation, Android installation/auth/back
behavior, and browser deep links/desktop interactions. Public privacy must be
readable before sign-in. `mobile/eas.json`'s production profile does not itself set
the API origin; confirm the build environment supplies the intended HTTPS URL and
validate it before release. Otherwise `SessionProvider` opens sample mode.

**Next bounded implementation task:** port the guided key-moment lesson on top of
the completed replay slice, preserving server grading and saving review marks only
when the user finishes the review.
