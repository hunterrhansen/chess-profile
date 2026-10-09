# Game review

A game's review is a lesson: one step per key moment, in the same shell as Practice. All moves
is the whole game for browsing. Review complete ends it.

**Code:** `web/src/pages/review.tsx` (the lesson), `pages/review-moves.tsx` (All moves),
`pages/review-done.tsx`, `components/review-bits.tsx`, `components/mark-row.tsx`. **Built**
([#28](https://github.com/hunterrhansen/knightly/pull/28),
[#29](https://github.com/hunterrhansen/knightly/pull/29)); variations in
[review-variations.md](../review-variations.md). Rules in design.md › Lessons.

![The lesson: a great move](img/review-lesson.png)

| Phone: wrong answer | Show the line |
| --- | --- |
| ![Phone](img/review-phone.png) | ![Show the line](img/review-show-line.png) |

## The lesson

Focus mode: ✕ and the progress bar ("Key moments 1 of 5") on top, All moves top right, one
column, the prompt as a big heading, the board, and the bar along the bottom with Continue.

Each of your key moments is one step:

- **Your mistake, miss or blunder** → "Find a better move". You play it on the board. Right:
  green bar, "Found it". Wrong or Show me: red bar, the answer as a green arrow. Either way the
  why. Hint and try again work as in Practice.
- **Your Great or Brilliant move** → a gold "Great move" bar, no question.
- **No single move fixes it** → the step shows what happened instead of asking.
- **Show the line** opens line mode (blue frame, blue highlights), full screen, with Continue
  the lesson.
- The last step's button is **Finish review** → Review complete.

Not in the lesson: nav, eval bar, clocks (they live in All moves).

### Decisions (Oct 7)

1. Finding the move counts as that position's first answer in the deck (found → back in
   3 days, missed → tomorrow).
2. The opponent's misses are not lesson steps; they show in All moves.
3. Review complete gets one mark per key moment (gold for a great move) and "3 of 4 found".
4. All moves is full screen.

## All moves

| Desktop | Phone |
| --- | --- |
| ![All moves](img/review-all-moves.png) | ![All moves on a phone](img/review-all-moves-phone.png) |

- Board with the eval bar and both clocks; start, back, forward, end under it.
- **Win graph:** your winning chance over the game; the lesson's key moments sit on it as
  badges (tap to jump); a blue line marks where you are.
- **The current move:** its badge, your chance before → after, the best move when it went
  wrong. Show the line opens line mode; a lesson step also offers Try it in the lesson.
- **Move list:** your bad moves in red with their badge, the opponent's moves greyed.
- **Phone:** board on top, the current move, a sideways-scrolling move strip, ‹ › and Show the
  line along the bottom.
- No note box: notes were removed from the app.

## Review complete

| Desktop | Phone (no scrolling) |
| --- | --- |
| ![Review complete](img/review-done.png) | ![On a phone](img/review-done-phone.png) |

- Trophy, "Review complete!", the game in one line.
- **Key moments, one by one:** a mark per step and "3 of 4 found", with what you missed and
  when it comes back.
- Tiles: Accuracy, Best moment, To fix. Then the unit's bar.
- Review today's positions (brand) and Back home.
- **Phone:** one screen, no scrolling, like Duolingo's lesson complete: trophy and title, three
  tiles with a colored band (Found green, Accuracy gold, To fix red), the marks row, one big
  button and Back home. The best-moment card and the unit bar are left out. Checked at 375 × 812
  and 375 × 667.
