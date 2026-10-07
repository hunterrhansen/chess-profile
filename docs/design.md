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
  `rounded-lg` 16px (buttons), `rounded-xl` 24px (cards).

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
- **Badge:** the move's classification on the square it landed on (`MoveBadge pop`).

`PlayBoard` (`pages/play.tsx`) wraps it for making moves (Play, Practice).

## Icons

- **KnIcon** (`components/kn-icon.tsx`): Knightly's own two-tone icons on a ledge (home, games,
  play, progress, settings, goal, drill, review, trophy, notes, engine, lock, check, star,
  crown). For navigation, the path and the big moments. They use the theme tokens, so they
  follow light and dark.
- **Phosphor** (`@phosphor-icons/react`) for everything else: buttons, inline controls,
  status. `bold` by default (set in `main.tsx`); `weight="fill"` for objects (robot, flag,
  lightbulb, star, play). Use the `…Icon` names (`CheckIcon`).
- Figurine notation (`MoveText`) draws the piece shapes in the text color (`PieceGlyph`).

## Navigation

From `md` up, a sidebar: the brand, then the tabs (KnIcon and an uppercase label; the current
one outlined in sky), collapsible to an icon rail. On a phone: a top bar with the Settings gear
and a tab bar along the bottom. The design's tabs are Home · Games · Play · Progress ·
Settings; until Home is built, Practice holds its place and `/` opens Progress.

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
| Progress | `components/ui/progress.tsx` | Anything out of a whole; always labelled |
| StatLabel / StatValue / StatDelta | `components/ui/stat.tsx` | Stat tiles inside a Card |
| MoveBadge | `components/move-badge.tsx` | Move classifications; `pop` on the board |
| EvalBar | `components/eval-bar.tsx` | The engine bar beside the board |
| Board / PlayBoard | `components/board.tsx`, `pages/play.tsx` | Every chess position; PlayBoard to make moves (see Board) |
| Piece / PieceGlyph | `components/pieces.tsx` | A piece on its own; a piece in the text color for notation |
| KnIcon | `components/kn-icon.tsx` | Brand icons: navigation, the path, big moments |
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
- **Loops mean "act now" or "wait".** Only `animate-beacon`, on the one thing to do next, and
  `animate-hop`, on the loader.
- **Nothing waits on an animation.** Buttons work mid-animation, and nothing animates longer
  than `--duration-celebrate`.
- **Reduced motion.** `prefers-reduced-motion` makes every animation jump to its last frame
  (`index.css`). Things that only exist to move (`Confetti`) check `useReducedMotion()` and
  render nothing; `CountUp` shows the final number; the board's pieces jump.

## Sound

Sounds pair with the motion: a wooden knock when a piece lands, a chime when you're right, a
fanfare with the confetti. They're made in the browser with the Web Audio API
(`lib/sound.ts`), with no audio files, and Settings has an on/off switch (on by default).

| Sound | Plays when | Wired in |
| --- | --- | --- |
| `move`, `capture`, `check`, `castle`, `promote` | A board's position changes by one move (one back plays `move`; a jump is silent) | `useMoveSound(fen)` in `PlayBoard` and review's `Board` |
| `right` / `wrong` | A practice answer is checked, with the square's flash | `practice.tsx` |
| `brilliant` | A Brilliant or Great badge lands with its ring | `MoveBadge pop` |
| `win` / `gameOver` | A game against the bot ends (won / lost or drawn) | `play.tsx` |
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
