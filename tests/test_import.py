import json
from pathlib import Path

import pytest

from chessprofile import db
from chessprofile.sources import chesscom, lichess, pgn_file

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def conn(tmp_path):
    return db.connect(tmp_path / "test.db")


def test_chesscom_game_row(conn):
    g = json.loads((FIXTURES / "chesscom_game.json").read_text())
    row = chesscom.game_row(g, "erik")
    assert row["source_id"] == g["uuid"]
    assert row["user_color"] == "black"
    assert row["opponent"] == "chrhanson"
    assert row["user_rating"] == g["black"]["rating"]
    assert row["opening"] == "Pirc Defense Classical Variation"
    assert row["ply_count"] > 0 and row["moves_san"].startswith("e4")
    assert db.insert_game(conn, row) is True
    assert db.insert_game(conn, row) is False  # idempotent


def test_lichess_game_row(conn):
    g = json.loads((FIXTURES / "lichess_game.json").read_text())
    row = lichess.game_row(g, "tryinghard87")
    assert row["account"] == "tryinghard87"
    assert row["user_color"] == "black" and row["user_outcome"] == "draw"
    assert row["played_at"] == "2017-12-28T23:52:30Z"
    assert row["user_accuracy"] == 90
    assert "%clk" in row["pgn"]  # clocks kept for later time-management analysis
    assert db.insert_game(conn, row) is True


def test_lichess_puzzle_row(conn):
    entry = {"date": 1789845997743, "win": False, "puzzle": {
        "id": "DG7B9", "rating": 1847, "plays": 5722, "solution": ["f3f6", "h5f6", "h1h6"],
        "themes": ["middlegame", "short"], "fen": "2r2rk1/1pp2p1p/p2p1npq/3Pp2n/4P3/5QN1/PPP2P2/R2NK2R w KQ - 1 1",
        "lastMove": "e8f6"}}
    row = lichess.puzzle_row(entry, "me")
    assert row["solution"] == "f3f6 h5f6 h1h6"
    assert db.insert_puzzle_attempt(conn, row) is True
    assert db.insert_puzzle_attempt(conn, row) is False
    themes = [r[0] for r in conn.execute(
        "SELECT t.value FROM puzzle_attempts, json_each(themes) t")]
    assert themes == ["middlegame", "short"]


def test_pgn_import(conn):
    added = pgn_file.import_paths(conn, [FIXTURES / "otb.pgn"], ["hansen, hunter"], log=lambda _: None)
    assert added == 3
    rows = conn.execute("SELECT * FROM games ORDER BY id").fetchall()
    assert [r["user_outcome"] for r in rows] == ["win", "draw", None]
    assert rows[0]["user_rating"] == 1650 and rows[0]["opponent"] == "Smith, Alex"
    assert rows[1]["user_color"] == "black"
    assert rows[2]["played_at"] == "2025"  # partial dates keep what's known
    # Re-importing the same file adds nothing.
    assert pgn_file.import_paths(conn, [FIXTURES], ["Hansen, Hunter"], log=lambda _: None) == 0


def test_cursor_roundtrip(conn):
    assert db.get_cursor(conn, "chesscom", "Erik", "games") is None
    db.set_cursor(conn, "chesscom", "Erik", "games", "2026/09")
    db.set_cursor(conn, "chesscom", "erik", "games", "2026/10")
    assert db.get_cursor(conn, "chesscom", "ERIK", "games") == "2026/10"
