"""HTTP API over chess.db for the web frontend (`knightly serve`).

Every number on the overview is computed from one row per game (GAME_FACTS), and the
games list filters on the same rows, so a KPI and the games it links to always agree.

Reads use a read-only connection. The only writes are the Settings page's (accounts, the
analysis depth, and the daily-update schedule, which goes through launchd), cached engine
lines, notes, games played against the bot, finished game reviews, and the review deck's
cards and answers.
"""
import functools
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path

import chess
import chess.engine
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from typing import Literal

from pydantic import BaseModel, Field

from . import db, deck, lines, play, schedule, update
from .analyze import THRESHOLDS, find_engine

# A position counts as "winning" once the user's win chance reaches this after one of
# their own moves, and as "lost" once it falls to LOST_PCT. Lichess win% scale, 0-100.
WINNING_PCT = 80
LOST_PCT = 20
BLUNDER_DROP = THRESHOLDS[0][0]  # win% lost that makes a move a blunder
RANGES = {"30d": 30, "90d": 90, "all": None}
MIN_SAMPLE = 10  # fewer games than this and a KPI is too noisy to show or compare
PAGE_SIZE = 50

# One row per game with everything the overview and filters need. Engine columns are NULL
# for games that haven't been analysed yet.
GAME_FACTS = f"""
WITH peaks AS (
    SELECT game_id,
           max(CASE WHEN is_user = 1 THEN win_pct_after END) AS peak,
           min(CASE WHEN is_user = 1 THEN win_pct_after END) AS trough,
           -- Blunder-sized moves of yours, whatever their label: a "miss" that throws away
           -- 20+ points is as costly as any other blunder.
           sum(is_user = 1 AND win_pct_before - win_pct_after >= {BLUNDER_DROP}) AS big_drops
    FROM moves GROUP BY game_id
), punish AS (
    -- Opponent blunders (by size, since a blunder that answers your own error is labelled
    -- "miss"), and how many the user answered with a best, excellent or good move.
    SELECT o.game_id, count(*) AS opp_blunders,
           sum(n.classification IN ('brilliant', 'great', 'best', 'excellent', 'good')) AS punished
    FROM moves o JOIN moves n ON n.game_id = o.game_id AND n.ply = o.ply + 1
    WHERE o.is_user = 0 AND o.win_pct_before - o.win_pct_after >= {BLUNDER_DROP} AND n.is_user = 1
    GROUP BY o.game_id
), move10 AS (
    -- Eval after Black's 10th move, from the user's side, clamped like cp_loss.
    SELECT m.game_id,
           max(-1000, min(1000, CASE WHEN g.user_color = 'white' THEN m.eval_after
                                     ELSE -m.eval_after END)) AS eval10
    FROM moves m JOIN games g ON g.id = m.game_id WHERE m.ply = 20
)
SELECT g.id, g.played_at, g.speed, g.rated, g.time_control, g.url, g.user_color,
       g.user_outcome, g.user_rating, g.opponent, g.opponent_rating, g.eco, g.opening,
       g.termination, g.ply_count,
       a.game_id IS NOT NULL AS analysed,
       coalesce(a.user_accuracy, g.user_accuracy) AS accuracy,
       a.user_accuracy AS engine_accuracy,
       CASE WHEN a.game_id IS NOT NULL THEN coalesce(p.big_drops, 0) END AS blunders,
       a.user_mistakes AS mistakes,
       a.user_inaccuracies AS inaccuracies,
       p.peak >= {WINNING_PCT} AS was_winning,
       p.trough <= {LOST_PCT} AS was_lost,
       coalesce(pu.opp_blunders, CASE WHEN a.game_id IS NOT NULL THEN 0 END) AS opp_blunders,
       coalesce(pu.punished, CASE WHEN a.game_id IS NOT NULL THEN 0 END) AS punished,
       m10.eval10,
       r.reviewed_at
FROM games g
LEFT JOIN game_analysis a ON a.game_id = g.id
LEFT JOIN peaks p ON p.game_id = g.id
LEFT JOIN punish pu ON pu.game_id = g.id
LEFT JOIN move10 m10 ON m10.game_id = g.id
LEFT JOIN game_reviews r ON r.game_id = g.id
"""

