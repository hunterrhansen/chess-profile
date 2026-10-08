"""`knightly update`: the whole pipeline in one step, for running on a schedule.

    lock -> sync every account -> analyse new games -> back up the DB -> record the run

Every step is idempotent and incremental, so a run that fails or is cut short (laptop
asleep, network down) is simply finished by the next one; there is no retry logic.
"""

import json
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

from psycopg.conninfo import make_conninfo

from . import analyze, config, patterns
from .sources import chesscom, lichess

KEEP_BACKUPS = 7


class Progress:
    """Live step-by-step state of a run, saved to `runs.progress` so the web app can show
    which step is running. Steps are keyed "sync:<source>:<handle>", "analyze", "backup"."""

    def __init__(self, conn=None, run_id: int | None = None, plan: list[str] | None = None):
        self.conn, self.run_id = conn, run_id
        self.state = {"plan": plan or [], "current": None, "detail": None, "done": []}

    def _save(self) -> None:
        if self.conn is None:  # e.g. `knightly sync`, which has no run row
            return
        with self.conn:
            self.conn.execute("UPDATE runs SET progress = ? WHERE id = ?",
                              (json.dumps(self.state), self.run_id))

    def start(self, key: str, detail: str | None = None) -> None:
        self.state.update(current=key, detail=detail)
        self._save()

    def detail(self, text: str) -> None:
        self.state["detail"] = text
        self._save()

    def finish(self, summary: str | None, error: str | None = None) -> None:
        self.state["done"].append({"key": self.state["current"], "summary": summary, "error": error})
        self.state.update(current=None, detail=None)
        self._save()


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def sync_accounts(conn, targets, token: str | None, since: str | None = None,
                  puzzles: bool = True, log=print, progress: Progress | None = None
                  ) -> tuple[int, int, list[str]]:
    """Sync each (source, username). Returns (new games, new puzzle attempts, errors);
    one account failing doesn't stop the others."""
    progress = progress or Progress()
    games = puzzle_attempts = 0
    errors = []
    for source, username in targets:
        log(f"Syncing {source}:{username}")
        progress.start(f"sync:{source}:{username}", "Fetching games")
        try:
            if source == "chesscom":
                n = chesscom.sync(conn, username, since=since, log=log)
                log(f"  -> {n} new games")
                games += n
                progress.finish(f"{_plural(n, 'new game')}")
                continue
            n = lichess.sync_games(conn, username, token=token, since=since, log=log)
            log(f"  -> {n} new games")
            games += n
            summary = _plural(n, "new game")
            if puzzles and token:
                progress.detail("Fetching puzzle attempts")
                p = lichess.sync_puzzles(conn, username, token, log=log)
                log(f"  -> {p} new puzzle attempts")
                puzzle_attempts += p
                summary += f", {_plural(p, 'puzzle attempt')}"
            elif puzzles:
                log("  (skipping puzzles: no Lichess token found; see README > Lichess token)")
                summary += " (no token, puzzles skipped)"
            progress.finish(summary)
        except Exception as e:
            log(f"  failed: {e}")
            errors.append(f"sync {source}:{username}: {e}")
            progress.finish(None, error=str(e))
    return games, puzzle_attempts, errors


def known_accounts(conn) -> list[tuple[str, str]]:
    return [(r["source"], r["handle"]) for r in conn.execute(
        "SELECT source, handle FROM accounts WHERE source IN ('chesscom', 'lichess') ORDER BY source")]


BACKUP_GLOB = "knightly-????-??-??.dump"
# Homebrew's Postgres is keg-only, so its pg_dump isn't on PATH unless you add it.
PG_DUMP_FALLBACKS = ["/opt/homebrew/opt/postgresql@17/bin/pg_dump", "/usr/local/opt/postgresql@17/bin/pg_dump"]


def backup_dir() -> Path:
    return config.data_dir() / "backups"


def pg_dump() -> str:
    found = shutil.which("pg_dump") or next((p for p in PG_DUMP_FALLBACKS if Path(p).exists()), None)
    if not found:
        raise RuntimeError("pg_dump not found (brew install postgresql@17)")
    return found


def backup(conn, folder: Path | None = None, keep: int = KEEP_BACKUPS) -> Path:
    """A pg_dump of the database to backups/knightly-YYYY-MM-DD.dump (one per day, newest
    wins), pruning all but the newest `keep`. Restore with pg_restore."""
    folder = folder or backup_dir()
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / f"knightly-{datetime.now():%Y-%m-%d}.dump"
    info = conn.pg.info
    target = make_conninfo(info.dsn, password=info.password) if info.password else info.dsn
    result = subprocess.run([pg_dump(), "--format=custom", "--file", str(dest), "--dbname", target],
                            capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"pg_dump failed: {result.stderr.strip()}")
    for old in sorted(folder.glob(BACKUP_GLOB))[:-keep]:
        old.unlink()
    return dest


def notify(title: str, message: str) -> None:
    """macOS notification; silently does nothing elsewhere."""
    if not config.on_mac():
        return
    script = f"display notification {json.dumps(message)} with title {json.dumps(title)}"
    try:
        subprocess.run(["osascript", "-e", script], capture_output=True, timeout=10)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass


class AlreadyRunning(Exception):
    pass


