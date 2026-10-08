"""The Postgres database: connecting, migrations, and the few writes every importer shares.

`connect()` returns a `Connection` that keeps the small part of Python's sqlite3 API the
code was written against (Knightly used SQLite until Phase 1a): `execute` with `?`
placeholders, rows readable by name or position, and `with conn:` as a transaction. Outside
a `with` block each statement commits on its own, so a long engine run never holds a
transaction open.

A connection made with `user_id` acts for that user: it can only see and write their rows
(row-level security, migrations/0003_users.sql). Without one it's the owner's connection,
for migrations and managing users.
"""
import json
import os
import re
from datetime import date, datetime, time, timedelta, timezone
from importlib import resources

import psycopg
from psycopg.types.numeric import FloatLoader, IntDumper

DEFAULT_URL = os.environ.get("KNIGHTLY_DATABASE_URL", "postgresql:///knightly")

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

MIGRATION_LOCK = 4_243_001  # pg_advisory_xact_lock key: one migrating process at a time


class Row(tuple):
    """A result row, read by column name (`row["ply"]`) or position (`row[0]`), like
    sqlite3.Row. `dict(row)` gives {column: value}."""

    def __new__(cls, values, names, index):
        row = super().__new__(cls, values)
        row._names, row._index = names, index
        return row

    def __getitem__(self, key):
        return tuple.__getitem__(self, self._index[key] if isinstance(key, str) else key)

    def keys(self):
        return list(self._names)


def _row_factory(cursor):
    names = [c.name for c in cursor.description or []]
    index = {name: i for i, name in enumerate(names)}
    return lambda values: Row(values, names, index)


_PLACEHOLDER = re.compile(r"'(?:[^']|'')*'|--[^\n]*|\?|%")


def _sql(query: str) -> str:
    """`?` placeholders to psycopg's `%s` (but not a `?` inside a string literal or a
    comment), and every literal `%` to `%%`, which psycopg reads even inside literals."""
    def swap(m):
        text = m.group()
        return "%s" if text == "?" else text.replace("%", "%%")
    return _PLACEHOLDER.sub(swap, query)


class Connection:
    def __init__(self, pg: psycopg.Connection):
        self.pg = pg
        self._transactions = []

    def execute(self, query: str, params=None) -> psycopg.Cursor:
        cur = self.pg.cursor()
        if params is None:
            cur.execute(query)
        else:
            cur.execute(_sql(query), list(params))
        return cur

    def executemany(self, query: str, rows) -> psycopg.Cursor:
        cur = self.pg.cursor()
        cur.executemany(_sql(query), [list(r) for r in rows])
        return cur

    def __enter__(self):
        transaction = self.pg.transaction()
        transaction.__enter__()
        self._transactions.append(transaction)
        return self

    def __exit__(self, *exc):
        return self._transactions.pop().__exit__(*exc)

    def commit(self) -> None:
        """Nothing to do: outside `with conn:` every statement has already committed."""

    def close(self) -> None:
        self.pg.close()


APP_ROLE = "knightly_app"  # has no right to bypass row-level security


def connect(url: str = DEFAULT_URL, migrate: bool = True, user_id: int | None = None) -> Connection:
    pg = psycopg.connect(url, autocommit=True, row_factory=_row_factory)
    pg.adapters.register_loader("numeric", FloatLoader)  # avg(), round(): floats, as in SQLite
    pg.adapters.register_dumper(bool, IntDumper)  # True -> 1: flags are INTEGER columns, as in SQLite
    conn = Connection(pg)
    if migrate:
        apply_migrations(conn)
    if user_id is not None:
        conn.execute(f"SET ROLE {APP_ROLE}")
        conn.execute("SELECT set_config('app.user_id', ?, false)", (str(user_id),))
    return conn


def migrations() -> list[tuple[str, str]]:
    """(version, sql) for each file in migrations/, in order: "0001_initial.sql" is "0001"."""
    folder = resources.files("knightly").joinpath("migrations")
    files = sorted(f for f in folder.iterdir() if f.name.endswith(".sql"))
    return [(f.name.split("_", 1)[0], f.read_text()) for f in files]


def apply_migrations(conn: Connection) -> list[str]:
    """Apply the migrations this database hasn't had yet, each in its own transaction.
    Returns the versions applied."""
    conn.execute("""CREATE TABLE IF NOT EXISTS schema_migrations (
                        version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())""")
    applied = []
    for version, sql in migrations():
        with conn:
            conn.execute("SELECT pg_advisory_xact_lock(?)", (MIGRATION_LOCK,))
            if conn.execute("SELECT 1 FROM schema_migrations WHERE version = ?", (version,)).fetchone():
                continue
            conn.execute(sql)
            conn.execute("INSERT INTO schema_migrations (version) VALUES (?)", (version,))
            applied.append(version)
    return applied


def day_range(day: date) -> tuple[str, str]:
    """The local calendar day `day` as [start, end) in the ISO UTC text the tables store, for
    "answered today" queries: `reviewed_at >= ? AND reviewed_at < ?`."""
    start = datetime.combine(day, time.min).astimezone()
    end = datetime.combine(day + timedelta(days=1), time.min).astimezone()
    return tuple(t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") for t in (start, end))


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
        f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders}) ON CONFLICT DO NOTHING",
        [_encode(row.get(c)) for c in columns],
    )
    return cur.rowcount == 1


def insert_game(conn, game: dict) -> bool:
    return _insert(conn, "games", GAME_COLUMNS, game)


def insert_puzzle_attempt(conn, attempt: dict) -> bool:
    return _insert(conn, "puzzle_attempts", PUZZLE_COLUMNS, attempt)


def add_account(conn, source: str, handle: str) -> None:
    conn.execute("INSERT INTO accounts (source, handle) VALUES (?, ?) ON CONFLICT DO NOTHING", (source, handle))


def add_snapshot(conn, source: str, account: str, kind: str, data) -> None:
    conn.execute(
        "INSERT INTO snapshots (source, account, kind, data) VALUES (?, ?, ?, ?)",
        (source, account, kind, json.dumps(data)),
    )


DEFAULT_DEPTH = 18  # Stockfish depth per position unless changed in settings


def get_setting(conn, key: str, default=None):
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return json.loads(row[0]) if row else default


def set_setting(conn, key: str, value) -> None:
    conn.execute(
        """INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT (user_id, key) DO UPDATE
           SET value = excluded.value, updated_at = iso_now()""",
        (key, json.dumps(value)),
    )


def analysis_depth(conn) -> int:
    return int(get_setting(conn, "analysis_depth", DEFAULT_DEPTH))


def get_cursor(conn, source: str, account: str, kind: str) -> str | None:
    row = conn.execute(
        "SELECT cursor FROM sync_state WHERE source = ? AND account = ? AND kind = ?",
        (source, account.lower(), kind),
    ).fetchone()
    return row["cursor"] if row else None


def set_cursor(conn, source: str, account: str, kind: str, cursor: str) -> None:
    conn.execute(
        """INSERT INTO sync_state (source, account, kind, cursor) VALUES (?, ?, ?, ?)
           ON CONFLICT (user_id, source, account, kind) DO UPDATE
           SET cursor = excluded.cursor, updated_at = iso_now()""",
        (source, account.lower(), kind, cursor),
    )
