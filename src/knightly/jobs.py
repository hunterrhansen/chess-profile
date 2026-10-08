"""The job queue and `knightly worker` (migrations/0004_jobs.sql).

Anything that takes minutes runs here, not in a web request: the web app (or the daily
scheduler) queues a job, and a worker claims it, runs it as that user, and marks it done.

- update:   sync the user's accounts, analyse their FIRST_BATCH newest new games, tag the
            patterns. A new account's first update imports its whole history but analyses
            only its newest games, so the app is useful within minutes.
- backfill: analyse the next BATCH of older games, at a lower priority than anyone's update,
            and queue another while games are left. Big histories trickle in without
            making anyone else wait.

A job that fails is retried, later each time, up to MAX_ATTEMPTS. A job whose worker died
mid-run (its lock older than STALE) goes back in the queue.
"""
import json
import os
import socket
import threading
from contextlib import closing
from datetime import datetime, timedelta, timezone

from . import analyze, config, db, monitoring, update

FIRST_BATCH = 50   # games an update analyses: the newest first
BATCH = 50         # games a backfill job analyses
BACKFILL_PRIORITY = -1
MAX_ATTEMPTS = 3
RETRY_AFTER = timedelta(minutes=5)   # times the attempt number
STALE = timedelta(hours=2)
DAILY = timedelta(hours=20)          # a user's update is due this long after their last
SCHEDULE_EVERY = 300                 # seconds between the scheduler's checks


def _iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def enqueue(conn, kind: str, payload: dict | None = None, priority: int = 0,
            user_id: int | None = None) -> bool:
    """Queue a job: for the connection's user, or `user_id` on the owner's connection.
    False when one of that kind is already waiting or running."""
    columns, values = ["kind", "payload", "priority"], [kind, json.dumps(payload or {}), priority]
    if user_id is not None:
        columns.append("user_id")
        values.append(user_id)
    return conn.execute(
        f"""INSERT INTO jobs ({", ".join(columns)}) VALUES ({", ".join("?" * len(columns))})
            ON CONFLICT (user_id, kind) WHERE status IN ('queued', 'running') DO NOTHING""",
        values).rowcount == 1


def pending(conn) -> list[str]:
    """The kinds of job the connection's user has waiting or running."""
    return [r[0] for r in conn.execute(
        "SELECT kind FROM jobs WHERE status IN ('queued', 'running') ORDER BY priority DESC, id")]


def claim(conn, worker: str, now: datetime | None = None):
    """The next job, now marked running by `worker`, or None. Owner's connection."""
    stamp = _iso(now or datetime.now(timezone.utc))
    return conn.execute(
        """UPDATE jobs SET status = 'running', locked_by = ?, locked_at = ?, attempts = attempts + 1
           WHERE id = (SELECT id FROM jobs WHERE status = 'queued' AND run_after <= ?
                       ORDER BY priority DESC, id LIMIT 1 FOR UPDATE SKIP LOCKED)
           RETURNING id, user_id, kind, payload, attempts""", (worker, stamp, stamp)).fetchone()


def finish(conn, job, error: Exception | None = None, now: datetime | None = None) -> None:
    now = now or datetime.now(timezone.utc)
    if error is None:
        conn.execute("UPDATE jobs SET status = 'done', error = NULL, finished_at = ? WHERE id = ?",
                     (_iso(now), job["id"]))
    elif job["attempts"] < MAX_ATTEMPTS:
        conn.execute("""UPDATE jobs SET status = 'queued', error = ?, run_after = ?, locked_by = NULL,
                        locked_at = NULL WHERE id = ?""",
                     (str(error)[:2000], _iso(now + RETRY_AFTER * job["attempts"]), job["id"]))
    else:
        conn.execute("UPDATE jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?",
                     (str(error)[:2000], _iso(now), job["id"]))


def reclaim(conn, now: datetime | None = None) -> int:
    """Put jobs whose worker died back in the queue. Returns how many."""
    cutoff = _iso((now or datetime.now(timezone.utc)) - STALE)
    return conn.execute("""UPDATE jobs SET status = 'queued', locked_by = NULL, locked_at = NULL
                           WHERE status = 'running' AND locked_at < ?""", (cutoff,)).rowcount


