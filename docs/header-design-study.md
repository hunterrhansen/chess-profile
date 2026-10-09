# Mobile header design study

Status: Compact goals approved and implemented, October 9, 2026.

## Product focus

Knightly turns your own games into practice. Home answers what to do today, in order:
review the newest game, practice due positions, then optionally play the bot.
The unit goal describes the skill being improved, such as reducing hanging pieces.
Daily completion is a small, bounded commitment: one game and up to ten due positions.
There is no accumulated backlog, and no points, streaks or leagues.
Sources: [Home](screens/home.md), [design system](design.md).

The header should tell the player what remains today and provide quick access to
those lessons. Rating is an outcome to inspect in Progress. Account synchronization
belongs in Settings, with an actionable notice near affected content when necessary.
Neither deserves permanent equal prominence with the daily learning loop.

## Research

- [Duolingo's core tabs redesign](https://blog.duolingo.com/core-tabs-redesign/)
  describes headers sized by tab purpose, consistently positioned titles, a small
  set of typography styles, and whitespace rather than unnecessary containers.
  Their lesson is consistency with purpose, not identical content on every tab.
- [Chess.com mobile ratings access](https://support.chess.com/en/articles/9855780-how-can-i-check-my-elo-on-chess-com)
  documents a top-left avatar leading to profile and ratings (February 16, 2026).
- [Chess.com mobile friends access](https://support.chess.com/en/articles/8609433-how-do-i-send-a-friend-request)
  documents a top-right Friends action on Home (July 30, 2025).
  These controls support account and social access; applying that emphasis to
  Knightly would be a product decision, not a necessary chess-app convention.

These are published design explanations and support documents, not a claim that
every account or version currently displays the same header.

## Recommended direction: Compact goals

Keep a single compact Home header, approximately 64 logical pixels excluding the
safe area. Wordmark at the left; review and practice summaries to its right;
Settings at the far right. Use real Nunito 800 for values, Nunito 600 for explicit
labels, Fredoka for the wordmark, and existing two-tone KnIcon artwork.

Each summary has an icon, a clear count and a label: Review 0/1; Practice 3/10.
Both have at least 44 logical pixels of touch space. Review opens today's game;
Practice opens due positions. Avoid additional outlined capsules, bright header
fills, or a new primary button that competes with the current lesson card.

The unit banner below remains the explanation of why the work matters. Its
current lesson remains the primary call to action. Settings is visually quieter.

- Completed goals retain their label and show a check with the completed count.
- No game or no due positions gets explicit empty-state wording and an appropriate
  destination; do not show misleading 0/1 or a tappable 0/0 that opens nothing.
- Loading reserves stable space; unavailable data is not represented as zero progress.
- At narrow widths or larger system text, reflow goal summaries into a second row.
- Games, Play and Progress use a consistently aligned page title and Settings.
  Active lessons retain the close-and-progress focus header.

For wider React Native Web layouts, keep the sidebar identity and the existing
Today goal panel; avoid duplicating all daily counts in the desktop header.

## Alternatives explored

Today strip: wordmark and Settings on one row, full labeled goal summaries below.
This reads more easily at large text sizes but takes vertical space from the path.
It is a useful responsive fallback to the recommended compact layout.

Quiet brand: wordmark and Settings only, with today's counters in Home content.
This simplifies the shell but makes daily progress less persistent when scrolling.

## Verification

Checked standard and accessibility-large text in the iPhone 18 Pro simulator.
The header keeps one row at standard size and moves goals to a second row at large
text sizes. Practice opens the existing context-aware route, which shows sample
practice when disconnected; its Home action returns to the shell. Lint, typecheck,
all 16 existing tests and a React Native Web export passed.

Loading and unavailable summaries reserve their place and disable lesson actions.
Empty review links to Games; empty or complete practice is non-actionable. These
connected account states were inspected in code, not replayed against a live account.
The layout study uses simplified icons; production keeps Knightly's existing KnIcon
artwork. The accepted direction is now implemented in the native shell.
