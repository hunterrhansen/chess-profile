# Design

The web app's look, as code. The board is calm, the rewards are loud: bright, chunky,
pressable UI around a quiet board. The shareable brand book lives on claude.ai and is
re-synced from this repo; when the two disagree, the code wins.

- **Tokens:** [`web/src/styles/tokens.css`](../web/src/styles/tokens.css), the only file
  allowed to contain a color.
- **Living reference:** `/styleguide` in the app renders every token and component (Settings
  links to it). Check new UI there in both themes.
- **Guardrail:** `pnpm lint` runs `scripts/check-colors.mjs`, which fails on hex,
  `rgb()`/`oklch()` and Tailwind palette classes (`bg-blue-500`, `text-white`) anywhere else.

## Logo

The mark is a dark knight on a green tile, on its ledge, with a gold moon behind its head:
*knight* plus *nightly*. Use `LogoMark` (`components/logo.tsx`) for the mark and `Logo` for the
mark with "Knightly" beside it in Fredoka 700. Under 24px use `LogoMark simple`: the moon can't
be seen that small, so it's the knight alone (`public/favicon.svg` is that version). The colors
are the brand fills (`brand`, `brand-lip`, `on-brand`, `gold`); never recolor the mark. The
design canvas's Brand page has the lockups and the other directions considered.

The mark also carries the waits and the gaps:

- **Loading a whole view:** `LogoLoader` (the mark hopping in place, with a short line like
  "Picking today's positions…"). Over a block whose size is known (the board, a chart), use
  `LoadingBlock`: a skeleton of that size with the loader on top, so nothing jumps when the
  content arrives. Small waits inside a panel keep their spinner; table rows keep plain
  skeletons. Before the app's code loads, `index.html` shows the mark too.
- **Nothing to show:** `EmptyState` (`components/empty-state.tsx`): the mark, a heading saying
  what's missing, one line on how to get it, and the action that does ("Reset filters", "Go to
  Settings"). `compact` for a gap inside a card.

## Color

- Use tokens as Tailwind colors (`bg-brand`, `text-on-brand`, `border-line`,
  `bg-move-blunder`) or as `var(--brand)` in a `style`. The shadcn names (`bg-primary`,
  `text-muted-foreground`, `bg-card`) point at the same tokens.
- **Bright fills take dark letters.** `brand`, `gold`, `sky` and `danger` always pair with
  `on-brand`, `on-gold`, `on-sky`, `on-danger`, in both themes. Never white text on them.
- **Text colors are their own tokens.** Green text is `brand-text`, red text is
  `danger-text` (= `text-destructive`), amber text is `gold-text`. The fills and the
  `win`/`loss`/`draw` result colors are too light to read as small text.
- One `brand` (default) button per view. `gold` is the reward: at most one gold moment per
  view (a personal best, a Brilliant move).
- **State is never color alone.** Every colored state also says it in words, a mark or a
  shape: the verdict's ✓ / ✕ and title, `W`/`L`/`D` on result badges, the sync line beside its
  dot, an `aria-label` on each mark in a marks row. Don't add a state that's only a color.
- Move classifications use `--move-*`; `CLASSIFICATION[kind].color` is `var(--move-…)`, so
  use it in `style` (CSS), not as an SVG attribute.
- A library that only takes a color string for an SVG attribute (the board's arrows) gets
  `token('--arrow-best')` from `lib/tokens.ts`, read at render time.
- Need a color that doesn't exist? Add a token to `tokens.css` (light and `.dark`), expose
  it in `index.css`'s `@theme inline`, and add it to the style guide.

## Shape and depth

- Anything pressable sits on a solid ledge and sinks onto it when pressed: `Button`
  (`components/ui/button.tsx`) does this for every filled and outline variant.
- Panels: `Card`, or the `panel` utility for hand-built ones (2px `line` border, 24px
  radius, 2px `lip` ledge). A panel that is a link adds `panel-link` (lifts on hover).
- No soft drop shadows. Depth is always a solid ledge.
- Radii: `rounded-sm` 8px (swatches), the board 10px, `rounded-md` 12px (pills, rows),
  `rounded-lg` 16px (buttons), `rounded-xl` 24px (cards), `rounded-full` for bars, dots and
  avatars. They're set in `index.css`.
- Spacing: Tailwind's 4px steps. The scale is 1, 2, 3, 4, 6, 8, 12 (4, 8, 12, 16, 24, 32,
  48px): `gap-2` inside a row of chips, `gap-4` between cards, `p-5` inside a card, `gap-10`
  between page sections. Half steps (`gap-2.5`, `py-3.5`) are fine for tight rows; don't
  invent pixel values (`gap-[13px]`).

