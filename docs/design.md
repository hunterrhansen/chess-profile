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
- Radii: `rounded-sm` 8px (board, swatches), `rounded-md` 12px (pills, rows),
  `rounded-lg` 16px (buttons), `rounded-xl` 24px (cards).

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

## Voice

Talk like a coach on the player's side: short sentences, second person. Praise loudly
("Brilliant! You saw Rxh7 three moves deep."), state mistakes plainly with the fix ("Nf5 left
d4 undefended. Bxd4 wins a pawn."). SAN for moves, `+1.2` / `M3` for evals, sentence case for
headings, no emoji in UI copy.

## Motion

Press 80ms, pop 240ms (`animate-pop`), fills 400ms. `prefers-reduced-motion` turns movement
off globally in `index.css`.
