# chessprofile

Pull all of your chess data (Chess.com, Lichess, over-the-board PGNs, notes) into a
single SQLite file, so analyzers can run against one consistent dataset later.

## Quick start

```bash
uv sync
uv run chessprofile sync chesscom <username>            # all games, every month
uv run chessprofile sync lichess  <username> --token lip_xxx   # games + puzzle history
uv run chessprofile import-pgn ~/otb-games/ --me "Hansen, Hunter"
uv run chessprofile note "I rush in time trouble" --tag time --game 42
uv run chessprofile sync                                 # later: incremental re-sync of all accounts
uv run chessprofile analyze                              # Stockfish pass over new games
uv run chessprofile stats
uv run chessprofile serve                                # web app at http://127.0.0.1:8000
sqlite3 chess.db                                         # it's just SQL from here
```

The DB path defaults to `./chess.db` (override with `--db` or `CHESSPROFILE_DB`).
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
<https://lichess.org/account/oauth/token/create?scopes[]=puzzle:read&description=chessprofile>
(only the `puzzle:read` scope), then store it in the macOS Keychain. The command prompts
for it, so it never lands in your shell history:

```bash
security add-generic-password -a "$USER" -s chessprofile-lichess -w
```

The tool looks for the token in this order: `--token`, then `$LICHESS_TOKEN`, then the Keychain.

**Known gap: Chess.com puzzle history.** Chess.com has no API for individual puzzle
attempts, only the tactics rating (captured in `snapshots`). Getting attempt-level data
would mean scraping a logged-in session, which is left out for now.

## Storage design

SQLite, one file. Tables in [`schema.sql`](src/chessprofile/schema.sql):

- `games`: one row per game from any source, keyed on `(source, source_id)`. Normalised
  columns are written from **your** point of view (`user_color`, `user_outcome`,
  `user_rating`, `opponent`, `user_accuracy`), plus `moves_san`, `eco`/`opening`,
  `speed`, and the full original `pgn` (with clock and eval comments).
- `puzzle_attempts`: one row per attempt (`success`, `fen`, `solution`, `themes` JSON).
- `snapshots`: point-in-time copies of profile/stats endpoints (rating history).
- `notes`: your learnings, optionally linked to a game or FEN.
- `moves`: one row per half-move of every analysed game: position, your move vs. the
  engine's best, evals before/after, centipawn loss, win% before/after, accuracy,
  `classification` (best / excellent / good / inaccuracy / mistake / blunder / miss), `phase`, clock left and
  time spent. Filled by `analyze`.
- `game_analysis`: per-game engine summary (accuracy, ACPL, blunder/mistake counts).
- `runs`: one row per `update` (status, counts, errors).
- `settings`: app settings changed from the web app, e.g. `analysis_depth`.
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

`chessprofile update` runs the whole pipeline: sync every known account, analyse new
games, back up the database to `backups/` (one copy per day, newest 7 kept), and record
the run in the `runs` table. A second copy started while one is running exits straight away.

To run it every day at 06:00 via launchd (if the Mac is asleep then, it runs on wake):

```bash
uv run chessprofile schedule install      # --hour / --minute to change the time
uv run chessprofile schedule              # status + recent runs
uv run chessprofile schedule run-now      # trigger the scheduled job immediately
uv run chessprofile schedule uninstall
```

Scheduled runs use 3 Stockfish workers at low priority, log to
`~/Library/Logs/chessprofile.log`, and show a macOS notification if any step fails. The
job runs `.venv/bin/chessprofile` from this folder, so re-run `schedule install` if you
move the project or recreate the virtualenv.

## Engine analysis

`chessprofile analyze` runs [Stockfish](https://stockfishchess.org/) (`brew install stockfish`)
over every game that doesn't have analysis yet, at depth 18 by default, with one
single-threaded engine per CPU core. It saves one game at a time, so you can stop it with
Ctrl-C and re-run it to continue. Run it after each `sync` to analyse new games.

Moves are classified with Chess.com's bands, by how many points the mover's win chance
dropped: the engine's move is **best**, under 2 is **excellent**, 2-5 **good**, 5-10 an
**inaccuracy**, 10-20 a **mistake**, 20+ a **blunder**. A **miss** is a reply that gives up
10+ points straight after the opponent's own 10+ point error, i.e. failing to cash in;
it replaces mistake/blunder for that move. (Chess.com's Great, Brilliant and Book need
second-best-move analysis or an opening book and aren't computed.) Accuracy uses
Lichess's per-move formula, so it runs a bit higher than Chess.com's own accuracy numbers.

After changing the thresholds in `analyze.py`, re-label saved moves without re-running the
engine:

```bash
uv run chessprofile analyze --reclassify
```

## Web app

`chessprofile serve` runs a FastAPI app ([`api.py`](src/chessprofile/api.py)) over the
database and serves the React frontend in [`web/`](web/) (Vite, TypeScript, shadcn/ui,
Recharts). Pages read through a read-only connection, so it's safe to leave running during
`sync` or `analyze`. It listens on 127.0.0.1 only.

```bash
cd web && pnpm install && pnpm build && cd ..   # once, and after frontend changes
uv run chessprofile serve
```

For frontend work, run `uv run chessprofile serve` and `pnpm --dir web dev` side by side and
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

**Game review** (`/games/<id>?ply=<n>`) replays a game from your side: eval bar, both
clocks as they stood at that move, the last move in yellow with its classification badge,
and the engine's better move as a green arrow when you (or they) went wrong. The sidebar
has a win-chance graph (click to jump), the selected move explained, and Moves / Key
moments tabs. ← → step through the game, Home / End jump to the ends.

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

These are the app's only writes to the database.

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
