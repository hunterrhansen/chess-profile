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