# Overview KPI -> the games behind it, used by the games list's `kpi` filter.
KPI_FILTERS = {
    "blunders": "f.blunders > 0",
    "thrown": "f.was_winning AND f.user_outcome = 'loss'",
    "unconverted": "f.was_winning AND f.user_outcome != 'win'",
    "unpunished": "f.punished < f.opp_blunders",
    "comebacks": "f.was_lost AND f.user_outcome != 'loss'",
    "analysed": "f.analysed",
}

ENDINGS = [  # substring of Chess.com/Lichess termination text -> short label
    ("checkmate", "Checkmate"), ("resignation", "Resigned"), ("abandoned", "Abandoned"),
    ("timeout vs insufficient", "Time vs material"), ("on time", "Time"),
    ("stalemate", "Stalemate"), ("repetition", "Repetition"), ("50-move", "50-move rule"),
    ("insufficient material", "Material"), ("agreement", "Agreement"),
]


def ended_by(termination: str | None) -> str | None:
    text = (termination or "").lower()
    return next((label for key, label in ENDINGS if key in text), termination)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def period_bounds(range_: str, now: datetime | None = None):
    """(start, end, prev_start) as ISO strings; start/prev_start are None for 'all'."""
    days = RANGES[range_]
    now = now or _now()
    if days is None:
        return None, _iso(now), None
    start = now - timedelta(days=days)
    return _iso(start), _iso(now), _iso(start - timedelta(days=days))


def _mean(values):
    values = [v for v in values if v is not None]
    return sum(values) / len(values) if values else None


def _ratio(num, den):
    return num / den if den else None


def kpis(rows, min_sample: int = 1) -> dict:
    """Improvement KPIs over a list of GAME_FACTS rows. A KPI is None when it rests on
    fewer than `min_sample` games."""
    analysed = [r for r in rows if r["analysed"]]
    winning = [r for r in analysed if r["was_winning"]]
    lost = [r for r in analysed if r["was_lost"]]
    # Engine accuracy only: Chess.com's own numbers run on a lower scale, so mixing them
    # in makes trends move when only the source changed.
    with_acc = [r["engine_accuracy"] for r in analysed if r["engine_accuracy"] is not None]
    opp_blunders = sum(r["opp_blunders"] or 0 for r in analysed)

    def enough(sample, value):
        return value if len(sample) >= min_sample else None

    return {
        "blunders_per_game": enough(analysed, _mean([r["blunders"] for r in analysed])),
        "conversion": enough(winning, _ratio(sum(r["user_outcome"] == "win" for r in winning), len(winning))),
        "winning_games": len(winning),
        "thrown": sum(r["user_outcome"] == "loss" for r in winning),
        "punish_rate": enough(analysed, _ratio(sum(r["punished"] or 0 for r in analysed), opp_blunders)),
        "opp_blunders": opp_blunders,
        "accuracy": enough(with_acc, _mean(with_acc)),
        "opening_edge": enough(analysed, _mean([r["eval10"] for r in analysed])),
        "comeback_rate": enough(lost, _ratio(sum(r["user_outcome"] != "loss" for r in lost), len(lost))),
        "lost_games": len(lost),
        "analysed": len(analysed),
    }


def _weekly(rows, start: str | None, end: str) -> list[dict]:
    """KPI values per week (per month for all-time), for the KPI sparklines."""
    if not rows:
        return []
    monthly = start is None
    buckets: dict[str, list] = {}
    for r in rows:
        day = datetime.fromisoformat(r["played_at"][:10])
        key = day.strftime("%Y-%m") if monthly else (day - timedelta(days=day.weekday())).strftime("%Y-%m-%d")
        buckets.setdefault(key, []).append(r)
    out = []
    for key in sorted(buckets):
        k = kpis(buckets[key], min_sample=3)
        out.append({"period": key, **{name: k[name] for name in
                    ("blunders_per_game", "conversion", "punish_rate", "accuracy")}})
    return out


