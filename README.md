# Knightly

Turn your own chess games into daily practice. Knightly pulls all of your chess data
(Chess.com, Lichess, over-the-board PGNs) into a single SQLite file, analyses it with
Stockfish, and turns your mistakes into positions to review.

## Quick start

```bash
uv sync
uv run knightly sync chesscom <username>            # all games, every month
uv run knightly sync lichess  <username> --token lip_xxx   # games + puzzle history
uv run knightly import-pgn ~/otb-games/ --me "Hansen, Hunter"
uv run knightly sync                                 # later: incremental re-sync of all accounts
uv run knightly analyze                              # Stockfish pass over new games
uv run knightly stats
uv run knightly serve                                # web app at http://127.0.0.1:8000
sqlite3 chess.db                                         # it's just SQL from here
```

The DB path defaults to `./chess.db` (override with `--db` or `KNIGHTLY_DB`).
`--since 2024-01` limits a first import.

## Sources

| Source | How | Auth | What we get |
|---|---|---|---|
| **Chess.com** | [Published-Data API](https://www.chess.com/news/view/published-data-api), monthly archives | none | All finished games (PGN with clocks, accuracy if reviewed), stats snapshot incl. tactics rating |
| **Lichess games** | `GET /api/games/user/{name}` NDJSON stream | optional token (3x faster) | All games with clocks, engine evals and accuracy if analysed, opening names |
| **Lichess puzzles** | `GET /api/puzzle/activity` | token with `puzzle:read` | Every puzzle attempt: FEN, solution, themes, rating, solved or not |
| **OTB / other PGN** | `import-pgn` file or folder | n/a | Any PGN; `--me` says which player is you |

### Lichess token

Create one at
<https://lichess.org/account/oauth/token/create?scopes[]=puzzle:read&description=knightly>
(only the `puzzle:read` scope), then store it in the macOS Keychain. The command prompts
for it, so it never lands in your shell history:

```bash
security add-generic-password -a "$USER" -s knightly-lichess -w
```

The tool looks for the token in this order: `--token`, then `$LICHESS_TOKEN`, then the Keychain.

**Known gap: Chess.com puzzle history.** Chess.com has no API for individual puzzle
attempts, only the tactics rating (captured in `snapshots`). Getting attempt-level data
would mean scraping a logged-in session, which is left out for now.

## Storage design

SQLite, one file. Tables in [`schema.sql`](src/knightly/schema.sql):

- `games`: one row per game from any source, keyed on `(source, source_id)`. Normalised
  columns are written from **your** point of view (`user_color`, `user_outcome`,
  `user_rating`, `opponent`, `user_accuracy`), plus `moves_san`, `eco`/`opening`,
  `speed`, and the full original `pgn` (with clock and eval comments).
- `puzzle_attempts`: one row per attempt (`success`, `fen`, `solution`, `themes` JSON).
- `snapshots`: point-in-time copies of profile/stats endpoints (rating history).
- `moves`: one row per half-move of every analysed game: position, your move vs. the
  engine's best, evals before/after, centipawn loss, win% before/after, accuracy,
  `classification` (brilliant / great / best / excellent / good / inaccuracy / mistake / blunder / miss), `phase`, clock left and
  time spent. Filled by `analyze`.
- `game_analysis`: per-game engine summary (accuracy, ACPL, blunder/mistake counts).
- `runs`: one row per `update` (status, counts, errors).
- `settings`: app settings changed from the web app, e.g. `analysis_depth`.
- `engine_lines`: cached "Why" / "Best line" engine lines per move, filled on demand by game
  review.
- `accounts`, `sync_state`: which handles are yours and the incremental-sync cursors.

Principles:
1. **Keep the raw payload** (`pgn`, `raw` JSON) on every row. New columns can be
   back-filled by re-parsing, without re-downloading.
2. **Idempotent imports.** Re-running any sync or import is safe. OTB games dedupe on a
   hash of players, date and moves.
3. **Incremental.** Chess.com resumes from the last month synced. Lichess resumes from
   the last game timestamp.
4. **Normalise once, analyse anywhere.** Every source goes through `pgn.py`, so the
   analysis layer never needs to know where a game came from.

## Daily updates

`knightly update` runs the whole pipeline: sync every known account, analyse new
games, back up the database to `backups/` (one copy per day, newest 7 kept), and record
the run in the `runs` table. A second copy started while one is running exits straight away.

To run it every day at 06:00 via launchd (if the Mac is asleep then, it runs on wake):

```bash
uv run knightly schedule install      # --hour / --minute to change the time
uv run knightly schedule              # status + recent runs
uv run knightly schedule run-now      # trigger the scheduled job immediately
uv run knightly schedule uninstall
```

Scheduled runs use 3 Stockfish workers at low priority, log to
`~/Library/Logs/knightly.log`, and show a macOS notification if any step fails. The
job runs `.venv/bin/knightly` from this folder, so re-run `schedule install` if you
move the project or recreate the virtualenv.

## Engine analysis

`knightly analyze` runs [Stockfish](https://stockfishchess.org/) (`brew install stockfish`)
over every game that doesn't have analysis yet, at depth 18 by default, with one
single-threaded engine per CPU core. It saves one game at a time, so you can stop it with
Ctrl-C and re-run it to continue. Run it after each `sync` to analyse new games.

Moves are classified with Chess.com's bands, by how many points the mover's win chance
dropped: the engine's move is **best**, under 2 is **excellent**, 2-5 **good**, 5-10 an
**inaccuracy**, 10-20 a **mistake**, 20+ a **blunder**. A **miss** is a reply that gives up
10+ points straight after the opponent's own 10+ point error, i.e. failing to cash in;
it replaces mistake/blunder for that move.

**Great** and **Brilliant** follow Chess.com's definitions, with rules modelled on the
open-source [WintrChess](https://github.com/WintrCat/wintrchess) reviewer (see
[`brilliance.py`](src/knightly/brilliance.py)). Neither is given when the second-best
move would still have been completely winning (+7), when you're worse after the move, or
when escaping check. A **great** move is the engine's top choice when its second choice
would have cost 10+ points, and isn't just taking free material. A **brilliant** move is a
top move that leaves a piece en prise (judged on the board, so a sacrifice the opponent
should decline still counts), unless the piece was lost anyway or taking it backfires.
Great needs the engine's second-best move, so games analysed before it was added need
`analyze --force` to get it. (Chess.com's Book isn't computed.) Accuracy uses
Lichess's per-move formula, so it runs a bit higher than Chess.com's own accuracy numbers.

After changing the thresholds in `analyze.py`, re-label saved moves without re-running the
engine:

```bash
uv run knightly analyze --reclassify
```

## Web app

`knightly serve` runs a FastAPI app ([`api.py`](src/knightly/api.py)) over the
database and serves the React frontend in [`web/`](web/) (Vite, TypeScript, shadcn/ui,
Recharts). Pages read through a read-only connection, so it's safe to leave running during
`sync` or `analyze`. It listens on 127.0.0.1 only.

```bash
cd web && pnpm install && pnpm build && cd ..   # once, and after frontend changes
uv run knightly serve
```

For frontend work, run `uv run knightly serve` and `pnpm --dir web dev` side by side and
open <http://localhost:5173>. Vite proxies `/api` to the Python server and hot-reloads.

**Overview** shows rating, games played and analysed, and the improvement KPIs below, each
compared with the previous period of the same length. Every KPI links to the games behind it.

| KPI | Definition |
|---|---|
| Blunders per game | Your moves that lost 20+ points, per analysed game, whatever their label (so misses that size count) |
| Win conversion | Of games where your win chance reached 80%+, the share you won. Losses are "thrown wins" |
| Punish rate | Of opponent moves that lost 20+ points, the share you answered with a best, excellent or good move |
| Accuracy | Mean engine accuracy. Chess.com's own numbers are left out because they use a lower scale |
| Opening edge | Mean eval after move 10 (ply 20) from your side, in pawns |
| Comeback rate | Of games where your win chance fell to 20% or below, the share you didn't lose |

Rated games only. Engine KPIs only count analysed games. A comparison is skipped when the
previous period has fewer than 10 games behind it.

**Games** is a searchable, filterable list (speed, color, result, date range, analysed,
unrated). Filters live in the URL, e.g. `/games?kpi=thrown&range=30d`. Click a game to
review it.

**Game review** (`/games/<id>`) is a lesson, one step per key moment: where one move was
clearly better you find it on the board (see Practice below: the same try again and Hint,
and your answer is that position's answer for the day); where no single move fixes it the
step shows what happened; a great move gets a gold sheet. **All moves**
(`/games/<id>/moves?ply=<n>`) is the whole game: eval bar, both clocks, your win chance over
the game with the key moments on it, the move you're on, and the move list. ← → step
through the game, Home / End jump to the ends. Finish review saves a mark per step for
**Review complete**.

**Practice** (`/practice`) is spaced repetition over positions from your own games
([`deck.py`](src/knightly/deck.py)), inspired by Anki (decided Oct 2026): it schedules
with FSRS, the scheduler Anki uses by default, and grades your *first* try of the day
with Anki's buttons. The engine's move within 10 seconds (no hint) is Easy; the best move,
or one within 2 points of win chance of it (judged by Stockfish), or any mate, is Good; within 5 points ("Good move! Best was …") is Hard;
anything else, a hint first, or Show me is Again. A wrong move slides back so you can try
again; **Hint** lights up the piece to move, then shows the move as an arrow. Positions
you didn't get first time come back once more at the end of the session (Duolingo's redo,
standing in for Anki's relearning steps), and that go doesn't change the grade. At most 10
positions a day. Puzzles (`/puzzles`, Lichess puzzles for your most common tactic) work
the same way, without the scheduling.

FSRS starts with its default settings. Once you have 512 graded answers, tune it to your own
memory, as Anki's Optimize does (Settings › Analysis shows how far along you are):

```bash
uv sync --extra optimizer        # once: the optimizer needs PyTorch, a large download
uv run knightly fsrs-optimize
```

For any move worse than Good, **Why** and **Best line** play an engine line on the board
(drawn in blue, so it never looks like the real game): how the move gets punished, or what
should have been played. Lines come from Stockfish on the first click (about a second, at
the Settings depth), are cached in `engine_lines`, and come with a one-line explanation
written from what the line actually does: mate, material won or lost, or the swing in win
chance ([`lines.py`](src/knightly/lines.py)). ← → step through the line, Esc returns.

**Play** (`/play`) is a game against Stockfish in the same layout as game review: pick a
strength from 250 to full strength and a color, then move by dragging or clicking (legal
moves show as dots; promotions make a queen). Resign, take back, and hint (first the piece to
move, then the engine's best move as a green arrow) sit under the move list. Stockfish only plays as weak as about 1320
Elo, so below that the bot picks among its top moves at random, more loosely the lower the
rating ([`play.py`](src/knightly/play.py)). A game in progress survives leaving the page
or reloading. A finished game is saved as an unrated game with source `bot`, so it stays out
of the overview's stats, and analysed straight away (spread over every core, about 20s for a
40-move game at depth 18); **Review game** opens it in game review.

**Settings** (the gear at the bottom of the sidebar):

- *Appearance*: theme, board colors, whether the best move shows automatically in game
  review, and the overview's default range. Saved in the browser only.
- *Accounts*: add or remove Chess.com / Lichess accounts (removing one keeps its games),
  and whether a Lichess token is saved. The token itself is only ever set from the terminal.
- *Daily update*: turn the launchd job on or off, change its time, see the last run, and
  run it now. A running update shows each step live (sync per account, analysis "3 of 5
  games", backup); it runs outside the browser, so closing or reloading the page is fine.
- *Analysis*: Stockfish depth (stored in the `settings` table; `analyze` and `update` use it
  unless `--depth` is passed).
- *Data*: database and backup locations and sizes.

These, cached engine lines, games played on Play, finished reviews and the review deck are the app's only writes to the
database.

### Sounds

The board's sounds are made in the browser. To use your own recordings instead, put any of
`move-self.mp3` (a move), `capture.mp3` (a capture), `game-start.mp3` (starting a game vs the
bot) and `game-end.mp3` (a checkmate) in a `sounds/` folder beside `chess.db` (it's
gitignored: other people's sounds shouldn't end up in this repo). Reload the page; there's
nothing to rebuild. Without them, the built-in sounds play.

## Example queries

```sql
-- Score by opening as black
SELECT eco, opening, count(*) n, avg(user_outcome='win') win_rate
FROM games WHERE user_color='black' GROUP BY eco ORDER BY n DESC;

-- Where do my blunders happen, and am I short on time when they do?
SELECT phase, count(*) blunders, round(avg(clock_left)) avg_clock_secs
FROM moves WHERE is_user AND classification = 'blunder' GROUP BY phase;

-- Puzzle themes I fail most
SELECT t.value theme, count(*) n, avg(success) solved
FROM puzzle_attempts, json_each(themes) t GROUP BY 1 HAVING n >= 10 ORDER BY solved;
```

## Next steps (not built yet)

- `positions` table: run Stockfish over each game and store per-move evals. That is the
  base for blunder detection and for turning your own mistakes into puzzles.
- Clock analysis from `%clk` comments (time-trouble patterns).
- Chess.com puzzle history (no API, see above).

## License

[MIT](LICENSE)
