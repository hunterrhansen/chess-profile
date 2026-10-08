"""`knightly import-sqlite chess.db`: copy a SQLite database from before Postgres (Phase 1a)
into an empty Postgres one, all in one transaction.

Tables are copied parents first, so foreign keys hold, with the columns both sides have
(a column dropped since, like a long-gone table, is skipped). Ids are kept, so games keep
their URLs (/games/<id>), and the id counters continue after the highest one copied.
"""
import sqlite3
from pathlib import Path

# Parents before children (moves, cards ... reference games; card_reviews references cards).
TABLES = [
    "accounts", "games", "puzzle_attempts", "lichess_puzzles", "snapshots", "sync_state",
    "game_analysis", "moves", "runs", "settings", "engine_lines", "cards", "game_reviews",
    "card_reviews",
]
WITH_IDS = ["games", "puzzle_attempts", "snapshots", "runs", "card_reviews"]


def _columns(conn, table: str) -> list[str]:
    return [r[0] for r in conn.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = ? ORDER BY ordinal_position",
        (table,))]


def run(conn, path: Path, log=print) -> dict[str, int]:
    """Returns rows copied per table."""
    if not path.exists():
        raise SystemExit(f"No SQLite database at {path}.")
    filled = [t for t in TABLES if conn.execute(f"SELECT 1 FROM {t} LIMIT 1").fetchone()]
    if filled:
        raise SystemExit(f"This database already has data ({', '.join(filled)}); "
                         "import into an empty one.")
    source = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    present = {r[0] for r in source.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    counts = {}
    try:
        with conn:
            for table in TABLES:
                if table not in present:
                    continue
                have = {r[1] for r in source.execute(f"PRAGMA table_info({table})")}
                columns = [c for c in _columns(conn, table) if c in have]
                listed = ", ".join(columns)
                n = 0
                with conn.pg.cursor().copy(f"COPY {table} ({listed}) FROM STDIN") as copy:
                    for row in source.execute(f"SELECT {listed} FROM {table}"):
                        copy.write_row(row)
                        n += 1
                counts[table] = n
                log(f"Copied {table}")
            for table in WITH_IDS:
                conn.execute(f"""SELECT setval(pg_get_serial_sequence('{table}', 'id'),
                                               coalesce(max(id), 1), max(id) IS NOT NULL) FROM {table}""")
    finally:
        source.close()
    return counts