def _game_json(r) -> dict:
    return {
        "id": r["id"],
        "played_at": r["played_at"],
        "speed": r["speed"],
        "rated": bool(r["rated"]),
        "time_control": r["time_control"],
        "url": r["url"],
        "color": r["user_color"],
        "outcome": r["user_outcome"],
        "rating": r["user_rating"],
        "opponent": r["opponent"],
        "opponent_rating": r["opponent_rating"],
        "eco": r["eco"],
        "opening": r["opening"] or None,
        "ended_by": ended_by(r["termination"]),
        "moves": (r["ply_count"] + 1) // 2 if r["ply_count"] else None,
        "analysed": bool(r["analysed"]),
        "accuracy": r["accuracy"],
        "blunders": r["blunders"],
        "mistakes": r["mistakes"],
        "inaccuracies": r["inaccuracies"],
        "reviewed_at": r["reviewed_at"],
    }


def _note_json(r, plies: list[int]) -> dict:
    return {
        "id": r["id"],
        "created_at": r["created_at"],
        "body": r["body"],
        "tags": json.loads(r["tags"]) if r["tags"] else [],
        "fen": r["fen"],
        "plies": plies,
        # Where the note was written, for linking back: maybe another game.
        "game": {"id": r["game_id"], "ply": r["ply"], "opponent": r["opponent"],
                 "played_at": r["played_at"]} if r["game_id"] else None,
    }


SOURCES = ("chesscom", "lichess")
HANDLE = re.compile(r"^[A-Za-z0-9_-]{2,40}$")
KEYCHAIN_SERVICE = "knightly-lichess"  # same entry `cli.keychain_token` reads
STALE_RUN = timedelta(hours=3)  # a "running" row older than this is a crashed run


class AccountIn(BaseModel):
    source: str
    handle: str


class ScheduleIn(BaseModel):
    enabled: bool
    hour: int = Field(6, ge=0, le=23)
    minute: int = Field(0, ge=0, le=59)


class AnswerIn(BaseModel):
    game_id: int
    ply: int
    uci: str = Field(pattern=r"^[a-h][1-8][a-h][1-8][qrbn]?$")


class AnalysisIn(BaseModel):
    depth: int = Field(ge=8, le=30)


class NoteIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    tags: list[str] = []
    game_id: int | None = None
    ply: int | None = Field(None, ge=0)
    fen: str | None = None


class BotMoveIn(BaseModel):
    fen: str
    elo: int | None = Field(None, ge=100, le=play.MAX_ELO)  # None: the best move, as a hint


class PlayedGameIn(BaseModel):
    moves: list[str] = Field(min_length=1, max_length=1000)  # UCI, from the start position
    color: Literal["white", "black"]
    elo: int = Field(ge=100, le=play.MAX_ELO)
    bot: str = Field(min_length=1, max_length=60)
    resigned: Literal["white", "black"] | None = None
    started_at: datetime | None = None


def position_key(fen: str) -> str:
    """The parts of a FEN that make two positions the same for a note: pieces, side to move,
    castling rights. Move counters differ between games, and the en passant square is written
    differently by python-chess and chess.js, so both are left out."""
    return " ".join(fen.split()[:3])


def game_positions(start_fen: str | None, moves_san: str | None) -> list[str]:
    """Position key after each ply (index 0 = the start), up to the first unplayable move."""
    board = chess.Board(start_fen or chess.STARTING_FEN)
    keys = [position_key(board.fen())]
    for san in (moves_san or "").split():
        try:
            board.push_san(san)
        except ValueError:
            break
        keys.append(position_key(board.fen()))
    return keys


