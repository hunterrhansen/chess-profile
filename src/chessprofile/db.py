import json
import os
import sqlite3
from importlib import resources
from pathlib import Path

DEFAULT_DB = os.environ.get("CHESSPROFILE_DB", "chess.db")

GAME_COLUMNS = [
    "source", "source_id", "account", "url", "played_at", "variant", "speed",
    "time_control", "rated", "white", "black", "white_elo", "black_elo", "result",
    "termination", "user_color", "user_outcome", "user_rating", "opponent",
    "opponent_rating", "user_accuracy", "opponent_accuracy", "eco", "opening",
    "start_fen", "ply_count", "moves_san", "pgn", "raw",
]

PUZZLE_COLUMNS = [
    "source", "puzzle_id", "account", "attempted_at", "success", "fen", "last_move",
    "solution", "themes", "puzzle_rating", "plays", "url", "raw",
]


def connect(path: str | Path = DEFAULT_DB) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(resources.files("chessprofile").joinpath("schema.sql").read_text())
    return conn


def _encode(value):
    if isinstance(value, (dict, list)):
        return json.dumps(value, separators=(",", ":"))
    if isinstance(value, bool):
        return int(value)
    return value


def _insert(conn, table, columns, row) -> bool:
    """Insert unless the natural key already exists. Returns True if a row was added."""
    placeholders = ", ".join("?" for _ in columns)
    cur = conn.execute(
        f"INSERT OR IGNORE INTO {table} ({', '.join(columns)}) VALUES ({placeholders})",
        [_encode(row.get(c)) for c in columns],
    )
    return cur.rowcount == 1


def insert_game(conn, game: dict) -> bool:
    return _insert(conn, "games", GAME_COLUMNS, game)


def insert_puzzle_attempt(conn, attempt: dict) -> bool:
    return _insert(conn, "puzzle_attempts", PUZZLE_COLUMNS, attempt)


def add_account(conn, source: str, handle: str) -> None:
    conn.execute("INSERT OR IGNORE INTO accounts (source, handle) VALUES (?, ?)", (source, handle))


def add_snapshot(conn, source: str, account: str, kind: str, data) -> None:
    conn.execute(
        "INSERT INTO snapshots (source, account, kind, data) VALUES (?, ?, ?, ?)",
        (source, account, kind, json.dumps(data)),
    )


def get_cursor(conn, source: str, account: str, kind: str) -> str | None:
    row = conn.execute(
        "SELECT cursor FROM sync_state WHERE source = ? AND account = ? AND kind = ?",
        (source, account.lower(), kind),
    ).fetchone()
    return row["cursor"] if row else None


def set_cursor(conn, source: str, account: str, kind: str, cursor: str) -> None:
    conn.execute(
        """INSERT INTO sync_state (source, account, kind, cursor) VALUES (?, ?, ?, ?)
           ON CONFLICT (source, account, kind) DO UPDATE
           SET cursor = excluded.cursor, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')""",
        (source, account.lower(), kind, cursor),
    )