## Board

Every position is drawn by `Board` (`components/board.tsx`); don't use react-chessboard
directly. It sits on a 4px `lip` ledge with 10px corners, and uses Knightly's pieces
(`components/pieces.tsx`): flat shapes on a rounded base, colored by the `--piece-*` tokens,
which are the same in both themes. Its states, each on `/styleguide`:

- **Last move:** yellow (`board-highlight-*`). In an engine line (`inLine`) the highlights and
  a frame around the board turn blue (`line-highlight-*`), so a line never looks like the game.
- **Picking a move:** `selected` gets a sky ring (`--selected`); `targets` show a dot on an empty
  square and a ring on a capture (`--move-hint`).
- **Arrows:** `best` green for the better move, `line` blue for a line's next move, `danger` red
  for the reply that punishes a move.
- **Check shows the attack:** the king's square goes solid red (`--check`) and the squares from
  the checking piece to the king are tinted (`--check-path`). A knight has no path: just its own
  square is tinted. Worked out from the position, so every board does it.
- **Checkmate, "the king falls":** check's red square and path, then the mated king tips onto
  its side (`animate-topple`, 380 ms after the piece lands, a bounce), a red **#** badge pops on
  it (820 ms) and the winner's king gets a crown (980 ms), with the `checkmate` sound. It plays
  once: the first time the mate lands on that board by a move. A reload, a jump or coming back
  to it shows the last frame. Marks on the top row sit inside the square. In Play the result
  follows (`MateCard`): a gold card with the trophy and confetti when you mate the bot, a calm
  card with the # when it mates you; other endings keep a line of text.
- **Badge:** the move's classification on the square it landed on (`MoveBadge pop`).
- **Hint:** `glow` puts a gold glow on the piece to move (`animate-hint`, which breathes until
  you move it). The hint's second step is a `best` arrow. See Lessons.

`PlayBoard` (`pages/play.tsx`) wraps it for making moves (Play, Practice).

## Icons

- **KnIcon** (`components/kn-icon.tsx`): Knightly's own two-tone icons on a ledge (home, games,
  play, progress, settings, goal, drill, review, trophy, notes, engine, lock, check, star,
  crown, hint). For navigation, the path, settings sections, the big moments, and `hint` (the
  gold bulb) on every Hint button. They use the theme tokens, so they follow light and dark.
- **Phosphor** (`@phosphor-icons/react`) for everything else: buttons, inline controls,
  status. `bold` by default (set in `main.tsx`); `weight="fill"` for objects (robot, flag,
  star, play). Use the `…Icon` names (`CheckIcon`). Not for Hint: that's `KnIcon hint`.
- Figurine notation (`MoveText`) draws the piece shapes in the text color (`PieceGlyph`).

## Navigation

From `md` up, a sidebar: the brand, then the tabs (`NavItem`: KnIcon and an uppercase label;
the current one outlined in sky on a light sky fill), collapsible to an icon rail (⌘B). On a
phone: a top bar with the Settings gear and a tab bar along the bottom (the same sky outline
on the current tab). The tabs are Home · Games · Play · Progress · Settings
(`components/app-shell.tsx`).

