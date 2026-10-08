"""The review deck: spaced repetition over positions from your own games.

Every mistake, miss or blunder of yours where one move was clearly better than the rest
becomes a card: the position before your move, and the engine's move as the answer.

Scheduling is inspired by Anki, the go-to for learning a lot and keeping it (decided Oct 7,
2026): it uses FSRS, the scheduler Anki uses by default, and grades each answer with Anki's
buttons, which the app presses for you from your FIRST try of the day:

- Easy: the engine's own move, found within EASY_SECONDS with no hint: you clearly know it.
- Good: the best move, or one within GOOD_DROP points of win chance of it, or any mate.
- Hard: within HARD_DROP points ("Good move! Best was ...").
- Again: anything else, a hint before answering, or Show me. Anki's manual is clear that a
  forgotten card is Again, never Hard, or the schedule stops being trustworthy.

You can try again after a miss and keep going until you find it; that's for learning and
doesn't change the grade (the same rule Lichess uses for puzzle ratings). A position you
didn't get first time also comes back once more at the end of the session (the app does
that, Duolingo-style; it stands in for Anki's relearning steps, so FSRS runs without any).

Each day serves at most DAILY_LIMIT cards, due ones first, then new ones from your newest
games. A day off never piles up a backlog: the next day is still at most DAILY_LIMIT.
"""
import json
from datetime import date, datetime, timezone

import chess
import chess.engine
from fsrs import Card, Rating, ReviewLog, Scheduler

from . import db, positions
from .analyze import find_engine, win_pct
from .brilliance import GREAT_GAP

DAILY_LIMIT = 10
KINDS = ("mistake", "miss", "blunder")
# One move clearly better: the engine's second choice would have cost this much win%,
# the same bar as a Great move.
CLEAR_GAP = GREAT_GAP
# How close to the best move an answer must be, in points of win chance (Lichess and
# Chess.com both call moves within a couple of points good or excellent).
GOOD_DROP = 2
HARD_DROP = 5
JUDGE_DEPTH = 14
# A first try of the engine's move this quick (no hint) is Easy: it spaces out faster.
EASY_SECONDS = 10
# "Mastered" for the counts on Progress and Done: FSRS expects you to remember it for two
# months or more. Mastered cards still come back, just rarely.
MASTERED_DAYS = 60
SKIP = "0000"  # Show me (or Skip): no move

# No learning or relearning steps: the session's end-of-lesson redo does that job.
SCHEDULER = Scheduler(learning_steps=(), relearning_steps=())
# Like Anki's "Optimize": once there are this many graded answers, FSRS can be fitted to your
# own memory (`knightly fsrs-optimize`); with fewer, its optimizer keeps the defaults anyway.
MIN_TUNE_REVIEWS = 512
RATING = {"again": Rating.Again, "hard": Rating.Hard, "good": Rating.Good, "easy": Rating.Easy}


def clear_best(color: str, eval_best: int | None, eval_second: int | None) -> bool:
    """Whether the engine's best move beat its second choice by CLEAR_GAP, from the mover's
    side. Evals are White's point of view, as stored in `moves`."""
    if eval_best is None or eval_second is None:
        return False
    sign = 1 if color == "white" else -1
    return win_pct(sign * eval_best) - win_pct(sign * eval_second) >= CLEAR_GAP


def _qualifying(conn, where: str = "TRUE", params: tuple = ()) -> list[tuple[int, int]]:
    """(game_id, ply) of every move of yours that makes a card, card or not yet."""
    rows = conn.execute(
        f"""SELECT m.game_id, m.ply, m.color, m.eval_before, m.eval_second FROM moves m
            WHERE m.is_user = 1 AND m.best_uci IS NOT NULL
              AND m.classification IN ({", ".join("?" for _ in KINDS)}) AND {where}""",
        (*KINDS, *params),
    ).fetchall()
    return [(r["game_id"], r["ply"]) for r in rows
            if clear_best(r["color"], r["eval_before"], r["eval_second"])]


def game_plies(conn, game_id: int) -> list[int]:
    """The plies of a game that are review-deck positions, or will be at the next sync: game
    review asks you to find these moves, before Finish review has added them."""
    have = {r["ply"] for r in conn.execute("SELECT ply FROM cards WHERE game_id = ?", (game_id,))}
    return sorted(have | {ply for _, ply in _qualifying(conn, "m.game_id = ?", (game_id,))})


