# Practice

Today's positions from your own games: find the move you missed. A lesson, full screen, no
navigation. Puzzles (`/puzzles`) use the same screen and rules.

**Code:** `web/src/pages/practice.tsx`, `pages/puzzles.tsx`, `components/lesson-bar.tsx`,
`components/find-bar.tsx`, `lib/find-move.ts`; scheduling in `deck.py`. **Built**
([#32](https://github.com/hunterrhansen/knightly/pull/32), Easy in
[#40](https://github.com/hunterrhansen/knightly/pull/40), FSRS tuning in
[#41](https://github.com/hunterrhansen/knightly/pull/41)). Rules in design.md › Lessons.

![A position](img/practice.png)

| Try again and Hint | Every bar and its grade |
| --- | --- |
| ![Try again and Hint](img/practice-flow.png) | ![Every bar](img/practice-bars.png) |

| Done for today | Phone: right answer | Phone: one more go |
| --- | --- | --- |
| ![Done for today](img/practice-done.png) | ![Phone](img/practice-phone.png) | ![One more go](img/practice-redo-phone.png) |

## Layout

- **Top:** ✕ (back Home) and the progress bar, "3 of 10".
- **Prompt:** pills (New or One more go, the game it came from, the move's badge), then the
  heading "You played Qxc8 here. Find a better move." and a line with the side to move and
  your winning chance then.
- **Board**, as big as the space left. Tap or drag a piece; legal moves show as dots and rings.
- **Bar along the bottom:** Skip and a line of help before you answer; the verdict after.
- **Done for today:** a check medal, "10 positions reviewed. 7 right, 3 back tomorrow", a row
  of marks with the misses named, and tiles for Mastered, Learning, Not seen yet. See your deck
  and Back home.

## Forgiving practice (decided Oct 7, replaces "one answer a day")

Why: learning beats engagement. Only 1 of the first 10 Practice answers was right, and each
miss was a dead end.

- **Try again:** a wrong move slides back: "Not quite. Try again, or use a hint."
- **Hint,** two steps as on Lichess: Hint lights up the piece to move, then the button becomes
  Show the move and draws the arrow. When the position has a tactic, a first step names it
  ("Look for a fork…"). Live two seconds after the position appears (Chess.com's top complaint
  is accidental taps). Show me stays separate and gives the answer.
- **One more go:** positions you didn't get on the first try come back once at the end of the
  session. The session ends when each is solved; that go doesn't change the grade.

## Grades

FSRS, the scheduler Anki uses by default (chosen over SM-2), with default settings until there
are a few hundred reviews; `knightly fsrs-optimize` tunes it after 512. The app presses Anki's
buttons for you, from your **first try only**:

| First try | Grade |
| --- | --- |
| The engine's move within 10 s, no hint | Easy |
| Best, or within ~2 points of win chance | Good |
| Within ~5 points ("Good move! Best was …") | Hard |
| Right on a retry, after a hint, or shown the move | Again |

Any checkmate counts as best. The same rules apply to the review lesson's find steps and to
Puzzles (nothing is sent to Lichess).

The Done for today picture still says "mastered after 4 right in a row"; that line predates
FSRS, so take the wording from the app.

## Expo lesson shell — October 9, 2026

Sample and connected practice now share `mobile/src/components/lesson-screen.tsx`.
The active lesson is a full-height flex layout with no ScrollView: × exits to Home,
the header contains session progress, the prompt sits above the board, and feedback
and actions stay in a full-width band above the bottom safe area. The board fits
both available width and remaining height, including its 4px ledge. The prompt
and Hint provide guidance without a header question mark. Appearance
controls remain in Settings.

Hint (with the brand bulb), Show me and Flip live in the idle/retry band. Correct
answers replace them with a green verdict and Continue; showing the move uses the
red verdict and Continue. Hints unlock after two seconds. The connected flow keeps
the existing server answer/hint calls, first-attempt grading and end-of-session
redo queue. Sample practice is explicitly local and never updates the real deck.
Completion uses a concise summary and result marks instead of a scrolling list.

| iPhone: before answering | iPhone: larger text |
| --- | --- |
| ![Native practice lesson](img/practice-ios-preview.png) | ![Native practice with larger text](img/practice-ios-large-text.png) |

The floating blue gear is Expo Go's development overlay, covering part of the header;
it is not part of the lesson design. Native captures were checked at normal and
accessibility-large text. Text in the bounded lesson chrome scales up to its local
limit; it does not disable system text scaling globally.

The shared flow was exercised through React Native Web at 390×844 and 320×568:
wrong move and reset, recovery with the correct move, Continue, Show me, completion,
and × exit to Home. The short-screen document height stayed at 568px, with actions
inside the viewport. The same sample flow passed in the iPhone 18 Pro simulator:
wrong move and automatic reset, correct recovery, Continue to the next position,
Show me, completion, and × exit back to Home. Connected grading and network failure
recovery were not replayed against an account.
After integrating the latest main, lint, typecheck, token consistency, all 25
existing tests, Expo Doctor (21/21), and iOS/web exports passed.

![Native correct-answer feedback and fixed Continue button](img/practice-ios-right.png)

### Motion follow-up

The question mark is removed; the prompt and Hint provide lesson guidance.
Practice keeps the default iOS push/pop transition and immediate feedback/progress
updates. The experimental fade, verdict entrance and progress-fill animations
were reverted after device review. Refine motion in a later design pass.

### References checked

- The web `LessonScreen`, `LessonBoard`, `LessonBar` and `FindBar`, plus the phone
  screenshots above, are the direct layout reference and brand source.
- [Duolingo's lesson examples](https://blog.duolingo.com/duolingo-101-how-to-learn-a-language-on-duolingo/)
  provide the focused exercise and answer-control structure. Knightly retains its
  own task, typography, icons and feedback rules.
- [Chess.com's Daily Puzzle flow](https://support.chess.com/en/articles/8708990-how-does-the-daily-puzzle-work)
  provides a board-centered solving and hint reference. Knightly's no-scroll,
  bottom-band layout follows its existing practice specification; it does not add
  Chess.com's hearts, subscriptions or puzzle economy.

### Practice parity follow-up — October 9, 2026

Connected and sample lessons now offer Queen, Rook, Bishop and Knight promotion
choices in the bottom band. Selecting a piece does not submit an answer; the
confirmation button sends the exact promotion UCI. The third sample position
requires a knight: a queen stalemates. Server grading evaluates the chosen piece.

Hints follow the web ladder: tactic idea (when recognized), highlighted piece,
then move arrow. The prompt includes the move classification and previous move;
feedback retains the server explanation and next review date. Completion separates
independent answers, answers with help, and misses.

Connected practice stores hints and unfinished retries on the device, scoped to
the server, signed-in user and UTC day. In-flight cards are saved before answering;
on reopening, server results recover misses/helped cards after a lost response.
Completed retries are removed, and server results discard stale cards. The server
continues to own first-answer grades and scheduling; retries use `redo: true`.
Storage failure leaves the current session usable but cannot guarantee recovery.

![Promotion choice in the Expo browser client at 390×844](img/practice-web-promotion.png)

Browser checks used sample positions and stubbed connected API responses: hint
ladder, wrong/correct recovery, exact knight payload, Show me, unchanged redo
schedule, request failure/retry, sign-in rejection and repeated taps. At 320×568,
actions stayed inside the viewport. The native follow-up check is recorded below; the earlier iPhone captures show
the previous lesson shell.

Follow-up checks: mobile lint, typecheck, token consistency, all 36 tests,
Expo Doctor (21/21), and iOS/web exports pass. The backend underpromotion
regression passes. The full backend run has 51 passing tests and 4 skips;
95 database-dependent tests could not start because local Postgres is unavailable.
No hosted database was used for tests. The installed iPhone preview does not include this follow-up.

### Native follow-up verification — October 9, 2026

On iPhone 18 Pro / iOS 27 in Expo Go SDK 57, the three-position sample passed:
wrong move and automatic return, tactic/piece/move hint ladder, correct recovery,
Show me, Continue, required knight promotion, session completion and Back home.
Home now consistently labels the sample as three positions.

The iOS promotion control uses a compact native segmented picker: Queen, Rook,
Bishop and Knight are visible together. Choosing Knight updates the confirmation
button without moving the pawn; confirmation produces the knight and checkmate.
Android and web use the universal dropdown. During native automation the popup
menu repeatedly surfaced an obstructing keyboard; the inline segmented control
avoids that popup and preserves board space better than a wheel picker.

![Native promotion with Knight selected](img/practice-ios-promotion.png)

The screenshot shows the full board and reachable Cancel/confirmation controls.
Expo Go's blue gear is a development overlay. Connected account grading and
on-device retry persistence were not replayed; those have browser/API/helper
coverage. Physical-device VoiceOver, large-text and Reduce Motion checks for the
new promotion control, and Android interaction testing, remain release checks.

After the final native selector and Home-copy changes, lint, typecheck, all 36
mobile tests, token consistency and iOS/Android/web exports passed. Android
export is compilation evidence; Android interaction acceptance remains pending.

## Mobile played-move context — October 9, 2026

Connected practice uses the concise heading “Find a better move.” The detail names
the original move, side to move, and winning chance; the classification text remains
in the metadata row. A blue arrow traces the original game's UCI move on the
pre-move position, with its classification symbol in the destination square's
upper-right corner. The arrow and corner badge follow Flip. They hide while a
piece is selected, a request or promotion is pending, the wrong move is resetting,
an answer is shown, or the piece/move hint is active. This keeps the original
game's classification from appearing to grade the new attempt. Unknown
classifications omit the badge. No engine continuation or answer is revealed.

The lesson board uses the full safe-area width (390px board and 48.75px squares
at a 390px viewport). Header, prompt, completion text and bottom controls retain
16px insets. On compact screens or larger text, remaining height still limits the
board so actions remain reachable; the shared desktop width cap is 560px.

![Played move arrow and classification, browser phone viewport](img/practice-played-move-phone.png)

Verified with a local connected-screen fixture: flipped context, selection hides
the badge, failed answer request recovers, and actions fit a 320×568 viewport.
The fixture was removed afterward. Native screenshot verification is pending
because the Mac was locked during this check; this picture is React Native Web.

## Immediate move response — October 9, 2026

A legal attempt now moves the piece before local storage, authentication, API or
engine waits. While the authoritative answer is pending, the footer says
“Checking move…” and repeat submissions are disabled. A failed request restores
the original position and last-move context, displays the error, and permits retry;
no local success is claimed. The verdict still waits for the server and a local settlement attempt (storage remains best effort). First-answer elapsed time is captured at the final tap, excluding
network and persistence waits from the Easy threshold.

![Moved piece while grading is pending, browser phone viewport](img/practice-checking-phone.png)

Browser verification used a five-second failed-save fixture: the bishop appeared
on b4 while “Checking move…” was visible, then returned to e7 with an actionable
error and enabled controls. The temporary fixture was removed afterward. Native
physical-device response time remains unmeasured.

## Prepared move feedback — October 9, 2026

The worker prepares per-position grades ahead of practice in two-card batches.
The card carries a versioned map tied to its FEN, reference evaluation, grading
policy and Stockfish binary. A prepared legal attempt moves and flashes right or
wrong immediately, with “Saving your attempt…” in the footer. Continue remains
unavailable until the authoritative answer succeeds and local settlement is
attempted. Storage retains its existing best-effort behavior. A failed request
clears the provisional verdict, restores the position and enables retry.

![Prepared feedback while saving, browser phone viewport](img/practice-prepared-phone.png)

Preparation is optional: shallow or time-limited searches omit uncertain moves;
missing or stale entries use live server grading. An initially cold card polls
for prepared feedback every five seconds for up to one minute. Engine failures
return a retryable error without scheduling a wrong answer. The cache inherits
the existing move-row user isolation. Searches occur outside transactions with
one single-threaded engine and a 30-second budget per card.

The browser fixture verified instant prepared feedback without early Continue,
and rollback after a five-second failed save. It was removed after verification.
All 165 backend tests and 42 mobile tests passed, including cache invalidation,
promotion, partial-map fallback, user isolation and first-answer scheduling.
Lint, typecheck, token consistency and iOS/web exports also passed.
A local starting-position benchmark prepared all 20 moves in 1,989ms; a live
alternative grade took 249ms. These measurements exclude network and device
latency. Native interaction verification remains pending while the Mac is locked.

## Subtle practice rewards — October 9, 2026

A correct attempt uses Knightly's original two-note mallet motif, lowered to
65% of its previous amplitude, and a system success haptic on native devices.
The result cues land with the board feedback; selection keeps its gentle tick.
The bottom status enters with a 12px upward translation and opacity over 180ms,
using a strong ease-out on the UI thread. It animates its content rather than
height, keeping actions available immediately. Reduce Motion skips the entrance.
Idle instructions and hints do not animate.

A stable attempt/verdict identity is shared by the prepared preview and saved
response. An unchanged verdict does not replay sound, haptics, or status entrance
when the server responds. A fresh attempt or corrected verdict gets a new cue.
Failure still clears provisional feedback and restores the board. Checkmate
keeps its existing victory sound rather than layering another success chord.
Bundled audio works offline and respects the audio session's silent-mode setting;
background cues and web haptics remain suppressed. No new dependency was added.

![Saved practice reward, browser phone viewport](img/practice-reward-phone.png)

A local delayed-save fixture verified prepared feedback without Continue, followed
by saved success and Continue at a 390×844 viewport. The fixture was removed.
The identity regression covers preview/save deduplication, retries and corrected
verdicts. Physical-device sound volume, haptic strength, Reduce Motion and smoothness
remain acceptance checks: the Mac was locked during native verification.
The reference is Duolingo's correct-answer celebration approach described in
[Building character](https://blog.duolingo.com/building-character/); sound assets
remain original Knightly synthesis.

The sample-practice footer uses the same result entrance. A no-server Expo Go
session can preview the rewards without Clerk sign-in or changes to real progress.
Browser verification confirmed the sample route opens without authentication.

![Sample practice without sign-in, browser phone viewport](img/practice-sample-reward-phone.png)

## Lower board and optional explanations — October 9, 2026

The Expo board has square outer corners. Sample and connected practice anchor
the board toward the bottom of the lesson area, with the short side-to-move prompt
directly above it. At a 390×844 browser viewport the board is 390px wide, beginning
at y=274 (32.5% of the viewport). The practice footer reserves 160px so normal idle
and result transitions keep that anchor stable. Hints, errors and promotion can
grow the footer as needed; the board shrinks to remaining height on short screens.
The supplied Chess.com and Lichess phone screenshots are the placement reference.

![Lower square board and short prompt](img/practice-lower-board-phone.png)

Idle footers contain controls without repeated tap instructions. Above the board,
connected practice says the side to move and “Improve on [original move]”; sample
practice says “Find checkmate.” Result status stays visible, but explanations,
game metadata, winning chance and review timing are available in a scrollable
“Why this move?” dialog. Continue remains a separate action. The existing dialog
primitive provides a close action and focus restoration. Hints, saving states,
errors and promotion instructions remain visible without opening the dialog.

![Optional explanation dialog](img/practice-explanation-phone.png)

Browser verification covered a solved sample, opening and closing its explanation,
Continue, 390×844 placement, and reachable controls with a square board at 320×568.
Native dialog/large-text behavior remains a device acceptance check. The running
Expo Go sample preview includes this layout through Metro; hosted account access
and the backend preparation deployment remain separate work.

## Board boundary and next-position motion — October 9, 2026

The bottom controls have no top border. The lesson's bottom spacer is removed,
and practice disables the board's 4px ledge, so the last rank meets the footer
directly, with no strip between them.
The 160px practice footer reservation remains; at 390×844 the 390px board now
starts at y=294 and ends at the controls area.

![Board edge meets the bottom controls](img/practice-board-footer-phone.png)

Continue rearranges the pieces over 200ms on the UI thread, using the web
board’s CSS ease curve (0.25, 0.1, 0.25, 1).
Same-color, same-type pieces keep their identity: unchanged squares are matched
first, then remaining pieces by the movement preferences in react-chessboard
5.12.1 (same-file pawns, knight moves, diagonals for bishops, straight lines for
rooks). If no movement matches, use board order. Each identity is used once.
Added pieces appear and removed pieces disappear at the end of the slide, without
fades or landing bounce; position transitions are silent. Reduce Motion snaps to the
new position. Ordinary moves, captures, promotions and rewards retain their
existing behavior. Captured pieces discard old transition origins before fading.

Sample practice retains the Board instance when the exercise changes. Connected
practice keeps the solved board visible while fetching, disables Continue with
“Next…”, and passes the solved FEN and orientation into the next keyed card.
Grading, hint and retry state still reset per card. Initial mount origins allow
the next card's pieces to slide even though its lesson state is new.

Browser verification solved a sample and advanced to the next one; the board meets the
footer directly after a correct answer. Unit checks cover identity matching,
new-piece IDs, web movement preferences, forced silent seeds and
capture-after-rearrangement and removed-piece orientation regressions.
Native timing, opposite-side transitions and Reduce Motion remain phone acceptance
checks. The live Expo Go sample preview includes these changes.


Result sound and haptic acknowledge a newly known verdict immediately, independent
of the 200ms piece animation. A mating move plays its single victory sound at that
same immediate point. Prepared and server-confirmed copies of the same verdict
retain one reward identity, so saving does not replay feedback. Ordinary replay
sounds retain their animation timing; silent mode and haptic settings still apply.