- **Goal counters:** on a phone, Home puts today's goal in the top bar through `PhoneHeader`:
  `KnIcon review` with `0/1` (today's game) and `KnIcon drill` with `3/10` (positions), each a
  link. Other pages leave the slot empty.
- **Account status** (`components/account-status.tsx`), at the foot of the sidebar: your
  initial on a brand disc wearing a small tag per site (Chess.com ink, Lichess sky), your name,
  and the daily update as a dot and a short line. Five states: `ok` green ("Synced 6:15 AM"),
  `running` sky and pulsing ("Updating…"), `idle` grey ("Synced yesterday", "Not synced yet"),
  `partial` gold, `failed` red (their lines in `gold-text` / `danger-text`). Collapsed to the
  rail, the dot sits on the avatar. Click it for a menu: the update with Run now, each account
  with its rating, Manage accounts.

Practice isn't a tab: it's a lesson, started from Home's path or Today's goal (or Progress),
shown full screen without navigation (`FocusShell`). Its ✕ goes back Home.

## Home

Today's goal and the path (`pages/home.tsx`, data from `/api/home` and `units.py`). Unit 1 is
the weakest of the four KPIs; its path is today's lessons in order (review today's game,
today's positions, play the bot), then the unit check. `PathNode` (`components/path-node.tsx`)
draws each step: done, current (ringed, with a sky tag and the only `animate-beacon`), locked,
and the unit check's crown. Above the path, Unit 1's banner in brand with its unit check as a
bar. The current step opens its lesson card (brand border and ledge, one `default` button, or
`outline` for the optional bot game). Beside it, Today's goal: a `brand` bar for today's game
and a `sky` bar for positions. Gold appears once at most: the finished goal, or the "Unit
complete" banner (shown once per unit).

## Lessons

A lesson (Practice, Puzzles, a game's review) is full screen in `FocusShell`, laid out like
Duolingo's: exactly the window's height, never scrolling (`LessonScreen` in
`components/lesson-bar.tsx`). On top, ✕ (back Home), the progress bar and its count ("3 of
10", `animate-bump`); then the prompt; then the board, as big as the space left
(`LessonBoard`); then the bar along the bottom edge (`LessonBar`).

**The bar's states** (`LessonBar tone`). The band spans the window; only the verdicts slide up.

| Tone | Band | When |
| --- | --- | --- |
| `idle` | the page | Before you answer: the controls and a line of help |
| `retry` | light red, "Not quite" in `danger-text` | After a miss, until you find it or take a hint |
| `right` | green, ✓ bounces in | Found it, a good move, found with help |
| `wrong` | red, ✕ shakes once | Show me ("The move was…") |
| `gold` | gold, the move's badge as the mark | A review step praising your move (Great, Brilliant) |

`LessonVerdict` lays a verdict out: the round mark, the title in `brand-text` / `danger-text`
/ `gold-text`, a line or two of why, and the buttons (Continue, `default` when right and
`danger` when wrong; Show the line as `outline`). `FindBar` (`components/find-bar.tsx`) is the
bar while you find a move, built on these.

**Hint.** One quiet `outline` button with `KnIcon hint`, live two seconds after the position
appears (no accidental taps). Two steps: Hint lights the piece to move with the gold glow
(`glow`, `animate-hint`), then the button becomes Show the move and draws it as a green arrow.
In Practice, when the position has a tactic, a first step names it in words ("Hint: Look for
a fork: one move that hits two pieces."), so the piece's step is labelled Show the piece. The help line turns `gold-text` once you've taken a
hint. Show me (`ghost`) stays separate and gives the answer.

**Answers and grades.** Only the first try is graded (`lib/find-move.ts`, `deck.py`: FSRS
with Anki's buttons, pressed for you). Trying again after a miss is for learning.

| Outcome | Verdict title | Band | Grade |
| --- | --- | --- | --- |
| `found` | Found it: Ra8# | green | Good; Easy if it was the engine's move inside 10s |
| `good` | Good move! Best was Ra8# | green | Hard |
| `helped` | Found it, with help: Ra8# | green | Again (a hint, or not on the first try) |
| `shown` | The move was Ra8# | red | Again |

Under the why, when it comes back ("Back in 9 days."). A missed position comes back once at the
end of the session with a sky **One more go** pill; a position you've never seen has a sky
**New** pill. Both are `Badge variant="sky"`.

**Marks.** Review complete and Done for today end with a row of marks, one per key moment or
position: green found, pale green (`brand` mixed 50% into the card) a good move, sky found
with help, red missed, gold a great move (review only). Each mark is a rounded bar with an
`aria-label` ("12. Nf5: missed"), and the line under the row names the ones to go over again.

## Screens

- **Progress** (`pages/overview.tsx`): a unit card per KPI, in the order of Home's units. Unit 1
  (your weakest) is filled `brand` with its unit check as a bar; the others are plain panels
  with a lock, or a check once done. The number is big Fredoka with its unit beside it, a
  ▲/▼ change in `brand-text` / `danger-text`, and a link to the games behind it. Each card is a
  `panel-link`.
- **Games** (`pages/games.tsx`): quick-filter pills along the top (All, To review, Wins,
  Losses, Had a blunder, Thrown wins), each with its count in a small chip. The chosen one is
  ink (`bg-foreground text-background`); the others are cards on a 2px ledge. Then `GameRow`:
  one game per card (`panel-link`): `ResultBadge`, the color dot, opponent and rating, when and
  how it ended, the opening, accuracy, up to three blunder/mistake badges (or "Clean"), and
  Reviewed (green check) or a Review chip.
- **All moves** (`pages/review-moves.tsx`): `WinGraph`, your winning chance over the game as a
  green line and fill, the lesson's key moments as `MoveBadge`s on the line (tap one to jump),
  and a sky line where you are.
- **Play** (`pages/play.tsx`): `BotSays`, the bot's avatar and a speech bubble (a spinner and
  "Thinking…" while it thinks, `danger-text` on an error). `BlunderWarning`, once a game when a
  move loses a lot: a card on a gold ledge with a gold "!" mark, "Blunder check", what the
  reply wins and how your chance drops, then Take it back (`default`) and Play it anyway
  (`ghost`). The board shows the reply as a `danger` arrow.
- **Sign-in** (`lib/auth.tsx`, once Clerk is set up): full screen on the page color, the
  `Logo`, "Turn your games into practice" and one line on what Knightly does, then Clerk's
  sign-in-or-up form themed in our tokens (`appearance`): a panel on its ledge, inputs and
  the Google button with 2px `line` borders and ledges, Continue in `brand` with `on-brand`
  letters on its ledge. Clerk's styles win on specificity, so those classes carry `!`. While
  Clerk loads: `LogoLoader` ("Opening Knightly…"). Signed in: the account's email and Sign
  out at the top of Settings › Accounts.
- **Settings** (`pages/settings.tsx`): each section is a `panel` with its KnIcon, title and a
  line of what it's for, then rows: the name and a hint on the left, the control on the
  right. Choices are `Segmented` (the options on a sunken `surface-muted` track, the chosen one
  raised on a ledge); on/off is `Switch` (`components/ui/switch.tsx`: grey off, green on its
  ledge).

## Type

- Headings and big numbers: Fredoka (`font-heading` / `font-display`; `h1`–`h3` get it
  automatically). Text: Nunito, 600 by default. Engine numbers, PGN, FEN: `font-mono`.
- Small uppercase labels: the `eyebrow` utility. Button and badge labels are uppercase
  through their variants; write them in sentence case in code.
- Numbers that change or line up: `tabular-nums`.

## Components

| Component | File | Use |
| --- | --- | --- |
| Button | `components/ui/button.tsx` | `default` main action, `outline` alternative, `gold` reward, `sky` helper, `danger` destructive, `ghost`/`link` low stakes |
| Badge (the brand book's Pill) | `components/ui/badge.tsx` | Tags and states; `win`/`loss`/`draw` for results |
| Card | `components/ui/card.tsx` | Every panel of content |
| Progress | `components/ui/progress.tsx` | Anything out of a whole; always labelled. `tone`: `brand` (default), `sky` for counts toward a goal, `gold` for a record or a finished goal |
| StatLabel / StatValue / StatDelta | `components/ui/stat.tsx` | Stat tiles inside a Card |
| MoveBadge | `components/move-badge.tsx` | Move classifications; `pop` on the board |
| EvalBar | `components/eval-bar.tsx` | The engine bar beside the board |
| Board / PlayBoard | `components/board.tsx`, `pages/play.tsx` | Every chess position; PlayBoard to make moves (see Board) |
| Piece / PieceGlyph | `components/pieces.tsx` | A piece on its own; a piece in the text color for notation |
| KnIcon | `components/kn-icon.tsx` | Brand icons: navigation, the path, big moments |
| PathNode | `components/path-node.tsx` | A step on Home's path |
| UnitBanner / LessonCard / GoalCard / GoalDone / UnitComplete / PhoneCounter | `components/home-cards.tsx` | Home's lead unit, the current step's card, Today's goal, the gold moments, the phone top bar's counts |
| UnitCard | `components/unit-card.tsx` | A unit on Progress: the lead one in brand, the rest locked or done |
| FilterPill | `components/filter-pill.tsx` | A quick filter with its count (Games) |
| MarkRow | `components/mark-row.tsx` | One mark per position or key moment (Review complete, Done for today); the marks are in `lib/marks.ts` |
| NavItem / PhoneTopBar / PhoneTab | `components/app-shell.tsx` | The sidebar tabs; the phone's top bar and bottom tabs |
| LessonScreen / LessonBoard / LessonBar / LessonVerdict | `components/lesson-bar.tsx` | A lesson's layout, its bottom bar and verdicts (see Lessons) |
| FindBar | `components/find-bar.tsx` | The bar while you find a move: Hint, Show me, the verdict |
| MoveText / MarkedText | `components/move-text.tsx` | A move in figurine notation; text with moves tagged in it |
| Switch | `components/ui/switch.tsx` | On/off settings |
| AccountStatus / AccountRow | `components/account-status.tsx` | The sidebar's account row and the daily update's status; AccountRow is the row without its menu |
| CountUp / CountUpText | `components/ui/count-up.tsx` | Numbers that count up to their value |
| LogoMark / Logo | `components/logo.tsx` | The mark, and the mark with the name |
| LogoLoader / LoadingBlock / EmptyState | `components/logo.tsx`, `components/empty-state.tsx` | Loading a view; nothing to show yet |
| Confetti | `components/confetti.tsx` | The big moments (see Motion); plays the celebrate sound |

## Voice

Talk like a coach on the player's side: short sentences, second person. Praise loudly
("Brilliant! You saw Rxh7 three moves deep."), state mistakes plainly with the fix ("Nf5 left
d4 undefended. Bxd4 wins a pawn."). SAN for moves, `+1.2` / `M3` for evals, sentence case for
headings, no emoji in UI copy.

## Motion

Modeled on Chess.com and Duolingo: the board moves like a hand, answers get an instant verdict,
and the big moments throw confetti (and make a sound: see Sound). Quick for small things, bouncy for rewards, never in the way.
Timings are tokens in `tokens.css` (`--duration-*`, `--ease-*`); every animation is on
`/styleguide` with a replay button.

| Token | ms | For |
| --- | --- | --- |
| `--duration-press` | 80 | sinking onto a ledge |
| `--duration-quick` | 150 | hovers, color changes, a button easing back up |
| `--duration-move` | 200 | a piece sliding (`useMoveMs()` for the board) |
| `--duration-pop` | 300 | a badge or icon landing |
| `--duration-sheet` | 320 | a verdict sliding up |
| `--duration-fill` | 400 | progress, the eval bar, numbers counting up |
| `--duration-celebrate` | 900 | confetti, a medal |

Easings: `ease-out` (the default, also what Tailwind's `ease-out` class gives), `--ease-move`
for pieces, `--ease-bounce` for rewards and unlocks, `ease-in` for leaving. Use them as
`ease-out` or `ease-(--ease-bounce)`, and durations as `duration-(--duration-fill)`.

| Animation | Use |
| --- | --- |
| `animate-pop` | A badge landing. `MoveBadge pop` waits for the piece, and Brilliant/Great send out an `animate-ring` |
| `animate-flash` | A square or fill lighting up once: green for right, red for wrong (`PlayBoard flash`) |
| `animate-sheet` | A verdict panel arriving |
| `animate-bounce-in` | A right answer's check, a medal |
| `animate-shake` | A wrong answer's ✕, only the mark, never the panel or the board |
| `animate-rise` | Items arriving in order: stagger with `animation-delay`, about 80ms apart |
| `animate-bump` | A count that just changed ("4 of 10"): key it by the value |
| `animate-float-up` | A change floating off a number ("+12") |
| `animate-beacon` | The current step only |
| `animate-hop` | The logo while a view loads (`LogoLoader`) |
| `animate-hint` | The gold glow on the piece to move after Hint (`Board glow`), until you move it |
| `CountUp` / `CountUpText` | Stats and scores counting up when shown or changed |
| `Confetti` | The big moments only |

Rules:

- **Order, not speed.** The move lands, then the badge pops, then the words arrive. Wait for
  what came before with `animation-delay` (`var(--duration-move)`) instead of slowing things.
- **Press is instant, release is eased.** Ledges drop on `:active` with no transition and ease
  back over `--duration-quick` (`Button`, `panel-link`).
- **Celebrate rarely.** Confetti and `bounce-in` medals are for finishing the day's positions, a
  personal best or a Brilliant you found: one per view, never on a loop. Ordinary moves stay quiet.
- **Wrong is firm, not harsh.** Red, a single small shake on the ✕, the right move shown. The
  progress bar still moves forward.
- **Loops mean "act now" or "wait".** Only `animate-beacon`, on the one thing to do next,
  `animate-hint`, on the piece a hint points at, and `animate-hop`, on the loader.
- **Nothing waits on an animation.** Buttons work mid-animation, and nothing animates longer
  than `--duration-celebrate`.
- **Reduced motion.** `prefers-reduced-motion` makes every animation jump to its last frame
  (`index.css`). Things that only exist to move (`Confetti`) check `useReducedMotion()` and
  render nothing; `CountUp` shows the final number; the board's pieces jump.

## Sound

Sounds pair with the motion: a wooden piece on a wooden board when a piece lands, a chime when you're right, a
fanfare with the confetti. They're made in the browser with the Web Audio API
(`lib/sound.ts`); recordings in the `sounds/` folder replace some of them (README: Sounds). Settings has an on/off switch (on by default).

| Sound | Plays when | Wired in |
| --- | --- | --- |
| `move`, `capture`, `check`, `checkmate`, `castle`, `promote` | A board's position changes by one move (one back plays `move`; a jump is silent), as the piece lands: after the slide, or at once for a dragged piece | `useMoveSound` in `Board` |
| `right` / `wrong` | A practice answer is checked, with the square's flash | `practice.tsx` |
| `brilliant` | A Brilliant or Great badge lands with its ring | `MoveBadge pop` |
| `gameStart` | A game against the bot starts (Play, Rematch) | `play.tsx` |
| `win` / `gameOver` | A game against the bot ends other than by mate (won / lost or drawn); a mate has `checkmate` already | `play.tsx` |
| `celebrate` | Confetti fires | `Confetti` (pass `silent` to skip) |

Rules:

- **A sound lands with its animation.** Use `playSound(name, delayMs)` with the same delay as
  the animation (`durationMs('--duration-move')`), and return its cancel from the effect.
- **Same rarity as the motion.** Ordinary moves get a knock, never a chime; the fanfare is only
  for confetti moments. Don't add sounds to buttons, hovers or counters.
- **Wrong is firm, not harsh:** a soft falling tone, quieter than the right-answer chime.
- **Never surprising.** Nothing plays on page load (a finished game you come back to is
  quiet), in a background tab, or with sounds off. Reduced motion doesn't mute sound.
- New sound? Add it to `SOUNDS` in `lib/sound.ts` and to the Sounds demo on `/styleguide`.