def schedule_due(conn, now: datetime | None = None) -> int:
    """Queue the daily update of everyone with an account whose last update started more
    than DAILY ago (or never ran). Owner's connection. Returns how many were queued."""
    cutoff = _iso((now or datetime.now(timezone.utc)) - DAILY)
    return conn.execute(
        """INSERT INTO jobs (user_id, kind, payload)
           SELECT u.id, 'update', '{"trigger": "schedule"}' FROM users u
           WHERE EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = u.id)
             AND NOT EXISTS (SELECT 1 FROM runs r WHERE r.user_id = u.id AND r.started_at > ?)
           ON CONFLICT (user_id, kind) WHERE status IN ('queued', 'running') DO NOTHING""",
        (cutoff,)).rowcount


def _token() -> str | None:
    """The Lichess token: the Keychain one on your own Mac. A server has none yet (each
    user connecting Lichess with OAuth comes later)."""
    if not config.on_mac():
        return None
    from .cli import lichess_token  # not at the top: cli imports this module
    return lichess_token()


def run(url: str, job, workers: int | None = None, log=print) -> list[tuple[str, int]]:
    """Run one claimed job as its user. Returns the follow-up jobs to queue once it's
    marked done, as (kind, priority): a backfill while games are left to analyse."""
    payload = json.loads(job["payload"] or "{}")
    with closing(db.connect(url, migrate=False, user_id=job["user_id"])) as conn:
        nodes = db.analysis_nodes(conn)
        if job["kind"] == "update":
            update.run(conn, _token(), workers=workers, nodes=nodes, log=log,
                       trigger=payload.get("trigger", "manual"), analyse_limit=FIRST_BATCH)
        elif job["kind"] == "backfill":
            update.run(conn, None, workers=workers, nodes=nodes, log=log,
                       trigger="backfill", analyse_limit=BATCH, sync=False)
        else:
            raise ValueError(f"unknown job kind {job['kind']!r}")
        return [("backfill", BACKFILL_PRIORITY)] if analyze.unanalysed(conn) else []


def work(url: str, stop: threading.Event | None = None, workers: int | None = None,
         scheduler: bool | None = None, idle: float = 3.0, log=print, once: bool = False) -> int:
    """Claim and run jobs until `stop` is set (or the queue is empty, with `once`). The
    scheduler queues daily updates; it's off on your Mac, where launchd runs the daily
    update. Returns how many jobs ran."""
    stop = stop or threading.Event()
    scheduler = (not config.on_mac()) if scheduler is None else scheduler
    monitoring.init("worker")
    name = f"{socket.gethostname()}:{os.getpid()}:{threading.get_ident()}"
    ran, next_check = 0, 0.0
    with closing(db.connect(url)) as owner:
        while not stop.is_set():
            now = datetime.now(timezone.utc)
            if now.timestamp() >= next_check:
                reclaim(owner, now)
                monitoring.heartbeat()  # "still here", every SCHEDULE_EVERY
                if scheduler and (n := schedule_due(owner, now)):
                    log(f"Queued {n} daily update{'s' if n != 1 else ''}")
                next_check = now.timestamp() + SCHEDULE_EVERY
            job = claim(owner, name)
            if job is None:
                if once:
                    break
                stop.wait(idle)
                continue
            log(f"Job {job['id']}: {job['kind']} for user {job['user_id']} (attempt {job['attempts']})")
            follow = []
            try:
                follow = run(url, job, workers=workers, log=log)
                finish(owner, job)
            except Exception as e:  # recorded on the job and retried; the worker carries on
                log(f"Job {job['id']} failed: {e}")
                monitoring.capture(e)
                finish(owner, job, e)
            for kind, priority in follow:
                enqueue(owner, kind, priority=priority, user_id=job["user_id"])
            ran += 1
    return ran


def start_inline(url: str, workers: int | None = None, log=print) -> threading.Event:
    """A worker thread inside `knightly serve`, so one process is enough on your own Mac.
    Returns the event that stops it."""
    stop = threading.Event()
    threading.Thread(target=work, args=(url, stop), kwargs={"workers": workers, "log": log},
                     name="knightly-worker", daemon=True).start()
    return stop
