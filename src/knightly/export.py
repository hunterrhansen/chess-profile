"""Download your data (Settings): everything Knightly keeps about you, as one zip.

- games.pgn: every game, as it came from Chess.com or Lichess (or your games against the bot)
- one CSV per table: your accounts, games, the engine's verdict on each move, your reviews,
  practice cards and answers, puzzle attempts, settings and update history

It runs on the user's own connection, so row-level security decides what goes in: the same
rows the app shows them, and nobody else's. The engine-line cache and the job queue are left
out (they're working state, not your data). Your sign-in details are with Clerk.
"""
import tempfile
import zipfile

TABLES = ["accounts", "games", "game_analysis", "moves", "game_reviews", "cards", "card_reviews",
          "puzzle_attempts", "settings", "snapshots", "runs"]

README = """Your Knightly data

games.pgn holds every game. Each .csv file is one table of what Knightly keeps about you,
with a header row; ids link rows across files (moves.game_id is games.id).
"""


def _columns(conn, table: str) -> list[str]:
    return [r[0] for r in conn.execute(
        """SELECT column_name FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name = ? AND column_name != 'user_id'
           ORDER BY ordinal_position""", (table,)).fetchall()]


def _copy(conn, sql: str, out) -> None:
    with conn.pg.cursor() as cur, cur.copy(sql) as copy:
        for block in copy:
            out.write(block)


def zip_for(conn):
    """The zip, in a temporary file (rewound): on the user's connection."""
    body = tempfile.SpooledTemporaryFile(max_size=16 * 1024 * 1024)
    with zipfile.ZipFile(body, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("README.txt", README)
        with zf.open("games.pgn", "w") as out:
            for (pgn,) in conn.execute("SELECT pgn FROM games WHERE pgn IS NOT NULL ORDER BY played_at, id"):
                out.write(pgn.strip().encode() + b"\n\n")
        for table in TABLES:
            columns = ", ".join(f'"{c}"' for c in _columns(conn, table))
            with zf.open(f"{table}.csv", "w") as out:
                _copy(conn, f"COPY (SELECT {columns} FROM {table} ORDER BY 1) TO STDOUT WITH (FORMAT csv, HEADER)", out)
    body.seek(0)
    return body


def chunks(body, size: int = 64 * 1024):
    with body:
        while block := body.read(size):
            yield block
