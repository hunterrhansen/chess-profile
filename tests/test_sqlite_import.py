import sqlite3

import pytest

from knightly import db, sqlite_import


def old_database(path):
    """A SQLite chess.db as Knightly kept it before Postgres, with a table since dropped."""
    old = sqlite3.connect(path)
    old.executescript("""
        CREATE TABLE accounts (source TEXT, handle TEXT, added_at TEXT);
        CREATE TABLE games (id INTEGER PRIMARY KEY, source TEXT, source_id TEXT, pgn TEXT,
                            played_at TEXT, imported_at TEXT);
        CREATE TABLE moves (game_id INTEGER, ply INTEGER, move_number INTEGER, color TEXT,
                            is_user INTEGER, phase TEXT, fen_before TEXT, san TEXT, uci TEXT,
                            win_pct_before REAL);
        CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT);
        INSERT INTO accounts VALUES ('chesscom', 'me', '2026-01-01T00:00:00Z');
        INSERT INTO games VALUES (7, 'chesscom', 'a', '1. e4', '2026-01-02', '2026-01-02T00:00:00Z'),
                                 (42, 'chesscom', 'b', '1. d4', '2026-01-03', '2026-01-03T00:00:00Z');
        INSERT INTO moves VALUES (42, 1, 1, 'white', 1, 'opening', 'fen', 'd4', 'd2d4', 51.5);
        INSERT INTO notes VALUES (1, 'gone');
    """)
    old.commit()
    old.close()


def test_import_copies_rows_keeps_ids_and_continues_the_counter(db_url, tmp_path):
    old_database(tmp_path / "chess.db")
    conn = db.connect(db_url)
    counts = sqlite_import.run(conn, tmp_path / "chess.db", log=lambda _: None)
    assert counts == {"accounts": 1, "games": 2, "moves": 1}
    assert [r["id"] for r in conn.execute("SELECT id FROM games ORDER BY id")] == [7, 42]
    m = conn.execute("SELECT * FROM moves").fetchone()
    assert (m["game_id"], m["san"], m["win_pct_before"]) == (42, "d4", 51.5)
    db.insert_game(conn, {"source": "chesscom", "source_id": "c", "pgn": "1. c4"})
    assert conn.execute("SELECT id FROM games WHERE source_id = 'c'").fetchone()[0] == 43


def test_import_needs_an_empty_database(db_url, tmp_path):
    old_database(tmp_path / "chess.db")
    conn = db.connect(db_url)
    db.add_account(conn, "lichess", "already")
    with pytest.raises(SystemExit, match="already has data"):
        sqlite_import.run(conn, tmp_path / "chess.db", log=lambda _: None)
