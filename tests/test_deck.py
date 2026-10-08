from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from knightly import api, db, deck

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


@pytest.fixture(autouse=True)
def no_engine(monkeypatch):
    """Judge answers without Stockfish: the engine's move is best, "d7d5" is within 5 points
    (a good move), anything else is wrong."""
    def fake(fen, uci, best_uci, eval_best):
        if uci == deck.SKIP:
            return "shown"
        if uci == best_uci or (len(uci) == 5 and uci[:4] == best_uci[:4]):
            return "best"
        return "good" if uci == "d7d5" else "wrong"
    monkeypatch.setattr(deck, "judge", fake)


NOON = datetime(2026, 10, 6, 18, tzinfo=timezone.utc)  # Oct 6 in any US time zone
DAY = date(2026, 10, 6)


def first_review(conn, gid, ply):
    return conn.execute("SELECT rating, quality, solved FROM card_reviews WHERE game_id = ? AND ply = ?",
                        (gid, ply)).fetchone()


def test_first_try_grades_the_card_like_anki(conn):
    add_game(conn, 1)
    for ply in (2, 4, 6, 8):
        add_move(conn, 1, ply)
    deck.sync(conn)
    best = deck.answer(conn, 1, 2, "e7e5", today=DAY, now=NOON)
    assert best["correct"] and best["rating"] == "good" and best["quality"] == "best"
    assert best["due"] == "2026-10-08"  # FSRS: a new card answered Good comes back in 2 days
    good = deck.answer(conn, 1, 4, "d7d5", today=DAY, now=NOON)
    assert good["correct"] and good["rating"] == "hard" and good["due"] == "2026-10-07"
    wrong = deck.answer(conn, 1, 6, "g7g5", today=DAY, now=NOON)
    assert not wrong["correct"] and wrong["rating"] == "again" and wrong["due"] == "2026-10-07"
    hinted = deck.answer(conn, 1, 8, "e7e5", hinted=True, today=DAY, now=NOON)
    assert hinted["correct"] and hinted["rating"] == "again"
    assert tuple(conn.execute("SELECT reviews, lapses FROM cards WHERE ply = 6").fetchone()) == (1, 1)


def test_a_retry_is_for_learning_and_keeps_the_grade(conn):
    add_game(conn, 1)
    add_move(conn, 1, 2)
    add_move(conn, 1, 4)
    deck.sync(conn)
    assert deck.answer(conn, 1, 2, "g7g5", today=DAY, now=NOON)["rating"] == "again"
    retry = deck.answer(conn, 1, 2, "e7e5", today=DAY, now=NOON)
    assert retry["correct"] and retry["rating"] is None and retry["due"] == "2026-10-07"
    assert tuple(first_review(conn, 1, 2)) == ("again", "wrong", 1)
    assert conn.execute("SELECT count(*) FROM card_reviews").fetchone()[0] == 1
    # Show me, then the end-of-session redo: judged, but it stays a miss.
    deck.answer(conn, 1, 4, deck.SKIP, today=DAY, now=NOON)
    assert deck.answer(conn, 1, 4, "e7e5", redo=True, today=DAY, now=NOON)["correct"]
    assert tuple(first_review(conn, 1, 4)) == ("again", "shown", 0)
    assert [r["mark"] for r in deck.today_results(conn, DAY)] == ["helped", "missed"]


def test_marks_for_the_done_screens():
    assert [deck.mark(r, s) for r, s in [("good", True), ("hard", True), ("again", True), ("again", False)]] == [
        "found", "good", "helped", "missed"]


