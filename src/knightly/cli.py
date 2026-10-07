import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

from . import analyze, db, schedule, update
from .sources import pgn_file


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


KEYCHAIN_SERVICE = "knightly-lichess"


def keychain_token() -> str | None:
    """Lichess token from the macOS Keychain, stored with:
    security add-generic-password -a "$USER" -s knightly-lichess -w
    """
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
    status = update.run(conn, Path(args.db), lichess_token(), workers=args.workers,
                        depth=db.analysis_depth(conn),
                        trigger="schedule" if args.scheduled else "manual",
                        notify_on_failure=args.scheduled, log=log)
    if status == "partial":
        sys.exit(1)


def cmd_schedule(conn, args) -> None:
    if args.action == "install":
        schedule.install(Path(args.db), hour=args.hour, minute=args.minute, log=log)
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


def cmd_note(conn, args) -> None:
    cur = conn.execute(
        "INSERT INTO notes (body, tags, game_id, fen) VALUES (?, ?, ?, ?)",
        (args.text, json.dumps(args.tag) if args.tag else None, args.game, args.fen),
    )
    conn.commit()
    log(f"Saved note #{cur.lastrowid}")


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
               sum(user_outcome = 'win') AS w, sum(user_outcome = 'draw') AS d,
               sum(user_outcome = 'loss') AS l,
               printf('%.0f%%', 100.0 * avg(CASE user_outcome WHEN 'win' THEN 1 WHEN 'draw' THEN 0.5
                                                 WHEN 'loss' THEN 0 END)) AS score,
               min(substr(played_at, 1, 10)) AS first, max(substr(played_at, 1, 10)) AS last
        FROM games GROUP BY 1, 2 ORDER BY 3 DESC""")
    table("Most played openings (as each color, min 5 games)", """
        SELECT user_color AS color, eco, coalesce(max(opening), '') AS opening, count(*) AS games,
               printf('%.0f%%', 100.0 * avg(CASE user_outcome WHEN 'win' THEN 1 WHEN 'draw' THEN 0.5
                                                 WHEN 'loss' THEN 0 END)) AS score
        FROM games WHERE user_color IS NOT NULL AND eco IS NOT NULL
        GROUP BY 1, 2 HAVING count(*) >= 5 ORDER BY 4 DESC LIMIT 12""")
    table("Puzzle attempts", """
        SELECT source, count(*) AS attempts, printf('%.0f%%', 100.0 * avg(success)) AS solved,
               min(substr(attempted_at, 1, 10)) AS first, max(substr(attempted_at, 1, 10)) AS last
        FROM puzzle_attempts GROUP BY 1""")
    table("Weakest puzzle themes (min 10 attempts)", """
        SELECT t.value AS theme, count(*) AS attempts, printf('%.0f%%', 100.0 * avg(success)) AS solved
        FROM puzzle_attempts, json_each(puzzle_attempts.themes) t
        GROUP BY 1 HAVING count(*) >= 10 ORDER BY avg(success) LIMIT 10""")
    table("Other", """
        SELECT (SELECT count(*) FROM notes) AS notes, (SELECT count(*) FROM snapshots) AS snapshots,
               (SELECT group_concat(source || ':' || handle, ', ') FROM accounts) AS accounts""")


def cmd_serve(conn, args) -> None:
    import uvicorn

    from .api import create_app

    dist = Path(__file__).resolve().parents[2] / "web" / "dist"
    if not dist.is_dir():
        log(f"No built frontend at {dist}; serving the API only. Build it with: cd web && pnpm build")
    uvicorn.run(create_app(args.db, dist), host=args.host, port=args.port)


def main(argv=None) -> None:
    p = argparse.ArgumentParser(prog="knightly", description=__doc__ or
                                "Aggregate your chess data into one SQLite database.")
    p.add_argument("--db", default=db.DEFAULT_DB, help="SQLite file (default: $KNIGHTLY_DB or ./chess.db)")
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

    s = sub.add_parser("note", help="Record a learning, optionally tied to a game or position")
    s.add_argument("text")
    s.add_argument("--tag", action="append", help="Repeatable, e.g. --tag endgame --tag time-trouble")
    s.add_argument("--game", type=int, help="games.id this note is about")
    s.add_argument("--fen", help="Position this note is about")
    s.set_defaults(func=cmd_note)

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

    s = sub.add_parser("stats", help="Summary of what's in the database")
    s.set_defaults(func=cmd_stats)

    s = sub.add_parser("serve", help="Run the web app at http://127.0.0.1:8000")
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--port", type=int, default=8000)
    s.set_defaults(func=cmd_serve)

    args = p.parse_args(argv)
    with db.connect(args.db) as conn:
        args.func(conn, args)


if __name__ == "__main__":
    main()