def sync(conn: db.Connection) -> int:
    """Add a card for every qualifying move that doesn't have one yet, and give cards
    answered before FSRS their FSRS state. Cards are never removed, so re-analysing a game
    keeps its review history. Returns how many were added."""
    have = {tuple(r) for r in conn.execute("SELECT game_id, ply FROM cards")}
    new = [key for key in _qualifying(conn) if key not in have]
    # DO NOTHING: two requests can sync at once (the page loading twice, say).
    added = conn.executemany("INSERT INTO cards (game_id, ply) VALUES (?, ?) ON CONFLICT DO NOTHING",
                             new).rowcount if new else 0
    _replay_history(conn)
    return added


def scheduler(conn) -> Scheduler:
    """FSRS with your own parameters once they've been tuned, else the defaults."""
    row = conn.execute("SELECT value FROM settings WHERE key = 'fsrs_parameters'").fetchone()
    if not row:
        return SCHEDULER
    return Scheduler(parameters=json.loads(row[0]), learning_steps=(), relearning_steps=())


def _review_logs(conn) -> list[ReviewLog]:
    """Every graded answer (a card's first of the day) as FSRS review logs."""
    rows = conn.execute(
        """SELECT game_id, ply, reviewed_at, rating FROM card_reviews
           WHERE rating IS NOT NULL ORDER BY reviewed_at, id""").fetchall()
    return [ReviewLog(card_id=r["game_id"] * 1000 + r["ply"], rating=RATING[r["rating"]],
                      review_datetime=datetime.fromisoformat(r["reviewed_at"].replace("Z", "+00:00")),
                      review_duration=None) for r in rows]


def tuning(conn) -> dict:
    """Whether the deck runs on your own FSRS parameters, and how many reviews there are."""
    def setting(key):
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return json.loads(row[0]) if row else None
    reviews = conn.execute("SELECT count(*) FROM card_reviews WHERE rating IS NOT NULL").fetchone()[0]
    return {"personal": setting("fsrs_parameters") is not None, "reviews": reviews,
            "needed": MIN_TUNE_REVIEWS, "tuned_at": setting("fsrs_tuned_at"),
            "tuned_reviews": setting("fsrs_tuned_reviews")}