def test_answers_from_before_fsrs_are_replayed(conn):
    add_game(conn, 1)
    add_move(conn, 1, 2)
    deck.sync(conn)
    # Answered right once under the old ladder: no FSRS state yet.
    conn.execute("UPDATE cards SET reviews = 1, step = 1, due = '2026-10-09' WHERE ply = 2")
    conn.execute("INSERT INTO card_reviews (game_id, ply, reviewed_at, answer_uci, correct) "
                 "VALUES (1, 2, '2026-10-06T18:00:00Z', 'e7e5', 1)")
    deck.sync(conn)
    fsrs_state, due = conn.execute("SELECT fsrs, due FROM cards WHERE ply = 2").fetchone()
    assert fsrs_state and due == "2026-10-08"
    assert first_review(conn, 1, 2)["rating"] == "good"


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
    conn.execute("UPDATE cards SET due = ?, reviews = 1 WHERE ply = 4", (yesterday.isoformat(),))
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
    assert after["results"] == [{"game_id": 1, "ply": 2, "correct": True, "mark": "found", "san": "g5", "opponent": "opp"}]

    assert client.post("/api/deck/answer", json={"game_id": 9, "ply": 2, "uci": "e7e5"}).status_code == 404
    assert client.post("/api/deck/answer", json={"game_id": 1, "ply": 2, "uci": "nonsense"}).status_code == 422
    assert client.post("/api/deck/hint", json={"game_id": 1, "ply": 2}).json() == {"best_uci": "e7e5", "from": "e7"}
    assert client.post("/api/deck/hint", json={"game_id": 9, "ply": 2}).status_code == 404


def test_skip_counts_as_a_miss(tmp_path):
    path = tmp_path / "chess.db"
    with db.connect(path) as c:
        add_game(c, 1)
        add_move(c, 1, 1, cls="best", is_user=0, color="white", uci="e2e4", best_uci="e2e4")
        add_move(c, 1, 2)
    client = TestClient(api.create_app(path))
    client.get("/api/deck")
    skipped = client.post("/api/deck/answer", json={"game_id": 1, "ply": 2, "uci": "0000"}).json()
    assert not skipped["correct"] and skipped["rating"] == "again" and skipped["quality"] == "shown"
    assert [r["correct"] for r in client.get("/api/deck").json()["results"]] == [False]


def test_game_plies_lists_positions_before_they_are_cards(conn):
    add_game(conn, 1)
    add_move(conn, 1, 2)                              # will be a card
    add_move(conn, 1, 4, cls="mistake", second=-20)   # no single better move
    assert deck.game_plies(conn, 1) == [2]
    deck.sync(conn)
    assert deck.game_plies(conn, 1) == [2]


def test_answer_from_game_review_adds_the_card_first(conn):
    # Game review asks before Finish review has synced the deck; the answer still counts.
    add_game(conn, 1)
    add_move(conn, 1, 2)
    res = deck.answer(conn, 1, 2, "e7e5", today=DAY, now=NOON)
    assert res["correct"] and res["rating"] == "good" and res["due"] == "2026-10-08"
    assert conn.execute("SELECT reviews FROM cards WHERE game_id = 1 AND ply = 2").fetchone()[0] == 1
    with pytest.raises(KeyError):
        deck.answer(conn, 1, 4, "e7e5", today=DAY, now=NOON)


@pytest.mark.skipif(not __import__("shutil").which("stockfish"), reason="stockfish not installed")
def test_judge_accepts_moves_close_to_the_best(monkeypatch):
    monkeypatch.undo()  # the real judge, with Stockfish
    after_e4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
    assert deck.judge(after_e4, "e7e5", "e7e5", 30) == "best"
    assert deck.judge(after_e4, "c7c5", "e7e5", 30) in ("excellent", "good")  # the Sicilian is fine
    assert deck.judge(after_e4, "g7g5", "e7e5", 30) == "wrong"
    assert deck.judge(after_e4, deck.SKIP, "e7e5", 30) == "shown"
    fools = "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2"
    assert deck.judge(fools, "d8h4", "e5e4", 0) == "best"  # any mate counts


def test_a_quick_clean_find_is_easy(conn):
    add_game(conn, 1)
    for ply in (2, 4, 6):
        add_move(conn, 1, ply)
    deck.sync(conn)
    quick = deck.answer(conn, 1, 2, "e7e5", seconds=6, today=DAY, now=NOON)
    assert quick["rating"] == "easy"
    # FSRS: Easy on a new card is about 8 days (fuzzed a little, as in Anki)
    assert 6 <= (date.fromisoformat(quick["due"]) - DAY).days <= 10
    slow = deck.answer(conn, 1, 4, "e7e5", seconds=40, today=DAY, now=NOON)
    assert slow["rating"] == "good"
    hinted = deck.answer(conn, 1, 6, "e7e5", seconds=3, hinted=True, today=DAY, now=NOON)
    assert hinted["rating"] == "again"
    assert deck.mark("easy", True) == "found"
