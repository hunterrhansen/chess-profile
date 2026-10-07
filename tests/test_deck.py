from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from chessprofile import api, db, deck

START = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"


def add_game(conn, gid, played_at="2026-10-01T12:00:00Z"):
    conn.execute(
        """INSERT INTO games (id, source, source_id, played_at, speed, user_color, user_outcome,
           opponent, pgn) VALUES (?, 'chesscom', ?, ?, 'rapid', 'black', 'loss', 'opp', '')""",
        (gid, str(gid), played_at),
    )


def add_move(conn, gid, ply, *, cls="blunder", is_user=1, color="black", best=-50, second=300,
             best_uci="e7e5", uci="g7g5"):
    """A move with the engine's best and second-best evals (White's point of view)."""
    conn.execute(
        """INSERT INTO moves (game_id, ply, move_number, color, is_user, phase, fen_before, san,
           uci, best_san, best_uci, eval_before, eval_second, classification, win_pct_before)
           VALUES (?, ?, ?, ?, ?, 'opening', ?, 'g5', ?, 'e5', ?, ?, ?, ?, 50)""",
        (gid, ply, (ply + 1) // 2, color, is_user, START, uci, best_uci, best, second, cls),
    )


@pytest.fixture
def conn(tmp_path):
    c = db.connect(tmp_path / "chess.db")
    yield c
    c.close()


def test_clear_best_is_from_the_movers_side():
    # Black to move: -50 vs +300 means the second choice is much worse for Black.
    assert deck.clear_best("black", -50, 300)
    assert not deck.clear_best("black", -50, -20)
    assert deck.clear_best("white", 50, -300)
    assert not deck.clear_best("white", 50, None)


def test_sync_adds_only_clear_mistakes_of_yours_once(conn):
    add_game(conn, 1)
    add_move(conn, 1, 2)                              # blunder, one clear best move
    add_move(conn, 1, 4, cls="mistake", second=-20)   # several moves about as good
    add_move(conn, 1, 6, cls="inaccuracy")            # not a mistake
    add_move(conn, 1, 7, is_user=0, color="white", best=50, second=-300)  # opponent's
    add_move(conn, 1, 8, cls="miss")
    assert deck.sync(conn) == 2
    assert deck.sync(conn) == 0
    assert {tuple(r) for r in conn.execute("SELECT game_id, ply FROM cards")} == {(1, 2), (1, 8)}


def test_schedule_grows_until_mastered_and_resets_on_a_miss(conn):
    add_game(conn, 1)
    add_move(conn, 1, 2)
    deck.sync(conn)
    day = date(2026, 10, 6)
    for step, interval in enumerate(deck.INTERVALS, start=1):
        r = deck.answer(conn, 1, 2, "e7e5", today=day)
        assert r["correct"] and r["step"] == step
        if step < deck.MASTERED:
            assert r["due"] == (day + timedelta(days=interval)).isoformat()
            day += timedelta(days=interval)
    assert r["mastered"] and r["due"] is None
    assert deck.queue(conn, day + timedelta(days=365)) == []

    add_move(conn, 1, 4)
    deck.sync(conn)
    deck.answer(conn, 1, 4, "e7e5", today=day)
    r = deck.answer(conn, 1, 4, "g7g5", today=day + timedelta(days=3))
    assert not r["correct"] and r["step"] == 0
    assert r["due"] == (day + timedelta(days=4)).isoformat()


def test_only_the_first_answer_of_the_day_counts(conn):
    add_game(conn, 1)
    add_move(conn, 1, 2)
    deck.sync(conn)
    today = date.today()
    assert not deck.answer(conn, 1, 2, "g7g5", today=today)["correct"]
    again = deck.answer(conn, 1, 2, "e7e5", today=today)
    assert again["correct"] and again["step"] == 0  # right on the retry, but still due tomorrow
    assert tuple(conn.execute("SELECT reviews, lapses FROM cards").fetchone()) == (1, 1)


def test_queue_caps_the_day_and_puts_new_games_first(conn):
    add_game(conn, 1, played_at="2026-09-01T12:00:00Z")
    add_game(conn, 2, played_at="2026-10-01T12:00:00Z")
    for ply in range(2, 2 + 2 * 8, 2):
        add_move(conn, 1, ply)
        add_move(conn, 2, ply)
    deck.sync(conn)
    today = date.today()
    q = deck.queue(conn, today)
    assert len(q) == deck.DAILY_LIMIT
    assert [r["game_id"] for r in q[:8]] == [2] * 8
    deck.answer(conn, q[0]["game_id"], q[0]["ply"], "e7e5", today=today)
    assert len(deck.queue(conn, today)) == deck.DAILY_LIMIT - 1
    assert deck.stats(conn, today)["today"] == {"done": 1, "total": deck.DAILY_LIMIT}


def test_queue_serves_due_cards_before_new_ones(conn):
    add_game(conn, 1)
    add_move(conn, 1, 2)
    add_move(conn, 1, 4)
    deck.sync(conn)
    yesterday = date.today() - timedelta(days=1)
    conn.execute("UPDATE cards SET step = 1, due = ?, reviews = 1 WHERE ply = 4", (yesterday.isoformat(),))
    assert [r["ply"] for r in deck.queue(conn)] == [4, 2]


def test_promotion_to_a_queen_counts_for_any_promotion(conn):
    add_game(conn, 1)
    add_move(conn, 1, 2, best_uci="b2b1n")
    deck.sync(conn)
    assert deck.answer(conn, 1, 2, "b2b1q")["correct"]


def test_api_serves_a_card_and_grades_it(tmp_path):
    path = tmp_path / "chess.db"
    with db.connect(path) as c:
        add_game(c, 1)
        add_move(c, 1, 1, cls="best", is_user=0, color="white", uci="e2e4", best_uci="e2e4")
        add_move(c, 1, 2)
    client = TestClient(api.create_app(path))

    today = client.get("/api/deck").json()
    assert today["total"] == 1 and today["today"] == {"done": 0, "total": 1}
    card = today["card"]
    assert (card["game_id"], card["ply"], card["san"], card["prev_uci"]) == (1, 2, "g5", "e2e4")
    assert "best_uci" not in card  # the answer stays on the server until you've tried

    graded = client.post("/api/deck/answer", json={"game_id": 1, "ply": 2, "uci": "e7e5"}).json()
    assert graded["correct"] and graded["best_san"] == "e5"
    after = client.get("/api/deck").json()
    assert after["card"] is None and after["today"] == {"done": 1, "total": 1}

    assert client.post("/api/deck/answer", json={"game_id": 9, "ply": 2, "uci": "e7e5"}).status_code == 404
    assert client.post("/api/deck/answer", json={"game_id": 1, "ply": 2, "uci": "nonsense"}).status_code == 422
