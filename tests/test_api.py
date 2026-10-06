from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from chessprofile import api, db

NOW = datetime.now(timezone.utc)


def days_ago(n: float) -> str:
    return (NOW - timedelta(days=n)).strftime("%Y-%m-%dT%H:%M:%SZ")


def add_game(conn, gid, *, played_at, outcome, rated=1, rating=900, opening="Pirc Defense",
             termination="me won by resignation", moves=None, blunders=None):
    """Insert a game, plus engine analysis when `moves` is given as
    [(is_user, win_pct_after, classification), ...] for plies 1, 2, ..."""
    conn.execute(
        """INSERT INTO games (id, source, source_id, played_at, speed, rated, user_color,
           user_outcome, user_rating, opponent, opponent_rating, eco, opening, termination,
           ply_count, pgn, url)
           VALUES (?, 'chesscom', ?, ?, 'rapid', ?, 'white', ?, ?, 'opp', 880, 'B07', ?, ?, ?, '', ?)""",
        (gid, str(gid), played_at, rated, outcome, rating, opening, termination,
         len(moves or []), f"https://example.com/{gid}"),
    )
    if moves is None:
        return
    conn.execute(
        """INSERT INTO game_analysis (game_id, engine, depth, user_accuracy, user_blunders,
           user_mistakes, user_inaccuracies) VALUES (?, 'test', 1, 80, ?, 0, 0)""",
        (gid, blunders if blunders is not None else sum(1 for u, _, c in moves if u and c == "blunder")),
    )
    before = 50  # mover's win% before each move: the other side's win% after the last one
    for ply, (is_user, win_pct, cls) in enumerate(moves, start=1):
        conn.execute(
            """INSERT INTO moves (game_id, ply, move_number, color, is_user, phase, fen_before,
               san, uci, win_pct_before, win_pct_after, classification, eval_after)
               VALUES (?, ?, ?, ?, ?, 'opening', '', 'e4', 'e2e4', ?, ?, ?, 50)""",
            (gid, ply, (ply + 1) // 2, "white" if ply % 2 else "black", is_user, before, win_pct, cls),
        )
        before = 100 - win_pct


@pytest.fixture
def client(tmp_path):
    path = tmp_path / "chess.db"
    with db.connect(path) as conn:
        # 1: reached a winning position, then lost: a thrown win.
        add_game(conn, 1, played_at=days_ago(1), outcome="loss",
                 moves=[(1, 85, "best"), (0, 15, "good"), (1, 10, "blunder")])
        # 2: opponent blundered and was punished; won.
        add_game(conn, 2, played_at=days_ago(2), outcome="win",
                 moves=[(1, 50, "good"), (0, 10, "blunder"), (1, 90, "best")])
        # 3: opponent blundered, user missed it; was lost, then came back to draw.
        add_game(conn, 3, played_at=days_ago(3), outcome="draw", termination="Game drawn by repetition",
                 moves=[(1, 15, "mistake"), (0, 40, "blunder"), (1, 18, "mistake")])
        # 4: not analysed.
        add_game(conn, 4, played_at=days_ago(4), outcome="win", opening="London System")
        # 5: unrated, excluded by default.
        add_game(conn, 5, played_at=days_ago(5), outcome="win", rated=0)
        # 6: older than 30 days, for the previous-period comparison.
        add_game(conn, 6, played_at=days_ago(40), outcome="loss", rating=850,
                 moves=[(1, 50, "good")])
    return TestClient(api.create_app(path))


def test_ended_by():
    assert api.ended_by("gghansen won by checkmate") == "Checkmate"
    assert api.ended_by("Kylawot won on time") == "Time"
    assert api.ended_by("Game drawn by timeout vs insufficient material") == "Time vs material"
    assert api.ended_by("Game drawn by insufficient material") == "Material"
    assert api.ended_by(None) is None


def test_overview_kpis(client):
    o = client.get("/api/overview?range=30d").json()
    k = o["kpis"]
    assert o["games_played"] == 4  # unrated game 5 left out
    assert o["games_analysed"] == 3
    assert o["rating"] == {"current": 900, "change": 50, "best": 900}
    assert k["winning_games"] == 2 and k["thrown"] == 1 and k["conversion"] == 0.5
    assert k["opp_blunders"] == 2 and k["punish_rate"] == 0.5
    assert k["lost_games"] == 2 and k["comeback_rate"] == 0.5  # game 3 drew, game 1 lost
    # Game 1's blunder, plus both of game 3's 20+ point drops even though they're labelled
    # "mistake": blunders are counted by size, not label.
    assert k["blunders_per_game"] == 1
    assert o["recent_games"][0]["id"] == 1


def test_previous_period_needs_enough_games(client):
    prev = client.get("/api/overview?range=30d").json()["previous_kpis"]
    assert prev["analysed"] == 1
    assert prev["blunders_per_game"] is None  # one game is below MIN_SAMPLE
    assert client.get("/api/overview?range=all").json()["previous_kpis"] is None


def test_kpi_links_return_the_games_behind_them(client):
    def ids(query):
        return [g["id"] for g in client.get(f"/api/games?{query}").json()["games"]]

    assert ids("kpi=thrown") == [1]
    assert ids("kpi=unpunished") == [3]
    assert ids("kpi=comebacks") == [3]
    assert ids("kpi=blunders") == [1, 3]
    assert client.get("/api/games?kpi=bogus").status_code == 400


def test_games_filters(client):
    def total(query=""):
        return client.get(f"/api/games?{query}").json()["total"]

    assert total() == 5
    assert total("unrated=true") == 6
    assert total("q=london") == 1
    assert total("result=win") == 2
    assert total("range=30d") == 4
    assert total("analysed=true") == 4
    g = client.get("/api/games?q=london").json()["games"][0]
    assert g["ended_by"] == "Resigned" and g["analysed"] is False


def test_game_detail(client):
    g = client.get("/api/games/2").json()
    assert g["id"] == 2 and g["outcome"] == "win"
    assert [m["classification"] for m in g["plies"]] == ["good", "blunder", "best"]
    assert g["plies"][1]["win_pct_before"] == 50 and g["plies"][1]["win_pct_after"] == 10
    unanalysed = client.get("/api/games/4").json()
    assert unanalysed["plies"] == [] and unanalysed["analysed"] is False
    assert client.get("/api/games/999").status_code == 404
