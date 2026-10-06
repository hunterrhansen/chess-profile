"""`chessprofile update`: the whole pipeline in one step, for running on a schedule.

    lock -> sync every account -> analyse new games -> back up the DB -> record the run

Every step is idempotent and incremental, so a run that fails or is cut short (laptop
asleep, network down) is simply finished by the next one; there is no retry logic.
"""

import fcntl
import json
import sqlite3
import subprocess
from datetime import datetime
from pathlib import Path

from . import analyze
from .sources import chesscom, lichess

KEEP_BACKUPS = 7


def sync_accounts(conn, targets, token: str | None, since: str | None = None,
                  puzzles: bool = True, log=print) -> tuple[int, int, list[str]]:
    """Sync each (source, username). Returns (new games, new puzzle attempts, errors);
    one account failing doesn't stop the others."""
    games = puzzle_attempts = 0
    errors = []
    for source, username in targets:
        log(f"Syncing {source}:{username}")
        try:
            if source == "chesscom":
                n = chesscom.sync(conn, username, since=since, log=log)
                log(f"  -> {n} new games")
                games += n
                continue
            n = lichess.sync_games(conn, username, token=token, since=since, log=log)
            log(f"  -> {n} new games")
            games += n
            if not puzzles:
                continue
            if token:
                n = lichess.sync_puzzles(conn, username, token, log=log)
                log(f"  -> {n} new puzzle attempts")
                puzzle_attempts += n
            else:
                log("  (skipping puzzles: no Lichess token found; see README > Lichess token)")
        except Exception as e:
            log(f"  failed: {e}")
            errors.append(f"sync {source}:{username}: {e}")
    return games, puzzle_attempts, errors


def known_accounts(conn) -> list[tuple[str, str]]:
    return [(r["source"], r["handle"]) for r in conn.execute(
        "SELECT source, handle FROM accounts WHERE source IN ('chesscom', 'lichess') ORDER BY source")]


def backup(conn, db_path: Path, backup_dir: Path | None = None, keep: int = KEEP_BACKUPS) -> Path:
    """Consistent online copy of the DB to backups/chess-YYYY-MM-DD.db (one per day, newest
    wins), pruning all but the newest `keep`."""
    backup_dir = backup_dir or db_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    dest = backup_dir / f"{db_path.stem}-{datetime.now():%Y-%m-%d}.db"
    target = sqlite3.connect(dest)
    try:
        conn.backup(target)
    finally:
        target.close()
    for old in sorted(backup_dir.glob(f"{db_path.stem}-????-??-??.db"))[:-keep]:
        old.unlink()
    return dest


def notify(title: str, message: str) -> None:
    """macOS notification; silently does nothing elsewhere."""
    script = f"display notification {json.dumps(message)} with title {json.dumps(title)}"
    try:
        subprocess.run(["osascript", "-e", script], capture_output=True, timeout=10)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass


class AlreadyRunning(Exception):
    pass


class Lock:
    """Exclusive, non-blocking lock on <db>.lock; released automatically if the process dies."""

    def __init__(self, db_path: Path):
        self.path = db_path.with_name(db_path.name + ".lock")

    def __enter__(self):
        self.file = open(self.path, "w")
        try:
            fcntl.flock(self.file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.file.close()
            raise AlreadyRunning(f"another update is running ({self.path})") from None
        return self

    def __exit__(self, *exc):
        fcntl.flock(self.file, fcntl.LOCK_UN)
        self.file.close()


def _finish(conn, run_id: int, **fields) -> None:
    sets = ", ".join(f"{k} = ?" for k in fields)
    with conn:
        conn.execute(f"UPDATE runs SET {sets}, finished_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') "
                     "WHERE id = ?", [*fields.values(), run_id])


def run(conn, db_path: Path, token: str | None, workers: int | None = None, depth: int = 18,
        engine_path: str | None = None, backup_dir: Path | None = None, keep: int = KEEP_BACKUPS,
        trigger: str = "manual", notify_on_failure: bool = False, log=print) -> str:
    """Run the pipeline once. Returns the run's status: ok | partial | failed | skipped."""
    db_path = Path(db_path).resolve()
    try:
        with Lock(db_path):
            return _run_locked(conn, db_path, token, workers, depth, engine_path, backup_dir,
                               keep, trigger, notify_on_failure, log)
    except AlreadyRunning as e:
        log(f"Skipping: {e}")
        return "skipped"


def _run_locked(conn, db_path, token, workers, depth, engine_path, backup_dir, keep, trigger,
                notify_on_failure, log) -> str:
    with conn:
        run_id = conn.execute("INSERT INTO runs (status, trigger) VALUES ('running', ?)",
                              (trigger,)).lastrowid
    errors, counts = [], {}
    try:
        games, puzzles, sync_errors = sync_accounts(conn, known_accounts(conn), token, log=log)
        counts.update(new_games=games, new_puzzles=puzzles)
        errors += sync_errors

        try:  # analysis still covers games from earlier runs even if today's sync failed
            counts["games_analysed"] = analyze.run(conn, depth=depth, workers=workers,
                                                   engine_path=engine_path, log=log)
        except (Exception, SystemExit) as e:  # SystemExit: Stockfish not installed
            log(f"Analysis failed: {e}")
            errors.append(f"analyze: {e}")

        try:
            dest = backup(conn, db_path, backup_dir, keep)
            counts["backup_path"] = str(dest)
            log(f"Backed up to {dest}")
        except Exception as e:
            log(f"Backup failed: {e}")
            errors.append(f"backup: {e}")
    except BaseException as e:  # anything unexpected, incl. Ctrl-C: record it, then re-raise
        errors.append(f"{type(e).__name__}: {e}")
        _finish(conn, run_id, status="failed", errors=json.dumps(errors), **counts)
        if notify_on_failure:
            notify("chessprofile update failed", errors[-1])
        raise

    status = "partial" if errors else "ok"
    _finish(conn, run_id, status=status, errors=json.dumps(errors) if errors else None, **counts)
    log(f"Update {status}: {counts.get('new_games', 0)} new games, "
        f"{counts.get('new_puzzles', 0)} new puzzle attempts, "
        f"{counts.get('games_analysed', 0)} games analysed.")
    if errors and notify_on_failure:
        notify("chessprofile update had problems", "; ".join(errors)[:200])
    return status