def tune(conn, now: datetime | None = None) -> dict:
    """Fit FSRS to your own answers, as Anki's Optimize does, and use the result from now on.
    Needs MIN_TUNE_REVIEWS reviews and the optimizer (`uv sync --extra optimizer`, PyTorch)."""
    logs = _review_logs(conn)
    if len(logs) < MIN_TUNE_REVIEWS:
        return {**tuning(conn), "tuned": False}
    from fsrs import Optimizer  # raises ImportError without the optimizer extra
    parameters = Optimizer(logs).compute_optimal_parameters()
    stamp = (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")
    for key, value in (("fsrs_parameters", list(parameters)), ("fsrs_tuned_at", stamp),
                       ("fsrs_tuned_reviews", len(logs))):
        conn.execute(
            """INSERT INTO settings (key, value) VALUES (?, ?)
               ON CONFLICT (key) DO UPDATE SET value = excluded.value""", (key, json.dumps(value)))
    return {**tuning(conn), "tuned": True}


def _replay_history(conn) -> None:
    """Cards answered under the old fixed ladder (3 days, 1 week, ...) have no FSRS state:
    rebuild it by replaying their answers, a right one as Good and a wrong one as Again."""
    fsrs = scheduler(conn)
    for card in conn.execute("SELECT game_id, ply FROM cards WHERE fsrs IS NULL AND reviews > 0").fetchall():
        state = Card()
        for r in conn.execute(
            """SELECT reviewed_at, correct FROM card_reviews WHERE game_id = ? AND ply = ?
               ORDER BY reviewed_at, id""", (card["game_id"], card["ply"])):
            at = datetime.fromisoformat(r["reviewed_at"].replace("Z", "+00:00"))
            state, _ = fsrs.review_card(state, Rating.Good if r["correct"] else Rating.Again, at)
            conn.execute(
                "UPDATE card_reviews SET rating = ? WHERE game_id = ? AND ply = ? AND reviewed_at = ? AND rating IS NULL",
                ("good" if r["correct"] else "again", card["game_id"], card["ply"], r["reviewed_at"]))
        conn.execute("UPDATE cards SET fsrs = ?, due = ? WHERE game_id = ? AND ply = ?",
                     (json.dumps(state.to_dict()), _local_date(state.due), card["game_id"], card["ply"]))


def _local_date(at: datetime) -> str:
    return at.astimezone().date().isoformat()


def _reviewed_today(conn, today: date) -> set[tuple[int, int]]:
    rows = conn.execute(
        "SELECT DISTINCT game_id, ply FROM card_reviews WHERE reviewed_at >= ? AND reviewed_at < ?",
        db.day_range(today),
    )
    return {(r["game_id"], r["ply"]) for r in rows}


def queue(conn, today: date | None = None) -> list[db.Row]:
    """Today's remaining cards, in order: due ones (most overdue first), then new ones from
    the newest games. At most DAILY_LIMIT a day, counting cards already answered today."""
    today = today or date.today()
    done = _reviewed_today(conn, today)
    room = max(0, DAILY_LIMIT - len(done))
    if not room:
        return []
    rows = conn.execute(
        """SELECT c.game_id, c.ply, c.due FROM cards c
           JOIN moves m ON m.game_id = c.game_id AND m.ply = c.ply
           JOIN games g ON g.id = c.game_id
           WHERE (c.due IS NULL OR c.due <= ?) AND m.best_uci IS NOT NULL
           ORDER BY c.due IS NULL, c.due, g.played_at DESC NULLS LAST, c.ply""",
        (today.isoformat(),),
    ).fetchall()
    return [r for r in rows if (r["game_id"], r["ply"]) not in done][:room]


def _stability(fsrs_json: str | None) -> float:
    return (json.loads(fsrs_json).get("stability") or 0) if fsrs_json else 0


def stats(conn, today: date | None = None) -> dict:
    today = today or date.today()
    cards = conn.execute("SELECT reviews, fsrs FROM cards").fetchall()
    mastered = sum(1 for c in cards if _stability(c["fsrs"]) >= MASTERED_DAYS)
    new = sum(1 for c in cards if c["reviews"] == 0)
    done = len(_reviewed_today(conn, today))
    kinds = conn.execute(
        """SELECT m.classification AS kind, count(*) AS n FROM cards c
           JOIN moves m ON m.game_id = c.game_id AND m.ply = c.ply GROUP BY m.classification"""
    ).fetchall()
    return {
        "kinds": {k: 0 for k in KINDS} | {r["kind"]: r["n"] for r in kinds if r["kind"] in KINDS},
        "total": len(cards),
        "mastered": mastered,
        "learning": len(cards) - mastered - new,
        "new": new,
        "today": {"done": done, "total": done + len(queue(conn, today))},
    }


def mark(rating: str | None, solved: bool) -> str:
    """How a position went, for the marks on the done screens: found, good move, found with
    help (a retry or a hint), or missed."""
    if rating in ("good", "easy"):
        return "found"
    if rating == "hard":
        return "good"
    return "helped" if solved else "missed"


def today_results(conn, today: date | None = None) -> list[dict]:
    """Today's graded answers in the order given (a card's first answer of the day only),
    with what's needed to name the position: "29…Qxc8 vs woolcap"."""
    today = today or date.today()
    rows = conn.execute(
        """SELECT r.game_id, r.ply, r.correct, r.rating, r.solved, m.san, g.opponent
           FROM card_reviews r
           JOIN moves m ON m.game_id = r.game_id AND m.ply = r.ply
           JOIN games g ON g.id = r.game_id
           WHERE r.reviewed_at >= ? AND r.reviewed_at < ? ORDER BY r.reviewed_at, r.id""",
        db.day_range(today),
    ).fetchall()
    seen, out = set(), []
    for r in rows:
        if (r["game_id"], r["ply"]) in seen:
            continue
        seen.add((r["game_id"], r["ply"]))
        rating = r["rating"] or ("good" if r["correct"] else "again")
        out.append({"game_id": r["game_id"], "ply": r["ply"], "correct": bool(r["correct"]),
                    "mark": mark(rating, bool(r["solved"])), "san": r["san"], "opponent": r["opponent"]})
    return out


def judge(fen: str, uci: str, best_uci: str, eval_best: int | None) -> str:
    """How good an answer is: 'best' (the engine's move, or any mate), 'excellent' (within
    GOOD_DROP points of win chance), 'good' (within HARD_DROP), 'wrong', or 'shown' (no move).
    Needs Stockfish for anything but the engine's own move; without it, only that counts."""
    if uci == SKIP:
        return "shown"
    # Promotions: the board always offers a queen, the engine might have wanted a knight.
    if uci == best_uci or (len(uci) == 5 and uci[:4] == best_uci[:4]):
        return "best"
    board = chess.Board(fen)
    try:
        move = chess.Move.from_uci(uci)
    except ValueError:
        return "wrong"
    if move not in board.legal_moves:
        return "wrong"
    mover = board.turn
    board.push(move)
    if board.is_checkmate():
        return "best"
    if eval_best is None:
        return "wrong"
    try:
        with chess.engine.SimpleEngine.popen_uci(find_engine(None)) as engine:
            info = engine.analyse(board, chess.engine.Limit(depth=JUDGE_DEPTH))
    except (SystemExit, chess.engine.EngineError, OSError):
        return "wrong"
    after = info["score"].white().score(mate_score=10000)
    sign = 1 if mover == chess.WHITE else -1
    drop = win_pct(sign * eval_best) - win_pct(sign * after)
    return "excellent" if drop <= GOOD_DROP else "good" if drop <= HARD_DROP else "wrong"


def answer(conn, game_id: int, ply: int, uci: str, *, hinted: bool = False, redo: bool = False,
           seconds: float | None = None, today: date | None = None, now: datetime | None = None) -> dict:
    """Check an answer. The first answer of the day grades the card (Again / Hard / Good) and
    FSRS schedules it; a hint before it makes it Again, and the engine's move within
    EASY_SECONDS (`seconds`: from the position appearing to the answer) makes it Easy. Later answers that day (a retry, or
    the end-of-session redo with `redo`) only say how good they are, and a retry that finds
    it records the position as found with help."""
    today = today or date.today()

    def load():
        return conn.execute(
            """SELECT c.fsrs, c.due, c.reviews, m.best_uci, m.best_san, m.eval_before
               FROM cards c JOIN moves m ON m.game_id = c.game_id AND m.ply = c.ply
               WHERE c.game_id = ? AND c.ply = ?""",
            (game_id, ply),
        ).fetchone()

    card = load()
    if card is None:
        # Game review asks before Finish review has added the game's cards: add them now.
        sync(conn)
        card = load()
    if card is None:
        raise KeyError((game_id, ply))
    quality = judge(positions.fen_before(conn, game_id, ply), uci, card["best_uci"], card["eval_before"])  # module-level, so tests can swap it
    passed = quality in ("best", "excellent", "good")
    state = Card.from_dict(json.loads(card["fsrs"])) if card["fsrs"] else Card()
    rating = None
    if (game_id, ply) not in _reviewed_today(conn, today):
        rating = "again" if hinted or not passed else "hard" if quality == "good" else "good"
        if rating == "good" and quality == "best" and seconds is not None and seconds <= EASY_SECONDS:
            rating = "easy"
        when = now or datetime.now(timezone.utc)
        duration = round(seconds * 1000) if seconds is not None else None
        state, _ = scheduler(conn).review_card(state, RATING[rating], when, review_duration=duration)
        stamp = when.strftime("%Y-%m-%dT%H:%M:%SZ")
        conn.execute(
            """UPDATE cards SET fsrs = ?, due = ?, reviews = reviews + 1, lapses = lapses + ?,
                      last_reviewed_at = ? WHERE game_id = ? AND ply = ?""",
            (json.dumps(state.to_dict()), _local_date(state.due), int(rating == "again"), stamp, game_id, ply),
        )
        conn.execute(
            """INSERT INTO card_reviews (game_id, ply, reviewed_at, answer_uci, correct, rating, quality, solved)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (game_id, ply, stamp, uci, int(passed and not hinted), rating, quality, int(passed)),
        )
    elif passed and not redo:
        # Found on a retry: it still counts as Again, but the done screen says "with help".
        conn.execute(
            """UPDATE card_reviews SET solved = 1 WHERE id = (
                 SELECT id FROM card_reviews WHERE game_id = ? AND ply = ?
                   AND reviewed_at >= ? AND reviewed_at < ? ORDER BY reviewed_at, id LIMIT 1)""",
            (game_id, ply, *db.day_range(today)),
        )
    due = _local_date(state.due) if card["fsrs"] or rating else None
    return {
        "correct": passed,
        "quality": quality,
        "rating": rating,
        "best_uci": card["best_uci"],
        "best_san": card["best_san"],
        "due": due,
        "mastered": (state.stability or 0) >= MASTERED_DAYS,
    }


def hint(conn, game_id: int, ply: int) -> dict:
    """The answer's move, for the two-step Hint (the piece, then the arrow). Asking makes the
    day's first answer count as Again; the client says so when it answers."""
    row = conn.execute(
        """SELECT m.best_uci FROM cards c JOIN moves m ON m.game_id = c.game_id AND m.ply = c.ply
           WHERE c.game_id = ? AND c.ply = ?""", (game_id, ply)).fetchone()
    if row is None:
        sync(conn)
        row = conn.execute("SELECT best_uci FROM moves WHERE game_id = ? AND ply = ?", (game_id, ply)).fetchone()
    if row is None or not row["best_uci"]:
        raise KeyError((game_id, ply))
    return {"best_uci": row["best_uci"], "from": row["best_uci"][:2]}
