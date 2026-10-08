"""Puzzles for the tactics you miss, from the Lichess puzzle database (CC0).

`import_file` streams lichess_db_puzzle.csv(.zst) from database.lichess.org and keeps only
what Knightly serves: well-liked, often-played puzzles in the themes your mistakes are
tagged with (patterns.THEMES), up to PER_THEME each. A few MB, out of a 300 MB download.

A Lichess puzzle starts one move early: `moves[0]` is the opponent's move that sets it up,
then you and they alternate, your moves at odd indexes. Answers are kept in puzzle_attempts
with source "knightly", next to your Lichess puzzle history.
"""
import csv
import io
import json
import random
import shutil
import subprocess
from datetime import date, datetime, timezone
from pathlib import Path

from . import db
from .patterns import THEMES

SOURCE = "knightly"
PER_THEME = 3000       # puzzles kept per theme
MIN_POPULARITY = 85    # Lichess's -100..100 vote score
MIN_PLAYS = 500
RATING_RANGE = (500, 2200)
DEFAULT_TARGET = 1200  # puzzle rating to aim at with no Lichess puzzle history
NEAR = 150             # serve puzzles within this many points of the target first
SESSION = 5            # puzzles in a lesson; Home's step is done after this many a day


def _rows(path: Path):
    """CSV rows from the .csv or .csv.zst file, decompressed as a stream."""
    if path.suffix == ".zst":
        zstd = shutil.which("zstd")
        if not zstd:
            raise SystemExit("Needs the zstd tool to unpack the file: brew install zstd")
        proc = subprocess.Popen([zstd, "-dc", str(path)], stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE)
        finished = False
        try:
            yield from csv.DictReader(io.TextIOWrapper(proc.stdout, encoding="utf-8"))
            finished = True
        finally:
            if proc.poll() is None:
                proc.kill()  # we stopped reading early: enough puzzles kept
            proc.stdout.close()
            err = proc.stderr.read().decode(errors="replace").strip()
            proc.stderr.close()
            if proc.wait() and finished:
                raise SystemExit(f"Couldn't unpack {path.name}: {err}")
    else:
        with open(path, newline="", encoding="utf-8") as f:
            yield from csv.DictReader(f)


def import_file(conn: db.Connection, path: str | Path, log=print) -> dict[str, int]:
    """Replace the stored puzzles with a fresh pick from a Lichess puzzle file. Returns how
    many were kept per theme."""
    kept = {t: 0 for t in THEMES}
    batch, seen = [], 0
    lo, hi = RATING_RANGE
    for row in _rows(Path(path)):
        seen += 1
        if seen % 1_000_000 == 0:
            log(f"  {seen:,} puzzles read, {sum(kept.values()):,} kept")
        try:
            rating, popularity, plays = int(row["Rating"]), int(row["Popularity"]), int(row["NbPlays"])
        except (KeyError, ValueError):
            continue
        if not (lo <= rating <= hi) or popularity < MIN_POPULARITY or plays < MIN_PLAYS:
            continue
        themes = row["Themes"].split()
        mine = [t for t in THEMES if t in themes and kept[t] < PER_THEME]
        if not mine:
            continue
        for t in mine:
            kept[t] += 1
        batch.append((row["PuzzleId"], row["FEN"], row["Moves"], rating, popularity, plays,
                      row["Themes"], row.get("GameUrl")))
        if all(n >= PER_THEME for n in kept.values()):
            break
    with conn:
        conn.execute("DELETE FROM lichess_puzzles")
        conn.executemany(
            """INSERT INTO lichess_puzzles
               (puzzle_id, fen, moves, rating, popularity, plays, themes, url)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING""", batch)
    log(f"Kept {len(batch):,} of {seen:,} puzzles")
    return kept


def target_rating(conn) -> int:
    """The puzzle rating to aim at: the middle of the Lichess puzzles you've solved lately."""
    rows = conn.execute(
        """SELECT puzzle_rating FROM puzzle_attempts
           WHERE success = 1 AND puzzle_rating IS NOT NULL
           ORDER BY attempted_at DESC LIMIT 200""").fetchall()
    if not rows:
        return DEFAULT_TARGET
    ratings = sorted(r[0] for r in rows)
    return ratings[len(ratings) // 2]


def available(conn) -> bool:
    return conn.execute("SELECT 1 FROM lichess_puzzles LIMIT 1").fetchone() is not None


def next_puzzle(conn, theme: str, rng: random.Random | None = None) -> dict | None:
    """A puzzle in `theme` you haven't tried here, near your target rating (widening if
    none is), or None."""
    target = target_rating(conn)
    for spread in (NEAR, NEAR * 3, 10_000):
        rows = conn.execute(
            """SELECT * FROM lichess_puzzles p
               WHERE (' ' || p.themes || ' ') ILIKE ? AND abs(p.rating - ?) <= ?
                 AND p.puzzle_id NOT IN (SELECT puzzle_id FROM puzzle_attempts WHERE source = ?)
               LIMIT 50""", (f"% {theme} %", target, spread, SOURCE)).fetchall()
        if rows:
            r = (rng or random).choice(rows)
            return {"id": r["puzzle_id"], "fen": r["fen"], "moves": r["moves"].split(),
                    "rating": r["rating"], "themes": r["themes"].split(), "url": r["url"]}
    return None


def record(conn, puzzle_id: str, correct: bool, now: datetime | None = None) -> None:
    p = conn.execute("SELECT * FROM lichess_puzzles WHERE puzzle_id = ?", (puzzle_id,)).fetchone()
    if p is None:
        raise KeyError(puzzle_id)
    moves = p["moves"].split()
    conn.execute(
        """INSERT INTO puzzle_attempts
           (source, puzzle_id, attempted_at, success, fen, last_move, solution, themes,
            puzzle_rating, plays, url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING""",
        (SOURCE, puzzle_id, (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ"),
         int(correct), p["fen"], moves[0], " ".join(moves[1:]),
         json.dumps(p["themes"].split()),
         p["rating"], p["plays"], p["url"]))


def done_today(conn, today: date | None = None) -> int:
    today = today or date.today()
    return conn.execute(
        """SELECT count(*) FROM puzzle_attempts
           WHERE source = ? AND attempted_at >= ? AND attempted_at < ?""",
        (SOURCE, *db.day_range(today))).fetchone()[0]
