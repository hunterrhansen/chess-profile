"""The review deck: spaced repetition over positions from your own games.

Every mistake, miss or blunder of yours where one move was clearly better than the rest
becomes a card: the position before your move, and the engine's move as the answer. Get it
right and it comes back later and later (3 days, a week, 3 weeks, 2 months); four in a row
and it's mastered. Get it wrong and it comes back tomorrow.

Each day serves at most DAILY_LIMIT cards, due ones first, then new ones from your newest
games. A day off never piles up a backlog: the next day is still at most DAILY_LIMIT. Only
a card's first answer of the day counts, so trying again after a miss is free.
"""
import sqlite3
from datetime import date, datetime, timedelta, timezone

from .analyze import win_pct
from .brilliance import GREAT_GAP

INTERVALS = [3, 7, 21, 60]  # days until the next review after 1, 2, 3, 4 right in a row
MASTERED = len(INTERVALS)   # a card's step once it has been right this many times in a row
DAILY_LIMIT = 10
KINDS = ("mistake", "miss", "blunder")
# One move clearly better: the engine's second choice would have cost this much win%,
# the same bar as a Great move.
CLEAR_GAP = GREAT_GAP


def clear_best(color: str, eval_best: int | None, eval_second: int | None) -> bool:
    """Whether the engine's best move beat its second choice by CLEAR_GAP, from the mover's
    side. Evals are White's point of view, as stored in `moves`."""
    if eval_best is None or eval_second is None:
        return False
    sign = 1 if color == "white" else -1
    return win_pct(sign * eval_best) - win_pct(sign * eval_second) >= CLEAR_GAP


def sync(conn: sqlite3.Connection) -> int:
    """Add a card for every qualifying move that doesn't have one yet. Cards are never
    removed, so re-analysing a game keeps its review history. Returns how many were added."""
    rows = conn.execute(
        f"""SELECT m.game_id, m.ply, m.color, m.eval_before, m.eval_second
            FROM moves m LEFT JOIN cards c ON c.game_id = m.game_id AND c.ply = m.ply
            WHERE m.is_user = 1 AND m.best_uci IS NOT NULL AND c.game_id IS NULL
              AND m.classification IN ({", ".join("?" for _ in KINDS)})""",
        KINDS,
    ).fetchall()
    new = [(r["game_id"], r["ply"]) for r in rows
           if clear_best(r["color"], r["eval_before"], r["eval_second"])]
    # OR IGNORE: two requests can sync at once (the page loading twice, say).
    return conn.executemany("INSERT OR IGNORE INTO cards (game_id, ply) VALUES (?, ?)", new).rowcount


def _reviewed_today(conn, today: date) -> set[tuple[int, int]]:
    rows = conn.execute(
        "SELECT DISTINCT game_id, ply FROM card_reviews WHERE date(reviewed_at, 'localtime') = ?",
        (today.isoformat(),),
    )
    return {(r["game_id"], r["ply"]) for r in rows}


def queue(conn, today: date | None = None) -> list[sqlite3.Row]:
    """Today's remaining cards, in order: due ones (most overdue first), then new ones from
    the newest games. At most DAILY_LIMIT a day, counting cards already answered today."""
    today = today or date.today()
    done = _reviewed_today(conn, today)
    room = max(0, DAILY_LIMIT - len(done))
    if not room:
        return []
    rows = conn.execute(
        f"""SELECT c.game_id, c.ply, c.step, c.due FROM cards c
            JOIN moves m ON m.game_id = c.game_id AND m.ply = c.ply
            JOIN games g ON g.id = c.game_id
            WHERE c.step < ? AND (c.due IS NULL OR c.due <= ?) AND m.best_uci IS NOT NULL
            ORDER BY c.due IS NULL, c.due, g.played_at DESC, c.ply""",
        (MASTERED, today.isoformat()),
    ).fetchall()
    return [r for r in rows if (r["game_id"], r["ply"]) not in done][:room]


def stats(conn, today: date | None = None) -> dict:
    today = today or date.today()
    totals = conn.execute(
        """SELECT count(*) AS total, sum(step >= ?) AS mastered,
                  sum(step > 0 AND step < ?) AS learning, sum(reviews = 0) AS new
           FROM cards""",
        (MASTERED, MASTERED),
    ).fetchone()
    done = len(_reviewed_today(conn, today))
    return {
        "total": totals["total"],
        "mastered": totals["mastered"] or 0,
        "learning": totals["learning"] or 0,
        "new": totals["new"] or 0,
        "today": {"done": done, "total": done + len(queue(conn, today))},
    }


def today_results(conn, today: date | None = None) -> list[dict]:
    """Today's graded answers in the order given (a card's first answer of the day only),
    with what's needed to name the position: "29…Qxc8 vs woolcap"."""
    today = today or date.today()
    rows = conn.execute(
        """SELECT r.game_id, r.ply, r.correct, m.san, g.opponent
           FROM card_reviews r
           JOIN moves m ON m.game_id = r.game_id AND m.ply = r.ply
           JOIN games g ON g.id = r.game_id
           WHERE date(r.reviewed_at, 'localtime') = ? ORDER BY r.reviewed_at, r.id""",
        (today.isoformat(),),
    ).fetchall()
    seen, out = set(), []
    for r in rows:
        if (r["game_id"], r["ply"]) in seen:
            continue
        seen.add((r["game_id"], r["ply"]))
        out.append({"game_id": r["game_id"], "ply": r["ply"], "correct": bool(r["correct"]),
                    "san": r["san"], "opponent": r["opponent"]})
    return out


def answer(conn, game_id: int, ply: int, uci: str, today: date | None = None,
           now: datetime | None = None) -> dict:
    """Grade an answer and reschedule the card. Only the first answer of the day moves
    the schedule; later ones just say whether they were right. Skip sends the null move
    "0000", which counts as a miss."""
    today = today or date.today()
    card = conn.execute(
        """SELECT c.step, c.due, m.best_uci, m.best_san FROM cards c
           JOIN moves m ON m.game_id = c.game_id AND m.ply = c.ply
           WHERE c.game_id = ? AND c.ply = ?""",
        (game_id, ply),
    ).fetchone()
    if card is None:
        raise KeyError((game_id, ply))
    # Promotions: the board always offers a queen, the engine might have wanted a knight.
    correct = uci == card["best_uci"] or (len(uci) == 5 and uci[:4] == card["best_uci"][:4])
    step, due = card["step"], card["due"]
    if (game_id, ply) not in _reviewed_today(conn, today):
        if correct:
            step += 1
            due = None if step >= MASTERED else (today + timedelta(days=INTERVALS[step - 1])).isoformat()
        else:
            step = 0
            due = (today + timedelta(days=1)).isoformat()
        stamp = (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")
        conn.execute(
            """UPDATE cards SET step = ?, due = ?, reviews = reviews + 1,
                      lapses = lapses + ?, last_reviewed_at = ?
               WHERE game_id = ? AND ply = ?""",
            (step, due, 0 if correct else 1, stamp, game_id, ply),
        )
        conn.execute(
            "INSERT INTO card_reviews (game_id, ply, reviewed_at, answer_uci, correct) VALUES (?, ?, ?, ?, ?)",
            (game_id, ply, stamp, uci, int(correct)),
        )
    return {
        "correct": correct,
        "best_uci": card["best_uci"],
        "best_san": card["best_san"],
        "step": step,
        "mastered": step >= MASTERED,
        "due": due,
    }