class Lock:
    """Exclusive, non-blocking Postgres advisory lock for this connection's session, so only
    one update runs per user at a time, from any machine; released if the process dies."""
    KEY = 4_243_002

    def __init__(self, conn):
        self.conn = conn

    def __enter__(self):
        if not self.conn.execute("SELECT pg_try_advisory_lock(?, app_user())", (self.KEY,)).fetchone()[0]:
            raise AlreadyRunning("another update is running")
        return self

    def __exit__(self, *exc):
        self.conn.execute("SELECT pg_advisory_unlock(?, app_user())", (self.KEY,))


def _finish(conn, run_id: int, **fields) -> None:
    sets = ", ".join(f"{k} = ?" for k in fields)
    with conn:
        conn.execute(f"UPDATE runs SET {sets}, finished_at = iso_now() WHERE id = ?",
                     [*fields.values(), run_id])


def run(conn, token: str | None, workers: int | None = None, depth: int | None = None,
        engine_path: str | None = None, backup_dir: Path | None = None, keep: int = KEEP_BACKUPS,
        trigger: str = "manual", notify_on_failure: bool = False, log=print,
        analyse_limit: int | None = None, sync: bool = True, nodes: int | None = None) -> str:
    """Run the pipeline once. Returns the run's status: ok | partial | failed | skipped.
    `analyse_limit` analyses at most that many games (the newest first), and `sync=False`
    leaves the accounts alone: a backfill batch (jobs.py) is both. Games get `nodes` per move
    (analyze.budget), or a fixed `depth` when that's given."""
    try:
        with Lock(conn):
            return _run_locked(conn, token, workers, depth, engine_path, backup_dir,
                               keep, trigger, notify_on_failure, log, analyse_limit, sync, nodes)
    except AlreadyRunning as e:
        log(f"Skipping: {e}")
        return "skipped"


def _run_locked(conn, token, workers, depth, engine_path, backup_dir, keep, trigger,
                notify_on_failure, log, analyse_limit, sync, nodes) -> str:
    with conn:
        run_id = conn.execute("INSERT INTO runs (status, trigger) VALUES ('running', ?) RETURNING id",
                              (trigger,)).fetchone()[0]
    errors, counts = [], {}
    targets = known_accounts(conn) if sync else []
    # The backup copies the whole database, so it's a step only on your own Mac; a server
    # backs up on its own schedule, not whenever one person updates.
    backs_up = config.on_mac() and sync
    steps = ["analyze", "patterns"] + (["backup"] if backs_up else [])
    progress = Progress(conn, run_id, [f"sync:{s}:{u}" for s, u in targets] + steps)
    try:
        games, puzzles, sync_errors = sync_accounts(conn, targets, token, log=log, progress=progress)
        counts.update(new_games=games, new_puzzles=puzzles)
        errors += sync_errors

        progress.start("analyze", "Looking for new games")
        try:  # analysis still covers games from earlier runs even if today's sync failed
            counts["games_analysed"] = analyze.run(
                conn, depth=depth, nodes=nodes, workers=workers, engine_path=engine_path, log=log, limit=analyse_limit,
                on_progress=lambda done, total: progress.detail(
                    f"{done} of {_plural(total, 'game')}" if total else "No new games"))
            n = counts["games_analysed"]
            progress.finish(_plural(n, "game") + " analysed" if n else "Nothing new to analyse")
        except (Exception, SystemExit) as e:  # SystemExit: Stockfish not installed
            log(f"Analysis failed: {e}")
            errors.append(f"analyze: {e}")
            progress.finish(None, error=str(e))

        progress.start("patterns", "Naming the tactic behind each mistake")
        try:
            with conn:
                patterns.tag_all(conn)
            n = patterns.deepen(conn, engine_path, workers=workers, log=log)
            progress.finish(_plural(n, "mistake") + " tagged" if n else "Nothing new to tag")
        except (Exception, SystemExit) as e:
            log(f"Pattern tagging failed: {e}")
            errors.append(f"patterns: {e}")
            progress.finish(None, error=str(e))

        if backs_up:
            progress.start("backup", "Copying the database")
            try:
                dest = backup(conn, backup_dir, keep)
                counts["backup_path"] = str(dest)
                log(f"Backed up to {dest}")
                progress.finish(f"Saved {dest.name}")
            except Exception as e:
                log(f"Backup failed: {e}")
                errors.append(f"backup: {e}")
                progress.finish(None, error=str(e))
    except BaseException as e:  # anything unexpected, incl. Ctrl-C: record it, then re-raise
        errors.append(f"{type(e).__name__}: {e}")
        _finish(conn, run_id, status="failed", errors=json.dumps(errors), **counts)
        if notify_on_failure:
            notify("knightly update failed", errors[-1])
        raise

    status = "partial" if errors else "ok"
    _finish(conn, run_id, status=status, errors=json.dumps(errors) if errors else None, **counts)
    log(f"Update {status}: {counts.get('new_games', 0)} new games, "
        f"{counts.get('new_puzzles', 0)} new puzzle attempts, "
        f"{counts.get('games_analysed', 0)} games analysed.")
    if errors and notify_on_failure:
        notify("knightly update had problems", "; ".join(errors)[:200])
    return status
