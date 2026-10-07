import json
import plistlib

import pytest

from knightly import analyze, db, schedule, update
from knightly.sources import chesscom, lichess

quiet = lambda _: None


@pytest.fixture
def setup(tmp_path, monkeypatch):
    """A DB with one account per source, and sync/analysis stubbed out."""
    db_path = tmp_path / "chess.db"
    conn = db.connect(db_path)
    db.add_account(conn, "chesscom", "me")
    db.add_account(conn, "lichess", "me")
    conn.commit()
    monkeypatch.setattr(chesscom, "sync", lambda *a, **k: 3)
    monkeypatch.setattr(lichess, "sync_games", lambda *a, **k: 1)
    monkeypatch.setattr(lichess, "sync_puzzles", lambda *a, **k: 5)
    monkeypatch.setattr(analyze, "run", lambda *a, **k: 4)
    return conn, db_path


def last_run(conn):
    return conn.execute("SELECT * FROM runs ORDER BY id DESC LIMIT 1").fetchone()


def test_update_records_a_successful_run(setup):
    conn, db_path = setup
    assert update.run(conn, db_path, token="t", log=quiet) == "ok"
    r = last_run(conn)
    assert (r["status"], r["trigger"], r["new_games"], r["new_puzzles"], r["games_analysed"]) == \
        ("ok", "manual", 4, 5, 4)
    assert r["finished_at"] and r["errors"] is None
    assert (db_path.parent / "backups").joinpath(r["backup_path"].split("/")[-1]).exists()


def test_no_token_skips_puzzles(setup):
    conn, db_path = setup
    assert update.run(conn, db_path, token=None, log=quiet) == "ok"
    assert last_run(conn)["new_puzzles"] == 0


def test_one_failing_step_doesnt_stop_the_rest(setup, monkeypatch):
    conn, db_path = setup
    def boom(*a, **k):
        raise ConnectionError("chess.com down")
    monkeypatch.setattr(chesscom, "sync", boom)
    assert update.run(conn, db_path, token="t", log=quiet) == "partial"
    r = last_run(conn)
    assert r["new_games"] == 1 and r["games_analysed"] == 4 and r["backup_path"]  # rest still ran
    assert json.loads(r["errors"]) == ["sync chesscom:me: chess.com down"]


def test_missing_stockfish_is_a_partial_run(setup, monkeypatch):
    conn, db_path = setup
    def no_engine(*a, **k):
        raise SystemExit("Stockfish not found")
    monkeypatch.setattr(analyze, "run", no_engine)
    assert update.run(conn, db_path, token="t", log=quiet) == "partial"
    assert "Stockfish not found" in last_run(conn)["errors"]


def test_crash_is_recorded_as_failed(setup, monkeypatch):
    conn, db_path = setup
    def interrupted(*a, **k):
        raise KeyboardInterrupt
    monkeypatch.setattr(analyze, "run", interrupted)
    with pytest.raises(KeyboardInterrupt):
        update.run(conn, db_path, token="t", log=quiet)
    r = last_run(conn)
    assert r["status"] == "failed" and r["finished_at"] and r["new_games"] == 4


def test_concurrent_run_is_skipped(setup):
    conn, db_path = setup
    with update.Lock(db_path.resolve()):
        assert update.run(conn, db_path, token="t", log=quiet) == "skipped"
    assert last_run(conn) is None  # a skipped run isn't recorded
    assert update.run(conn, db_path, token="t", log=quiet) == "ok"  # lock released


def test_backups_are_pruned(setup):
    conn, db_path = setup
    backups = db_path.parent / "backups"
    backups.mkdir()
    for day in range(1, 10):
        (backups / f"chess-2026-01-{day:02d}.db").write_bytes(b"")
    (backups / "unrelated.db").write_bytes(b"")
    dest = update.backup(conn, db_path, keep=3)
    kept = sorted(p.name for p in backups.iterdir())
    assert kept == ["chess-2026-01-08.db", "chess-2026-01-09.db", dest.name, "unrelated.db"]
    # The copy is a real, readable database.
    assert db.connect(dest).execute("SELECT count(*) FROM accounts").fetchone()[0] == 2


def test_plist(tmp_path):
    p = schedule.build_plist(tmp_path / "chess.db", hour=6, minute=30, stockfish="/opt/sf")
    assert p["Label"] == schedule.LABEL
    args = p["ProgramArguments"]
    assert args[0].endswith("knightly") and args[1:3] == ["--db", str((tmp_path / "chess.db").resolve())]
    assert args[3:5] == ["update", "--scheduled"]
    assert p["StartCalendarInterval"] == {"Hour": 6, "Minute": 30}
    assert p["EnvironmentVariables"]["STOCKFISH"] == "/opt/sf"
    plistlib.dumps(p)  # serialisable


def progress(conn):
    return json.loads(last_run(conn)["progress"])


def test_progress_records_each_step(setup, monkeypatch):
    conn, db_path = setup
    seen = []

    def analysing(*a, on_progress=None, **k):  # what the web app polls for mid-run
        on_progress(0, 2)
        on_progress(1, 2)
        seen.append(progress(conn))
        on_progress(2, 2)
        return 2

    monkeypatch.setattr(analyze, "run", analysing)
    assert update.run(conn, db_path, token="t", log=quiet) == "ok"
    mid = seen[0]
    assert mid["plan"] == ["sync:chesscom:me", "sync:lichess:me", "analyze", "backup"]
    assert (mid["current"], mid["detail"]) == ("analyze", "1 of 2 games")
    done = progress(conn)
    assert done["current"] is None
    assert [(d["key"], d["summary"], d["error"]) for d in done["done"]] == [
        ("sync:chesscom:me", "3 new games", None),
        ("sync:lichess:me", "1 new game, 5 puzzle attempts", None),
        ("analyze", "2 games analysed", None),
        ("backup", f"Saved {update.Path(last_run(conn)['backup_path']).name}", None),
    ]


def test_progress_marks_failed_steps(setup, monkeypatch):
    conn, db_path = setup
    monkeypatch.setattr(chesscom, "sync", lambda *a, **k: (_ for _ in ()).throw(ConnectionError("down")))
    update.run(conn, db_path, token=None, log=quiet)
    done = {d["key"]: d for d in progress(conn)["done"]}
    assert done["sync:chesscom:me"]["error"] == "down"
    assert done["sync:lichess:me"]["summary"] == "1 new game (no token, puzzles skipped)"


def test_connect_adds_new_columns_to_an_old_database(tmp_path):
    path = tmp_path / "old.db"
    old = db.sqlite3.connect(path)
    old.execute("CREATE TABLE runs (id INTEGER PRIMARY KEY, status TEXT NOT NULL)")
    old.close()
    conn = db.connect(path)
    assert "progress" in {r["name"] for r in conn.execute("PRAGMA table_info(runs)")}
