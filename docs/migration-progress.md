# Mobile migration progress and next steps

**Current inventory:** see [the October 10 parity audit](mobile-parity-audit.md)
for source-verified coverage and ranked delivery slices at `631ba88`. The sections
below preserve earlier milestones and contain historical route counts/gaps.

**Latest slice, October 10:** guided game review is implemented on the feature
branch: find/look/praise, hints, authoritative answers, scoped resume, replay
round-trip, explicit Finish and saved results. The board remains full width and
square-edged. Browser fixture journeys passed; guided native/live acceptance
remains because Device Hub controls did not respond. No paid build or deployment
was started. See the [review spec and pictures](screens/review.md#mobile-guided-review--october-10-2026).
The backend must deploy `server_day`/`expected_day` before distributing the client.
Verification: 99 mobile tests, lint, types, tokens, iOS/web exports and 166 backend tests passed. Clocks, graphs and interactive variations remain follow-up work.

Initial audit: October 9, 2026, commit `13c6111`. Historical sections below
record earlier slices; the latest status is this Practice follow-up.

Practice now has promotion choice (including required knight promotion), the
tactic/piece/move hint ladder, classification and previous-move context, a
clear completion summary, and durable hints/retries scoped by server/user/day.
Lost-response recovery reconciles saved in-flight cards with server results.
Browser checks cover stubbed connected answers and failures. The iPhone 18 Pro
simulator sample passed hints, wrong/correct recovery, Show me, knight promotion,
completion and Home exit. Connected on-device recovery and accessibility remain
release checks. Appearance persistence and foreground
refresh are separate unfinished work.

Follow-up verification: 36 mobile tests, lint, types, tokens, Expo Doctor (21/21)
and iOS/web exports passed. The real backend underpromotion regression passed.
The full backend suite is blocked for database-dependent tests by unavailable
local Postgres. The native sample interaction check passed; see the Practice spec.

Knightly has an iPhone preview with account sign-in and server-backed daily
practice. It is useful for an existing user whose games are already imported.
It is not yet a standalone replacement for the web app: a new user cannot link
a chess account, import games, or review a full game on mobile.

The next milestone is a complete phone journey: sign in, link a chess account,
follow the first import, practise, and see the saved result. Game review follows.
Prioritize iOS, where the preview already exists; validate Android before calling
the migration cross-platform complete. These priorities are a proposed work order,
not a claim that the unimplemented flows are verified.

## What is already in place

### Native shell and Home aligned to the phone design

The current local implementation supersedes the five-tab skeleton below:
Home, Games, Play and Progress are the four tabs; Settings is a top-bar gear that
opens a separate stack screen. Shared React Native components render the branded
SVG icons and sky selected state using Expo Router headless tabs. On wide web
windows the same routes use a sidebar, with Home's goal in a second column.

Home now shows the unit banner and check progress, completed/current/locked path
nodes, the current lesson card, goal counters, remaining units and today's completed
goal state. Signed-in Home requests `/api/home` on focus; failures show retry rather
than example data. The unconfigured preview explicitly labels its example unit and
launches the existing sample practice. One-time unit-complete celebrations and
rating history remain follow-up work.

Verified on the local iPhone 18 Pro simulator (iOS 27, Expo Go SDK 57): Home,
all four tabs, Settings gear and back, Practice launch and Home exit. The simulator
is displayed in Xcode 27's Device Hub. Browser checks covered the desktop sidebar,
Home/Games switching and selected-tab accessibility state. Lint, typecheck, all
16 existing tests, token consistency and both iOS/web exports passed. Live
authenticated Home data, large system text and Android were not replayed.

Next: review the native Home layout, then port the guided game-review lesson from
`docs/screens/review.md` without changing server grading.

### Platform direction decided

The target is one Expo client for iOS, Android and web, using React Native Web.
Implement iOS first while preserving that architecture. The current `web/` app
remains available during migration; retaining two separate UI products indefinitely
is not the plan. Share routes, domain logic, API contracts, design tokens and
reusable components. Isolate platform services and adapt the shell to the phone
and desktop designs. Keep web export working alongside native development, and
require browser feature parity and interaction checks before replacing `web/`.

### Design references refreshed

Pulled `origin/main` at `8add545` (per-screen design specs, #76) on October 9,
preserving the local navigation skeleton. Read `docs/design.md` and every spec in
`docs/screens/`; inspected the Home and Games phone frames. The phone frames are
the mobile layout reference, not just inspiration for colors.

Before extending the skeleton:

- Match Home's unit banner, learning path, current lesson card and goal counters.
- Match the phone shell's top bar, brand icons and sky selected state. The spec
  has four bottom tabs and a Settings gear; the local skeleton has five bottom
  tabs because that was explicitly requested. Resolve this difference before
  changing that approved navigation choice.
- Give placeholder screens their specified content structure: grouped Games,
  Play setup, Progress sections and the five Settings sections.
- Use the full-height, non-scrolling lesson layout and Home exit for Practice,
  Puzzles and review. Review complete returns Home and offers today's positions.
- Keep onboarding's four designed states (Pick, Found, Importing, Ready), even
  if they initially use explicit sample content rather than live imports.

The skeleton has navigation coverage; it does not yet meet these screen designs.
Next implementation task: align the native shell and Home layout with the phone
references, then verify them in the iPhone simulator.

### Navigation skeleton added after the audit

The first implementation milestone is now the app shell: five native bottom tabs
(Home, Games, Play, Progress, Settings). Practice launches from Home. Practice,
Puzzles, Welcome, Link Account, Import Progress, Privacy, and the three game-review
screens sit outside the tab bar. Existing sign-in, daily practice and the connected
games list are retained; unfinished screens are explicitly labeled placeholders.

This supersedes the initial three-route inventory below for navigation coverage,
but does not change those feature-parity assessments. The core journeys can now
be explored before their missing behavior is implemented. Home refreshes the
connected deck when focused; foreground refresh and preference persistence remain
separate work.

Skeleton verification: lint, typecheck, the 16 existing tests, token consistency,
iOS export and all 21 Expo Doctor checks passed. Browser walkthroughs covered all
five tabs, Practice launch/exit, Puzzles, account setup, Privacy and the review
placeholders. Authenticated flows were retained but not replayed with a live
account. Native interaction verification is still pending: the local Expo Go
simulator installation did not complete during this check.

| Area | Current implementation | Evidence |
| --- | --- | --- |
| Native foundation | Expo SDK 57, React Native 0.86, Expo Router stack, three screen routes, native SVG chessboard and Reanimated motion | `mobile/package.json`, `mobile/src/app/`, `mobile/src/components/board.tsx` |
| Identity and API | Existing Clerk instance, hosted sign-in, SecureStore token cache, fresh bearer token per API call, HTTPS server origin, request timeout and cancellation | `mobile/src/lib/session.tsx`, `mobile/src/lib/api.ts` |
| Daily practice | Server deck, graded answers, wrong-move return, piece/move hints, Show me, ungraded end-of-session retry, due date and daily results | `mobile/src/app/practice.tsx` |
| Account and games | Basic daily deck counts, sign-out, dark appearance, paginated imported-game list | `mobile/src/app/index.tsx`, `mobile/src/app/games.tsx` |
| Delivery and checks | Internal iOS preview and simulator build profiles; mobile CI checks tokens, lint, types, tests and iOS export | `mobile/eas.json`, `.github/workflows/ci.yml`, `mobile/README.md` |

Keep the deployed FastAPI backend, Clerk identity, server-side grading and user
isolation. Native clients must not connect directly to Supabase to recreate
grading or scheduling. Backend migrations remain in `src/knightly/migrations/`.

## Complete web route inventory

The web has 14 explicit screen routes in `web/src/main.tsx`. Mobile currently has
three screen routes: `/`, `/practice`, and `/games`. Route counts do not measure
feature completeness; several web flows span multiple routes.

| Web route | Mobile status | Migration disposition |
| --- | --- | --- |
| `/` | Partial: deck counts and account controls; no learning units, suggested game review or puzzle entry | Nativize after onboarding and review |
| `/practice` | Core flow implemented; remaining parity and device checks below | Harden now |
| `/games` | Partial: list and load-more only; no game action, search or filters | Native list now; connect to review next |
| `/welcome` | Missing: source selection, handle lookup, confirmation and import progress | Nativize now |
| `/settings` | Only sign-out and an in-memory appearance toggle on Home | Native account/update/data controls now; advanced controls later |
| `/privacy` | Missing: no public mobile policy entry | Expose existing policy during account/settings work |
| `/games/:id` | Missing: guided review, key moments, engine explanations and variations | Nativize next |
| `/games/:id/moves` | Missing: move navigation, board replay and evaluation graph | Nativize with review |
| `/games/:id/done` | Missing: review results, completion and next learning action | Nativize with review |
| `/progress` | Missing: rating history, KPIs, units, openings and tactic patterns | Nativize after review |
| `/puzzles` | Missing: theme selection, puzzle play and session results | Nativize after review |
| `/play` | Missing: bot play, blunder checks, saved games and analysis | Nativize later |
| `/settings/admin` | Missing | Keep web-only unless native administration is explicitly needed |
| `/styleguide` | Missing | Keep web-only developer reference; mobile tokens already share its palette |

No DOM-component bridge is present. Continue the existing native implementation;
do not rebuild completed native screens inside a webview. Until a flow is ported,
provide an explicit web action where useful rather than telling users a feature
is available elsewhere without a working link. Opening the web is a temporary
handoff, not proof of native parity.

## Gaps inside the existing mobile flows

1. **Promotion choice (resolved in the Practice follow-up):** the initial audit found that `mobile/src/app/practice.tsx` always submitted promotion
   to a queen. The piece-motion helper handles promotions, but the screen cannot
   submit a knight, bishop or rook promotion. Add a picker before submitting and
   cover an underpromotion practice position.
2. **Teaching parity (resolved in the Practice follow-up):** the web hint ladder includes a tactic hint when available,
   then piece and move hints. Mobile starts at the piece. Its practice view also
   omits the web's tactic explanation, classification, winning-chance context and
   initial previous-move highlight. Preserve server grading while restoring the
   meaningful teaching context.
3. **State persistence and freshness:** appearance mode lives only in React state.
   Home and Games fetch on their effect dependencies, without explicit focus,
   foreground or pull-to-refresh handling. Persist preferences and verify that
   returning from practice or an import shows current counts. Treat stale-data
   reproduction as a device check, not an already reproduced runtime bug.
4. **API expansion:** the mobile adapter currently supports GET/POST JSON only.
   Account unlinking, analysis settings, account deletion and export need explicit
   methods, empty-response handling and authenticated file downloads. A settings
   port cannot simply call the current JSON adapter for these endpoints.
5. **Release configuration:** `preview` provides the hosted API URL, while
   `production` does not declare one. Without a configured URL, the app opens
   sample practice. Configure and validate the intended production environment
   before making a release; verify Android auth configuration independently.

## Ordered implementation checklist

### 1. Harden the current practice flow

Estimated implementation: 1–2 developer days, plus device checks.

- [x] Add promotion selection and a regression test for a required underpromotion.
- [x] Restore tactic hints and post-answer teaching context; retain first-answer
  grading and `redo` semantics on the server.
- [ ] Persist appearance preferences and add a deliberate refresh policy for
  Home/Games after practice, import and foregrounding.
- [ ] Test wrong answer, hint, Show me, network failure, session rejection and
  repeat taps without duplicate grading; test interrupted and resumed practice.
- [ ] Check large text, Reduce Motion, VoiceOver square announcements, lesson exit
  and Hint controls and narrow-screen action reachability on iPhone.

Acceptance: ordinary and underpromotion positions are playable; only intended
graded answers affect scheduling; Home shows current progress after returning.

### 2. Make a new account useful entirely on the phone

Estimated implementation: 2–4 developer days, depending on account/data controls.

- [ ] Add `/welcome`: Chess.com/Lichess selection, handle lookup, confirmation,
  linking and first-import progress using `/api/lookup`, `/api/accounts`, and
  `/api/onboarding`.
- [ ] Add minimal Settings: linked accounts, update action/status, limits and
  actionable empty-deck states; respect server capability flags for local-only
  features such as the macOS schedule.
- [ ] Extend the API adapter for required methods, 204 responses and file download;
  keep authorization headers and cancellation behavior consistent.
- [ ] Expose privacy, data export and account deletion. Reuse the web's staged
  deletion behavior so a failed Clerk deletion remains visible and retryable.
- [ ] Verify on staging with a dedicated test account; check signed-out access and
  cross-user denial without querying production user rows.

Acceptance: a fresh user signs in, links a chess account, watches import/analysis,
and reaches a real practice card without needing the web app. Account operations
have clear error and retry states.

### 3. Port the game review journey

Estimated implementation: 4–7 developer days for the full flow; deliver it in slices.

- [ ] Make game rows open `/games/[id]`; add search/filters and retain list position.
- [ ] Deliver read-only game replay and `/games/[id]/moves` using existing game
  detail data before adding interactive lesson behavior.
- [ ] Add key-moment lessons, find-a-better-move steps, engine lines and a review
  completion screen that saves marks through `/api/games/{id}/review`.
- [ ] Add variation exploration and continuations through the existing review
  preview endpoint, including loading, quota and failure states.
- [ ] Compare native behavior with the web journey and the saved prototypes in
  `work/`; use `docs/review-variations.md` for the existing variation semantics.

Acceptance: an imported game can be opened, replayed, reviewed and completed on
the phone, with persisted marks and safe back navigation. Treat the prototypes
as design references, not implemented functionality.

### 4. Restore the learning overview and puzzles

Estimated implementation: 3–5 developer days.

- [ ] Expand Home with units, a suggested review and the puzzle entry using
  `/api/home`, while preserving the quick daily-practice path.
- [ ] Port Progress with date ranges, rating/KPI history, deck counts, tactic
  patterns and links into filtered games.
- [ ] Port themed puzzles and daily results through the existing puzzle endpoints;
  preserve their current backend contract rather than conflating them with deck
  answer grading.
- [ ] Check empty, loading, failed and limited-data states for each screen.

Acceptance: a user can understand progress and act on it without leaving mobile.

### 5. Finish parity and release validation

Estimated implementation: 4–7 developer days; store review time is separate.

- [ ] Port Play: bot turns, promotion, blunder checks, game save and analysis.
- [ ] Finish board preferences, advanced settings, drag gestures and optional
  sound/haptics after core chess flows work. Assess native Expo UI controls when
  designing each screen; avoid an unrelated whole-app component rewrite.
- [ ] Verify Android installation, auth callbacks, navigation/back behavior and
  chess interactions; SDK/config support alone is not an Android acceptance test.
- [ ] Configure production API origin and release identifiers; validate signing,
  versioning, store assets and account/privacy flows before submission.
- [ ] Run the complete native regression checklist on release candidates. Make any
  paid EAS build or store submission an explicit release task.

Acceptance: the intended iOS/Android scope is documented, tested on real devices,
and releasable. Admin and Styleguide remain intentionally web-only.

## Verification status

| Check | Result at this checkout |
| --- | --- |
| Frozen-lockfile dependency install | Passed; Node 22.22.2, pnpm 10.33.2 locally. README/CI use pnpm 12; align before reproducing CI tooling exactly. |
| Mobile lint and typecheck | Passed earlier in this session at the audited commit |
| Mobile tests | 16 passed earlier in this session; helper/API contract tests, not rendered-screen or device tests |
| Shared token consistency | Passed during this audit |
| iOS Hermes export | Passed during this audit; compilation evidence only |
| Expo Doctor | 21/21 checks passed during this audit |
| Mobile CI coverage | Configured for tokens, lint, types, tests and iOS export; no native interaction suite |
| Latest EAS preview | MCP reported latest iOS internal preview finished; version 0.1.0, SDK 57 |
| iPhone sign-in and real practice | Recorded as confirmed October 9 in `mobile/README.md`; not replayed in this audit |
| Local simulator tools | Xcode 27, working `simctl`, iOS 27 runtime installed |
| Native behavior parity / Android | Not exercised in this audit; still an acceptance gate |

For each implemented slice, run `pnpm lint`, `pnpm typecheck`, `pnpm test` and
`pnpm tokens:check` in `mobile/`. For native dependency/config changes also run
Expo Doctor and iOS export. Record the tested platform, account environment,
screens and outcomes for native acceptance; do not mark a route complete solely
because it exports successfully.

**Next bounded task:** validate one guided imported-game review on iPhone, including replay return and saved results. Connected recovery and accessibility remain release checks.