@functools.cache
def engine_name() -> str | None:
    """"Stockfish 19" from the engine's banner, or None if it isn't installed."""
    path = os.environ.get("STOCKFISH") or shutil.which("stockfish")
    if not path:
        return None
    try:
        out = subprocess.run([path], input="quit\n", capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return " ".join(out.stdout.split()[:2]) or None


def lichess_token_saved() -> bool:
    """Whether a token is available, without ever reading the secret itself."""
    if os.environ.get("LICHESS_TOKEN"):
        return True
    found = subprocess.run(["security", "find-generic-password", "-s", KEYCHAIN_SERVICE],
                           capture_output=True)
    return found.returncode == 0


def create_app(db_path: str | Path = db.DEFAULT_DB, static_dir: Path | None = None) -> FastAPI:
    db_path = str(Path(db_path).resolve())
    app = FastAPI(title="knightly")

    def query(sql: str, params=()) -> list[sqlite3.Row]:
        # Read-only, so the API never competes with `sync` or `analyze` for the write lock.
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        try:
            return conn.execute(sql, params).fetchall()
        finally:
            conn.close()

    def facts(where: str = "1", params=(), order: str = "f.played_at") -> list[sqlite3.Row]:
        return query(f"SELECT * FROM ({GAME_FACTS}) f WHERE {where} ORDER BY {order}", params)

    def write():
        """A short-lived read-write connection, for the Settings page's few writes."""
        return closing(db.connect(db_path))

    @app.get("/api/accounts")
    def accounts():
        return [dict(r) for r in query("SELECT source, handle FROM accounts ORDER BY source")]

    @app.post("/api/accounts", status_code=201)
    def add_account(body: AccountIn):
        if body.source not in SOURCES:
            raise HTTPException(400, f"source must be one of {', '.join(SOURCES)}")
        if not HANDLE.match(body.handle):
            raise HTTPException(400, "That doesn't look like a username.")
        with write() as conn, conn:
            db.add_account(conn, body.source, body.handle)
        return {"source": body.source, "handle": body.handle}

    @app.delete("/api/accounts/{source}/{handle}", status_code=204)
    def remove_account(source: str, handle: str):
        # Games already imported stay; the account just stops being synced.
        with write() as conn, conn:
            conn.execute("DELETE FROM accounts WHERE source = ? AND handle = ?", (source, handle))

    @app.get("/api/games/{game_id}/lines/{ply}")
    def engine_lines(game_id: int, ply: int):
        """The "Why" and "Best line" for one move. Computed with Stockfish the first time
        (about a second) at the Settings depth, then served from the engine_lines table."""
        depth_row = query("SELECT value FROM settings WHERE key = 'analysis_depth'")
        depth = int(depth_row[0]["value"]) if depth_row else db.DEFAULT_DEPTH
        cached = query("SELECT data FROM engine_lines WHERE game_id = ? AND ply = ? AND depth = ?",
                       (game_id, ply, depth))
        if cached:
            data = json.loads(cached[0]["data"])
            if all(line.get("v") == lines.VERSION for line in data.values()):
                return data  # else written by an older lines.py: recompute below
        move = query("""SELECT m.fen_before, m.uci, m.is_user, g.opponent
                        FROM moves m JOIN games g ON g.id = m.game_id
                        WHERE m.game_id = ? AND m.ply = ?""", (game_id, ply))
        if not move:
            raise HTTPException(404, "No analysed move there; run `knightly analyze` first.")
        m = move[0]
        # Who answers the move in the "why" line: you, after the opponent's moves.
        other_side = "you" if m["is_user"] == 0 else (m["opponent"] or "your opponent")
        try:
            with lines.Engine(depth) as engine:
                data = lines.compute(m["fen_before"], m["uci"], other_side, engine)
        except SystemExit as e:  # Stockfish not installed
            raise HTTPException(503, str(e)) from None
        with write() as conn, conn:
            conn.execute("INSERT OR REPLACE INTO engine_lines (game_id, ply, depth, data) VALUES (?, ?, ?, ?)",
                         (game_id, ply, depth, json.dumps(data)))
        return data

    @app.get("/api/games/{game_id}/notes")
    def game_notes(game_id: int):
        """Notes written on this game, plus notes from any game on a position that also comes
        up in this one. `plies` says where each note's position is in this game."""
        g = query("SELECT start_fen, moves_san FROM games WHERE id = ?", (game_id,))
        if not g:
            raise HTTPException(404, "game not found")
        plies: dict[str, list[int]] = {}
        for ply, key in enumerate(game_positions(g[0]["start_fen"], g[0]["moves_san"])):
            plies.setdefault(key, []).append(ply)
        rows = query("""SELECT n.id, n.created_at, n.body, n.tags, n.game_id, n.ply, n.fen,
                               g.opponent, g.played_at
                        FROM notes n LEFT JOIN games g ON g.id = n.game_id
                        WHERE n.game_id = ? OR n.fen IS NOT NULL
                        ORDER BY n.created_at, n.id""", (game_id,))
        out = []
        for r in rows:
            here = plies.get(position_key(r["fen"]), []) if r["fen"] else []
            if r["game_id"] == game_id or here:
                out.append(_note_json(r, here))
        return out

    @app.post("/api/notes", status_code=201)
    def add_note(body: NoteIn):
        text = body.body.strip()
        if not text:
            raise HTTPException(400, "A note needs some text.")
        if body.fen:
            try:
                chess.Board(body.fen)
            except ValueError:
                raise HTTPException(400, "That FEN isn't a valid position.") from None
        if body.game_id is not None and not query("SELECT 1 FROM games WHERE id = ?", (body.game_id,)):
            raise HTTPException(400, "No game with that id.")
        tags = sorted({t.strip().lstrip("#").lower() for t in body.tags if t.strip().lstrip("#")})
        with write() as conn, conn:
            cur = conn.execute("INSERT INTO notes (body, tags, game_id, ply, fen) VALUES (?, ?, ?, ?, ?)",
                               (text, json.dumps(tags) if tags else None, body.game_id, body.ply, body.fen))
            row = conn.execute("""SELECT n.*, g.opponent, g.played_at FROM notes n
                                  LEFT JOIN games g ON g.id = n.game_id WHERE n.id = ?""",
                               (cur.lastrowid,)).fetchone()
        return _note_json(row, [body.ply] if body.ply is not None else [])

    @app.delete("/api/notes/{note_id}", status_code=204)
    def delete_note(note_id: int):
        with write() as conn, conn:
            if not conn.execute("DELETE FROM notes WHERE id = ?", (note_id,)).rowcount:
                raise HTTPException(404, "note not found")

    @app.post("/api/play/move")
    def bot_move(body: BotMoveIn):
        """The bot's reply at `elo`, or the engine's best move when `elo` is left out."""
        try:
            board = chess.Board(body.fen)
        except ValueError:
            raise HTTPException(400, "not a valid FEN") from None
        if board.is_game_over():
            raise HTTPException(400, "the game is over")
        try:
            with chess.engine.SimpleEngine.popen_uci(find_engine(None)) as engine:
                move = play.bot_move(engine, board, body.elo)
        except SystemExit as e:  # Stockfish not installed
            raise HTTPException(503, str(e)) from None
        return {"uci": move.uci(), "san": board.san(move)}

    @app.post("/api/play/games", status_code=201)
    def save_played(body: PlayedGameIn):
        """Save a finished game against the bot as an unrated game, so it can be reviewed."""
        handles = query("SELECT handle FROM accounts ORDER BY source = 'chesscom' DESC, source")
        user = handles[0]["handle"] if handles else "You"
        try:
            row = play.game_row(body.moves, body.color, user, body.bot, body.elo,
                                resigned=body.resigned, started_at=body.started_at)
        except ValueError as e:
            raise HTTPException(400, f"not a finished, legal game: {e}") from None
        with write() as conn, conn:
            db.insert_game(conn, row)
            game_id = conn.execute("SELECT id FROM games WHERE source = ? AND source_id = ?",
                                   (row["source"], row["source_id"])).fetchone()[0]
        return {"id": game_id}

    @app.post("/api/play/games/{game_id}/analysis")
    def analyse_played(game_id: int):
        """Engine analysis of one game right away (several seconds), at the Settings depth."""
        with write() as conn:
            if not conn.execute("SELECT 1 FROM games WHERE id = ?", (game_id,)).fetchone():
                raise HTTPException(404, "game not found")
            try:
                play.analyse_saved(conn, game_id, play.default_depth(conn))
            except SystemExit as e:
                raise HTTPException(503, str(e)) from None
        return {"analysed": True}

    @app.get("/api/deck")
    def deck_today():
        """The review deck's counts and today's next card (null when today's are done).
        Adds cards for newly analysed games first, so the deck is always current."""
        with write() as conn, conn:
            deck.sync(conn)
            info = deck.stats(conn)
            nxt = deck.queue(conn)[:1]
        card = None
        if nxt:
            rows = query(
                """SELECT c.game_id, c.ply, c.step, c.reviews, m.fen_before, m.color, m.san,
                          m.uci, m.move_number, m.classification, m.win_pct_before,
                          prev.uci AS prev_uci, g.opponent, g.played_at, g.time_control,
                          g.speed, g.user_outcome
                   FROM cards c
                   JOIN moves m ON m.game_id = c.game_id AND m.ply = c.ply
                   JOIN games g ON g.id = c.game_id
                   LEFT JOIN moves prev ON prev.game_id = m.game_id AND prev.ply = m.ply - 1
                   WHERE c.game_id = ? AND c.ply = ?""",
                (nxt[0]["game_id"], nxt[0]["ply"]),
            )
            card = dict(rows[0])
        return {**info, "card": card}

    @app.post("/api/deck/answer")
    def deck_answer(body: AnswerIn):
        with write() as conn, conn:
            try:
                return deck.answer(conn, body.game_id, body.ply, body.uci)
            except KeyError:
                raise HTTPException(404, "No card for that position.") from None

    @app.get("/api/settings")
    def settings():
        path = Path(db_path)
        backups = sorted((path.parent / "backups").glob(f"{path.stem}-????-??-??.db"))
        cursors = {(r["source"], r["account"], r["kind"]): r["cursor"]
                   for r in query("SELECT source, account, kind, cursor FROM sync_state")}
        last = query("""SELECT id, started_at, finished_at, status, trigger, new_games,
                               new_puzzles, games_analysed, errors, progress
                        FROM runs WHERE status != 'running' ORDER BY id DESC LIMIT 1""")
        cutoff = (datetime.now(timezone.utc) - STALE_RUN).strftime("%Y-%m-%dT%H:%M:%SZ")
        current = query("""SELECT id, started_at, trigger, progress FROM runs
                           WHERE status = 'running' AND started_at >= ?
                           ORDER BY id DESC LIMIT 1""", (cutoff,))

        def run_json(row):
            run = dict(row)
            run["progress"] = json.loads(run["progress"]) if run.get("progress") else None
            if "errors" in run:
                run["errors"] = json.loads(run["errors"]) if run["errors"] else []
            return run

        counts = query("""SELECT (SELECT count(*) FROM games) AS games,
                                 (SELECT count(*) FROM game_analysis) AS analysed""")[0]
        depth = query("SELECT value FROM settings WHERE key = 'analysis_depth'")
        return {
            "accounts": [
                {**dict(a), "synced_through": cursors.get((a["source"], a["handle"].lower(), "games"))}
                for a in query("SELECT source, handle FROM accounts ORDER BY source")
            ],
            "lichess_token": lichess_token_saved(),
            "schedule": schedule.current(),
            "last_run": run_json(last[0]) if last else None,
            "current_run": run_json(current[0]) if current else None,
            "running": bool(current),
            "engine": engine_name(),
            "depth": int(depth[0]["value"]) if depth else db.DEFAULT_DEPTH,
            "database": {
                "path": str(path),
                "bytes": sum(p.stat().st_size for p in (path, Path(f"{path}-wal")) if p.exists()),
                **dict(counts),
            },
            "backups": {"dir": str(path.parent / "backups"), "count": len(backups),
                        "keep": update.KEEP_BACKUPS},
        }

    @app.put("/api/settings/analysis")
    def set_analysis(body: AnalysisIn):
        with write() as conn, conn:
            db.set_setting(conn, "analysis_depth", body.depth)
        return {"depth": body.depth}

    @app.put("/api/settings/schedule")
    def set_schedule(body: ScheduleIn):
        try:
            if body.enabled:
                schedule.install(Path(db_path), hour=body.hour, minute=body.minute, log=lambda _: None)
            else:
                schedule.uninstall(log=lambda _: None)
        except SystemExit as e:  # schedule.py reports failures this way for the CLI
            raise HTTPException(400, str(e)) from None
        return schedule.current()

    @app.post("/api/update/run", status_code=202)
    def run_update():
        """Start the update pipeline in the background: via launchd when the daily job is
        installed (same low priority and log), else as a detached `knightly update`."""
        if schedule.current():
            try:
                schedule.run_now(log=lambda _: None)
            except SystemExit as e:
                raise HTTPException(400, str(e)) from None
        else:
            exe = Path(sys.executable).parent / "knightly"
            schedule.LOG.parent.mkdir(parents=True, exist_ok=True)
            with open(schedule.LOG, "a") as log_file:
                subprocess.Popen(
                    [str(exe), "--db", db_path, "update", "--workers", str(schedule.SCHEDULED_WORKERS)],
                    stdout=log_file, stderr=log_file, stdin=subprocess.DEVNULL,
                    cwd=str(Path(db_path).parent), start_new_session=True)
        return {"started": True}

    @app.get("/api/overview")
    def overview(range: str = Query("90d", pattern="^(30d|90d|all)$")):
        start, end, prev_start = period_bounds(range)
        # Overview stats are rated games only: unrated daily games are mostly vs bots.
        rated = facts("f.rated = 1")
        current = [r for r in rated if start is None or r["played_at"] >= start]
        previous = [r for r in rated if prev_start and prev_start <= r["played_at"] < start]
        before = [r for r in rated if start and r["played_at"] < start]

        ratings = [r["user_rating"] for r in current if r["user_rating"]]
        baseline = before[-1]["user_rating"] if before else (ratings[0] if ratings else None)
        weeks = max(1, RANGES[range] / 7) if RANGES[range] else max(1, (
            (datetime.fromisoformat(current[-1]["played_at"][:10]) -
             datetime.fromisoformat(current[0]["played_at"][:10])).days / 7 if current else 1))

        # Grouped by ECO code; named after the variation played most often within it.
        openings = query(f"""
            WITH g AS (SELECT * FROM games WHERE rated = 1 AND eco IS NOT NULL
                       {"AND played_at >= ?" if start else ""}),
            names AS (SELECT eco, user_color, opening, row_number() OVER (
                          PARTITION BY eco, user_color ORDER BY count(*) DESC) AS rn
                      FROM g WHERE opening != '' GROUP BY eco, user_color, opening)
            SELECT g.eco, n.opening, g.user_color AS color, count(*) AS games,
                   avg(g.user_outcome = 'win') AS win_rate
            FROM g LEFT JOIN names n ON n.eco = g.eco AND n.user_color = g.user_color AND n.rn = 1
            GROUP BY g.eco, g.user_color ORDER BY games DESC LIMIT 3""", (start,) if start else ())

        return {
            "range": range,
            "start": start,
            "end": end,
            "rating": {
                "current": ratings[-1] if ratings else None,
                "change": ratings[-1] - baseline if ratings and baseline else None,
                "best": max(ratings) if ratings else None,
            },
            "games_played": len(current),
            "games_per_week": len(current) / weeks,
            "games_analysed": sum(1 for r in current if r["analysed"]),
            "rating_series": [
                {"id": r["id"], "played_at": r["played_at"], "rating": r["user_rating"],
                 "outcome": r["user_outcome"], "opponent": r["opponent"],
                 "opponent_rating": r["opponent_rating"]}
                for r in current if r["user_rating"]
            ],
            "kpis": kpis(current),
            "previous_kpis": kpis(previous, MIN_SAMPLE) if previous else None,
            "kpi_series": _weekly(current, start, end),
            "recent_games": [_game_json(r) for r in reversed(current[-5:])],
            "top_openings": [dict(o) for o in openings],
        }

    @app.get("/api/games")
    def games(
        q: str | None = None,
        speed: str | None = None,
        color: str | None = Query(None, pattern="^(white|black)$"),
        result: str | None = Query(None, pattern="^(win|loss|draw)$"),
        range: str = Query("all", pattern="^(30d|90d|all)$"),
        analysed: bool = False,
        unrated: bool = False,
        kpi: str | None = None,
        page: int = Query(1, ge=1),
    ):
        where, params = ["1"], []
        if q:
            where.append("(f.opponent LIKE ? OR f.opening LIKE ? OR f.eco LIKE ?)")
            params += [f"%{q}%"] * 3
        if speed:
            where.append("f.speed = ?")
            params.append(speed)
        if color:
            where.append("f.user_color = ?")
            params.append(color)
        if result:
            where.append("f.user_outcome = ?")
            params.append(result)
        start, _, _ = period_bounds(range)
        if start:
            where.append("f.played_at >= ?")
            params.append(start)
        if analysed:
            where.append("f.analysed")
        if not unrated:
            where.append("f.rated = 1")
        if kpi:
            if kpi not in KPI_FILTERS:
                raise HTTPException(400, f"unknown kpi {kpi!r}")
            where.append(KPI_FILTERS[kpi])

        rows = facts(" AND ".join(where), params, order="f.played_at DESC")
        page_rows = rows[(page - 1) * PAGE_SIZE: page * PAGE_SIZE]
        return {
            "total": len(rows),
            "page": page,
            "page_size": PAGE_SIZE,
            "games": [_game_json(r) for r in page_rows],
        }

    @app.get("/api/games/{game_id}")
    def game(game_id: int):
        rows = facts("f.id = ?", (game_id,))
        if not rows:
            raise HTTPException(404, "game not found")
        g = query("""SELECT white, black, white_elo, black_elo, start_fen, moves_san, account
                     FROM games WHERE id = ?""", (game_id,))[0]
        a = query("""SELECT user_accuracy, opponent_accuracy FROM game_analysis WHERE game_id = ?""",
                  (game_id,))
        cards = query("SELECT ply FROM cards WHERE game_id = ? ORDER BY ply", (game_id,))
        moves = query("""SELECT ply, color, is_user, san, uci, best_san, best_uci, eval_after,
                                mate_after, win_pct_before, win_pct_after, classification,
                                clock_left, time_spent
                         FROM moves WHERE game_id = ? ORDER BY ply""", (game_id,))
        return {
            **_game_json(rows[0]),
            "account": g["account"],
            "white": g["white"], "black": g["black"],
            "white_elo": g["white_elo"], "black_elo": g["black_elo"],
            "start_fen": g["start_fen"],
            # Always present, so unanalysed games can still be stepped through.
            "san": (g["moves_san"] or "").split(),
            "engine_accuracy": a[0]["user_accuracy"] if a else None,
            "opponent_accuracy": a[0]["opponent_accuracy"] if a else None,
            "plies": [dict(m) for m in moves],
            # Your moves from this game that are in the review deck.
            "deck_plies": [c["ply"] for c in cards],
        }

    @app.post("/api/games/{game_id}/review")
    def finish_review(game_id: int):
        """Marks a game reviewed ("Finish review"). Finishing again moves the time forward.
        Also makes sure the game's positions are in the review deck, so the summary that
        follows can say so."""
        with write() as conn, conn:
            if not conn.execute("SELECT 1 FROM games WHERE id = ?", (game_id,)).fetchone():
                raise HTTPException(404, "game not found")
            deck.sync(conn)
            now = _iso(_now())
            conn.execute(
                """INSERT INTO game_reviews (game_id, reviewed_at) VALUES (?, ?)
                   ON CONFLICT (game_id) DO UPDATE SET reviewed_at = excluded.reviewed_at""",
                (game_id, now),
            )
        return {"reviewed_at": now}

    if static_dir and static_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            # Client-side routes (/games?...) all serve the SPA shell.
            return FileResponse(static_dir / "index.html")

    return app
