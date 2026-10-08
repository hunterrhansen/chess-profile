"""The job queue and the worker (jobs.py)."""
import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from knightly import api, db, jobs, update, users

def _now() -> datetime:
    """Just after the database's now(): the time new jobs are created at."""
    return datetime.now(timezone.utc) + timedelta(seconds=1)
quiet = lambda _: None


def as_user(db_url, clerk_id):
    with db.connect(db_url) as owner:
        user_id = users.ensure(owner, clerk_id)
    return user_id, db.connect(db_url, migrate=False, user_id=user_id)


def test_one_pending_job_of_a_kind_per_user(db_url):
    a, conn_a = as_user(db_url, "user_a")
    b, conn_b = as_user(db_url, "user_b")
    assert jobs.enqueue(conn_a, "update") and not jobs.enqueue(conn_a, "update")
    assert jobs.enqueue(conn_a, "backfill", priority=-1)
    assert jobs.enqueue(conn_b, "update")  # someone else's is their own
    assert jobs.pending(conn_a) == ["update", "backfill"] and jobs.pending(conn_b) == ["update"]
    owner = db.connect(db_url)
    assert dict(owner.execute("SELECT user_id, count(*) FROM jobs GROUP BY user_id").fetchall()) == {a: 2, b: 1}


def test_claim_takes_the_most_urgent_job_once(db_url):
    NOW = _now()
    a, conn = as_user(db_url, "user_a")
    b, other = as_user(db_url, "user_b")
    jobs.enqueue(conn, "backfill", priority=-1)
    jobs.enqueue(other, "update")
    owner = db.connect(db_url)
    first = jobs.claim(owner, "w1", NOW)
    assert (first["kind"], first["user_id"], first["attempts"]) == ("update", b, 1)
    # A second worker, while the first holds its row: never the same job.
    with owner:
        owner.execute("SELECT 1 FROM jobs WHERE id = ? FOR UPDATE", (first["id"],))
        second = jobs.claim(db.connect(db_url), "w2", NOW)
    assert (second["kind"], second["user_id"]) == ("backfill", a)
    assert jobs.claim(owner, "w3", NOW) is None


def test_a_failed_job_is_retried_later_then_given_up(db_url):
    NOW = _now()
    _, conn = as_user(db_url, "user_a")
    jobs.enqueue(conn, "update")
    owner = db.connect(db_url)
    for attempt in (1, 2):
        job = jobs.claim(owner, "w", NOW + timedelta(hours=attempt))
        assert job["attempts"] == attempt
        jobs.finish(owner, job, RuntimeError("Chess.com is down"), now=NOW + timedelta(hours=attempt))
        assert jobs.claim(owner, "w", NOW + timedelta(hours=attempt)) is None  # waits first
    job = jobs.claim(owner, "w", NOW + timedelta(hours=3))
    jobs.finish(owner, job, RuntimeError("still down"), now=NOW + timedelta(hours=3))
    row = owner.execute("SELECT status, error, attempts FROM jobs").fetchone()
    assert tuple(row) == ("failed", "still down", 3)
    assert jobs.enqueue(conn, "update")  # a failed job doesn't block asking again


def test_jobs_of_a_dead_worker_go_back_in_the_queue(db_url):
    NOW = _now()
    _, conn = as_user(db_url, "user_a")
    jobs.enqueue(conn, "update")
    owner = db.connect(db_url)
    jobs.claim(owner, "gone", NOW)
    assert jobs.reclaim(owner, NOW + timedelta(minutes=30)) == 0
    assert jobs.reclaim(owner, NOW + jobs.STALE + timedelta(minutes=1)) == 1
    assert jobs.claim(owner, "w", NOW + jobs.STALE)["attempts"] == 2


