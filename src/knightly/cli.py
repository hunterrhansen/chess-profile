import argparse
import os
import subprocess
import sys
from contextlib import closing
from pathlib import Path

from . import analyze, bench, config, db, deck, patterns, puzzles, schedule, sqlite_import, update
from .sources import pgn_file


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


KEYCHAIN_SERVICE = "knightly-lichess"


def keychain_token() -> str | None:
    """Lichess token from the macOS Keychain, stored with:
    security add-generic-password -a "$USER" -s knightly-lichess -w
    """
    if not config.on_mac():
        return None
    try:
        out = subprocess.run(["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
                             capture_output=True, text=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None
    return out.stdout.strip() or None


def lichess_token(explicit: str | None = None) -> str | None:
    return explicit or os.environ.get("LICHESS_TOKEN") or keychain_token()


def cmd_sync(conn, args) -> None:
    if args.source:
        if not args.username:
            sys.exit("usage: knightly sync {chesscom,lichess} USERNAME")
        targets = [(args.source, args.username)]
    else:  # re-sync every account we've seen before
        targets = update.known_accounts(conn)
        if not targets:
            sys.exit("No accounts yet. Start with e.g. `knightly sync lichess <username>`.")
    update.sync_accounts(conn, targets, lichess_token(args.token), since=args.since,
                         puzzles=not args.no_puzzles, log=log)


def cmd_update(conn, args) -> None:
    status = update.run(conn, lichess_token(), workers=args.workers,
                        depth=db.analysis_depth(conn),
                        trigger="schedule" if args.scheduled else "manual",
                        notify_on_failure=args.scheduled, log=log)
    if status == "partial":
        sys.exit(1)


def cmd_schedule(conn, args) -> None:
    if args.action == "install":
        schedule.install(args.db, hour=args.hour, minute=args.minute, log=log)
    elif args.action == "uninstall":
        schedule.uninstall(log=log)
    elif args.action == "run-now":
        schedule.run_now(log=log)
    else:
        schedule.status(conn, log=log)


def cmd_import_pgn(conn, args) -> None:
    if not args.me:
        log("warning: no --me given, so games won't be attributed to you (win/loss, color...).")
    n = pgn_file.import_paths(conn, [Path(p) for p in args.paths], args.me or [],
                              source=args.source, speed=args.speed, log=log)
    log(f"-> {n} new games")





def cmd_analyze(conn, args) -> None:
    if args.reclassify:
        analyze.reclassify(conn, log=log)
        return
    try:
        n = analyze.run(conn, depth=args.depth or db.analysis_depth(conn), workers=args.workers,
                        engine_path=args.engine, force=args.force, limit=args.limit, log=log)
    except KeyboardInterrupt:
        sys.exit(130)
    if n:
        log(f"-> {n} games analysed")


def cmd_bench(conn, args) -> None:
    import chess.engine

    limits = [chess.engine.Limit(depth=args.depth)]
    limits += [chess.engine.Limit(nodes=n) for n in args.nodes or [1_000_000]]
    results = bench.run(conn, limits, games=args.games, engine_path=args.engine, log=log)
    pct = lambda v: "-" if v is None else f"{100 * v:.0f}%"
    print(f"\n{'setting':<14}{'s/game':>8}{'CPU-min/game':>14}{'ms/position':>13}"
          f"{'same label':>12}{'same best':>11}")
    for r in results:
        print(f"{r['setting']:<14}{r['seconds_per_game']:>8.1f}{r['seconds_per_game'] / 60:>14.2f}"
              f"{1000 * r['seconds_per_position']:>13.0f}{pct(r['label_agreement']):>12}"
              f"{pct(r['best_agreement']):>11}")
    print("\nsame label / same best: your moves labelled alike / with the same best move as the first row.")


def cmd_patterns(conn, args) -> None:
    with conn:
        n = patterns.tag_all(conn)
    log(f"{n} new mistakes tagged from the moves already stored")
    try:
        m = patterns.deepen(conn, args.engine, workers=args.workers, log=log)
    except KeyboardInterrupt:
        sys.exit(130)
    log(f"-> {m} more tagged from the engine's lines")


def cmd_fsrs_optimize(conn, args) -> None:
    try:
        result = deck.tune(conn)
    except ImportError:
        raise SystemExit("The FSRS optimizer isn't installed. Install it with `uv sync --extra optimizer` "
                         "(it brings PyTorch, a large download), then run this again.") from None
    conn.commit()
    if result["tuned"]:
        log(f"Tuned FSRS to your {result['reviews']} reviews. The review deck uses these from now on.")
    else:
        log(f"Not enough reviews to tune yet: {result['reviews']} of {result['needed']}. "
            "The deck keeps FSRS's default settings, which are fine until then.")


def cmd_puzzles(conn, args) -> None:
    kept = puzzles.import_file(conn, args.file, log=log)
    for theme, n in kept.items():
        log(f"  {theme}: {n}")


def cmd_stats(conn, args) -> None:
    def table(title, sql):
        rows = conn.execute(sql).fetchall()
        print(f"\n{title}")
        if not rows:
            print("  (none)")
            return
        cols = rows[0].keys()
        widths = [max(len(str(c)), *(len(str(r[c])) for r in rows)) for c in cols]
        print("  " + "  ".join(str(c).ljust(w) for c, w in zip(cols, widths)))
        for r in rows:
            print("  " + "  ".join(str(r[c]).ljust(w) for c, w in zip(cols, widths)))

    table("Games by source / speed", """
        SELECT source, coalesce(speed, '-') AS speed, count(*) AS games,
               count(*) FILTER (WHERE user_outcome = 'win') AS w,
               count(*) FILTER (WHERE user_outcome = 'draw') AS d,
               count(*) FILTER (WHERE user_outcome = 'loss') AS l,
               round(100 * avg(CASE user_outcome WHEN 'win' THEN 1 WHEN 'draw' THEN 0.5
                                                 WHEN 'loss' THEN 0 END)) || '%' AS score,
               min(substr(played_at, 1, 10)) AS first, max(substr(played_at, 1, 10)) AS last
        FROM games GROUP BY 1, 2 ORDER BY 3 DESC""")
    table("Most played openings (as each color, min 5 games)", """
        SELECT user_color AS color, eco, coalesce(max(opening), '') AS opening, count(*) AS games,
               round(100 * avg(CASE user_outcome WHEN 'win' THEN 1 WHEN 'draw' THEN 0.5
                                                 WHEN 'loss' THEN 0 END)) || '%' AS score
        FROM games WHERE user_color IS NOT NULL AND eco IS NOT NULL
        GROUP BY 1, 2 HAVING count(*) >= 5 ORDER BY 4 DESC LIMIT 12""")
    table("Puzzle attempts", """
        SELECT source, count(*) AS attempts, round(100 * avg(success)) || '%' AS solved,
               min(substr(attempted_at, 1, 10)) AS first, max(substr(attempted_at, 1, 10)) AS last
        FROM puzzle_attempts GROUP BY 1""")
    table("Weakest puzzle themes (min 10 attempts)", """
        SELECT t.theme, count(*) AS attempts, round(100 * avg(success)) || '%' AS solved
        FROM puzzle_attempts, jsonb_array_elements_text(puzzle_attempts.themes::jsonb) AS t(theme)
        GROUP BY 1 HAVING count(*) >= 10 ORDER BY avg(success) LIMIT 10""")
    table("Other", """
        SELECT (SELECT count(*) FROM snapshots) AS snapshots,
               (SELECT string_agg(source || ':' || handle, ', ') FROM accounts) AS accounts""")


def cmd_migrate(conn, args) -> None:
    log("Database is up to date.")  # connecting applied any pending migrations


def cmd_import_sqlite(conn, args) -> None:
    counts = sqlite_import.run(conn, Path(args.file), log=log)
    for table, n in counts.items():
        log(f"  {table}: {n:,}")


def cmd_serve(conn, args) -> None:
    import uvicorn

    from .api import create_app

    dist = Path(__file__).resolve().parents[2] / "web" / "dist"
    if not dist.is_dir():
        log(f"No built frontend at {dist}; serving the API only. Build it with: cd web && pnpm build")
    uvicorn.run(create_app(args.db, dist), host=args.host, port=args.port)


def main(argv=None) -> None:
    p = argparse.ArgumentParser(prog="knightly", description=__doc__ or
                                "Aggregate your chess data into one Postgres database.")
    p.add_argument("--db", default=db.DEFAULT_URL,
                   help="Postgres URL (default: $KNIGHTLY_DATABASE_URL or postgresql:///knightly)")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("sync", help="Pull games (and Lichess puzzles) from Chess.com / Lichess. "
                                    "With no arguments, re-syncs every known account.")
    s.add_argument("source", nargs="?", choices=["chesscom", "lichess"])
    s.add_argument("username", nargs="?")
    s.add_argument("--since", help="Only fetch games from this month on, e.g. 2024-01 (first import)")
    s.add_argument("--token", help="Lichess personal access token (or set LICHESS_TOKEN)")
    s.add_argument("--no-puzzles", action="store_true", help="Skip Lichess puzzle activity")
    s.set_defaults(func=cmd_sync)

    s = sub.add_parser("import-pgn", help="Import PGN files or folders (over-the-board games, etc.)")
    s.add_argument("paths", nargs="+")
    s.add_argument("--me", action="append", metavar="NAME",
                   help='Your name as it appears in the PGN, e.g. "Hansen, Hunter". Repeatable.')
    s.add_argument("--source", default="otb", help="Label for these games (default: otb)")
    s.add_argument("--speed", help="classical | rapid | blitz ... (optional)")
    s.set_defaults(func=cmd_import_pgn)

    s = sub.add_parser("analyze", help="Run Stockfish over games that haven't been analysed yet "
                                       "(per-move evals, blunders, time use). Safe to interrupt.")
    s.add_argument("--depth", type=int,
                   help="Search depth per position (default: the Settings value, else 18)")
    s.add_argument("--workers", type=int, help="Parallel engine processes (default: CPU cores - 1)")
    s.add_argument("--engine", help="Path to Stockfish (default: $STOCKFISH or `stockfish` on PATH)")
    s.add_argument("--limit", type=int, help="Only analyse this many games (most recent first)")
    s.add_argument("--force", action="store_true", help="Re-analyse games that already have analysis")
    s.add_argument("--reclassify", action="store_true",
                   help="Re-label saved moves (best ... blunder, miss) without running the engine")
    s.set_defaults(func=cmd_analyze)

    s = sub.add_parser("bench", help="Time engine analysis per game at a fixed depth against node "
                                     "budgets, on the newest games (nothing is saved)")
    s.add_argument("--games", type=int, default=5, help="How many of the newest games (default: 5)")
    s.add_argument("--depth", type=int, default=18, help="The fixed depth to compare with (default: 18)")
    s.add_argument("--nodes", type=int, action="append",
                   help="A node budget per position; repeatable (default: 1000000)")
    s.add_argument("--engine", help="Path to Stockfish (default: $STOCKFISH or `stockfish` on PATH)")
    s.set_defaults(func=cmd_bench)

    s = sub.add_parser("patterns", help="Tag each of your mistakes with the tactic behind it "
                                        "(fork, pin, loose piece...). The daily update does this too.")
    s.add_argument("--workers", type=int, help="Parallel engine processes (default: CPU cores - 1)")
    s.add_argument("--engine", help="Path to Stockfish (default: $STOCKFISH or `stockfish` on PATH)")
    s.set_defaults(func=cmd_patterns)

    s = sub.add_parser("puzzles", help="Import puzzles for your weak tactics from the Lichess puzzle "
                                       "database (lichess_db_puzzle.csv.zst from database.lichess.org)")
    s.add_argument("file", help="Path to lichess_db_puzzle.csv.zst (or the unpacked .csv)")
    s.set_defaults(func=cmd_puzzles)

    s = sub.add_parser("update", help="Sync every account, analyse new games, back up the DB. "
                                      "What the daily schedule runs.")
    s.add_argument("--workers", type=int, help="Parallel engine processes (default: CPU cores - 1)")
    s.add_argument("--scheduled", action="store_true",
                   help="Mark the run as scheduled and send a macOS notification on problems")
    s.set_defaults(func=cmd_update)

    s = sub.add_parser("schedule", help="Manage the daily `update` launchd job (macOS)")
    s.add_argument("action", nargs="?", default="status",
                   choices=["status", "install", "uninstall", "run-now"])
    s.add_argument("--hour", type=int, default=6, help="Hour to run, 0-23 (default: 6)")
    s.add_argument("--minute", type=int, default=0)
    s.set_defaults(func=cmd_schedule)

    s = sub.add_parser("fsrs-optimize", help="Tune the review deck's FSRS scheduler to your own answers, "
                       "like Anki's Optimize (needs 512+ reviews and `uv sync --extra optimizer`)")
    s.set_defaults(func=cmd_fsrs_optimize)

    s = sub.add_parser("stats", help="Summary of what's in the database")
    s.set_defaults(func=cmd_stats)

    s = sub.add_parser("migrate", help="Apply any pending database migrations (every command does "
                                       "this on connecting; this does only that)")
    s.set_defaults(func=cmd_migrate)

    s = sub.add_parser("import-sqlite", help="Copy everything from a SQLite chess.db (Knightly before "
                                             "Postgres) into this database, which must be empty")
    s.add_argument("file", help="Path to chess.db")
    s.set_defaults(func=cmd_import_sqlite)

    s = sub.add_parser("serve", help="Run the web app at http://127.0.0.1:8000")
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--port", type=int, default=8000)
    s.set_defaults(func=cmd_serve)

    args = p.parse_args(argv)
    with closing(db.connect(args.db)) as conn:
        args.func(conn, args)


if __name__ == "__main__":
    main()
