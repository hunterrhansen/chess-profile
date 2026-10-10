# Screens

What each screen of Knightly is for, how it's laid out, its states, and the decisions behind
it, with a picture of the design. Read the area's file before changing a screen, in `web/` or
in the mobile app.

How this fits with the other design docs:

- [`docs/design.md`](../design.md): the rules (tokens, components, board, lessons, motion,
  sound). It says *how* things look everywhere.
- **These files**: *what* is on each screen and *why*. Pictures in [`img/`](img/).
- **The app** (`web/src`, `/styleguide`): what is actually built. When a spec and the code
  disagree, check the spec's "Built" line: the code wins on details, the spec wins on intent.

The pictures come from the design canvas ("Knightly app", a private Claude Design artifact
that only the owner's Claude can open). The canvas is where new screens are drawn first; once
a design is decided, its spec and pictures land here, and the repo is the copy every tool reads.

## Areas

| Area | Spec | Routes |
| --- | --- | --- |
| Home: today's goal and the path | [home.md](home.md) | `/` |
| Practice: today's positions, hints, grades | [practice.md](practice.md) | `/practice`, `/puzzles` |
| Games: the library | [games.md](games.md) | `/games` |
| Game review: the lesson, All moves, Review complete | [review.md](review.md) | `/games/:id`, `/games/:id/moves`, `/games/:id/done` |
| Play: the bot, Blunder check, checkmate | [play.md](play.md) | `/play` |
| Progress | [progress.md](progress.md) | `/progress` |
| Settings | [settings.md](settings.md) | `/settings` |
| Your data, Privacy, Admin | [account.md](account.md) | `/settings`, `/privacy`, `/settings/admin` |
| Onboarding | [onboarding.md](onboarding.md) | `/welcome` |
| The shell: navigation and the account row | [shell.md](shell.md) | every signed-in page |
| Mobile loading: Knight hop | [loading.md](loading.md) | startup and initial data waits |

The logo's three directions are in [img/brand-logo.png](img/brand-logo.png); the chosen one
is described in design.md's Logo section.

## Phone and desktop

Every area has a desktop frame (1280 wide) and, except Settings, a phone frame (390 × 844).
The phone frames are the reference for the mobile app as well as the web app's small screens.

## Keeping this current

When a screen's design changes, update the canvas, this spec and its pictures in the same
change, so they never drift. To re-capture a picture from a canvas page saved locally (the
page's `.dc.html` with the canvas runtime as `support.js`, served over HTTP):

```sh
swiftc -O scripts/snap-page.swift -o /tmp/snap-page
/tmp/snap-page http://localhost:8765/HomePath.dc.html 1280 1200 /tmp/home-path@2x.png
sips -z 1200 1280 /tmp/home-path@2x.png --out docs/screens/img/home-path.png
```

Pictures are 1x, light theme. Dark is checked in the app on `/styleguide`.