def test_the_scheduler_queues_whoever_is_due(db_url):
    NOW = _now()
    due, conn_due = as_user(db_url, "user_due")
    recent, conn_recent = as_user(db_url, "user_recent")
    as_user(db_url, "user_no_accounts")
    for conn in (conn_due, conn_recent):
        db.add_account(conn, "chesscom", "someone")
    conn_due.execute("INSERT INTO runs (status, started_at) VALUES ('ok', ?)", (jobs._iso(NOW - timedelta(days=1)),))
    conn_recent.execute("INSERT INTO runs (status, started_at) VALUES ('ok', ?)", (jobs._iso(NOW - timedelta(hours=2)),))
    owner = db.connect(db_url)
    assert jobs.schedule_due(owner, NOW) == 1
    assert jobs.schedule_due(owner, NOW) == 0  # already waiting
    row = owner.execute("SELECT user_id, kind, payload FROM jobs").fetchone()
    assert (row["user_id"], row["kind"], json.loads(row["payload"])) == (due, "update", {"trigger": "schedule"})


@pytest.fixture
def fake_update(monkeypatch):
    """update.run, minus the engine: "analyses" up to analyse_limit games by giving them a
    game_analysis row, and records how it was called."""
    calls = []

    def run(conn, token, workers=None, depth=None, log=print, trigger="manual", analyse_limit=None, sync=True,
            nodes=None):
        calls.append({"trigger": trigger, "limit": analyse_limit, "sync": sync})
        todo = conn.execute("""SELECT id FROM games WHERE id NOT IN (SELECT game_id FROM game_analysis)
                               ORDER BY played_at DESC LIMIT ?""", (analyse_limit,)).fetchall()
        for (game_id,) in todo:
            conn.execute("INSERT INTO game_analysis (game_id, engine, depth) VALUES (?, 'fake', 1)", (game_id,))
        return "ok"

    monkeypatch.setattr(update, "run", run)
    monkeypatch.setattr(jobs, "FIRST_BATCH", 2)
    monkeypatch.setattr(jobs, "BATCH", 2)
    return calls


def test_a_long_history_is_analysed_newest_first_then_in_batches(db_url, fake_update):
    _, conn = as_user(db_url, "user_a")
    for i in range(5):
        conn.execute("INSERT INTO games (source, source_id, pgn, variant, played_at) VALUES ('otb', ?, '', 'standard', ?)",
                     (str(i), f"2026-10-0{i + 1}"))
    jobs.enqueue(conn, "update", {"trigger": "account"})
    assert jobs.work(db_url, scheduler=False, log=quiet, once=True) == 3  # update, backfill, backfill
    assert fake_update == [
        {"trigger": "account", "limit": 2, "sync": True},
        {"trigger": "backfill", "limit": 2, "sync": False},
        {"trigger": "backfill", "limit": 2, "sync": False},
    ]
    owner = db.connect(db_url)
    assert [tuple(r) for r in owner.execute("SELECT kind, status, priority FROM jobs ORDER BY id")] == [
        ("update", "done", 0), ("backfill", "done", -1), ("backfill", "done", -1)]
    assert conn.execute("SELECT count(*) FROM game_analysis").fetchone()[0] == 5


def test_a_job_that_fails_waits_and_the_worker_carries_on(db_url, monkeypatch):
    _, conn = as_user(db_url, "user_a")
    jobs.enqueue(conn, "update")
    monkeypatch.setattr(update, "run", lambda *a, **k: (_ for _ in ()).throw(ConnectionError("network down")))
    assert jobs.work(db_url, scheduler=False, log=quiet, once=True) == 1
    row = db.connect(db_url).execute("SELECT status, attempts, error FROM jobs").fetchone()
    assert tuple(row) == ("queued", 1, "network down")


def test_adding_an_account_brings_its_games_in(db_url):
    client = TestClient(api.create_app(db_url))
    client.post("/api/accounts", json={"source": "chesscom", "handle": "newcomer"})
    assert client.get("/api/status").json()["queued"] == ["update"]
    row = db.connect(db_url).execute("SELECT kind, payload FROM jobs").fetchone()
    assert (row["kind"], json.loads(row["payload"])) == ("update", {"trigger": "account"})
