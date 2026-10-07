from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from knightly import api, db

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


def test_accounts(client, tmp_path):
    assert client.get("/api/accounts").json() == []
    with db.connect(tmp_path / "chess.db") as conn:
        db.add_account(conn, "chesscom", "gghansen")
    assert client.get("/api/accounts").json() == [{"source": "chesscom", "handle": "gghansen"}]


@pytest.fixture
def system(monkeypatch):
    """Stand-ins for launchd, the Keychain and Stockfish, so tests never touch the real Mac."""
    calls = {"install": None, "uninstall": 0, "run_now": 0, "spawned": None}
    state = {"schedule": None}

    def install(db_path, hour=6, minute=0, log=print):
        calls["install"] = (hour, minute)
        state["schedule"] = {"hour": hour, "minute": minute, "loaded": True}

    def uninstall(log=print):
        calls["uninstall"] += 1
        state["schedule"] = None

    monkeypatch.setattr(api.schedule, "install", install)
    monkeypatch.setattr(api.schedule, "uninstall", uninstall)
    monkeypatch.setattr(api.schedule, "current", lambda: state["schedule"])
    monkeypatch.setattr(api.schedule, "run_now", lambda log=print: calls.__setitem__("run_now", calls["run_now"] + 1))
    monkeypatch.setattr(api.subprocess, "Popen", lambda args, **kw: calls.__setitem__("spawned", args))
    monkeypatch.setattr(api, "lichess_token_saved", lambda: True)
    monkeypatch.setattr(api, "engine_name", lambda: "Stockfish 19")
    return calls


def test_settings_snapshot(client, system):
    s = client.get("/api/settings").json()
    assert s["depth"] == 18 and s["engine"] == "Stockfish 19" and s["lichess_token"] is True
    assert s["schedule"] is None and s["running"] is False and s["last_run"] is None
    assert s["database"]["games"] == 6 and s["database"]["analysed"] == 4


def test_add_and_remove_account(client, system):
    assert client.post("/api/accounts", json={"source": "chesscom", "handle": "gghansen"}).status_code == 201
    assert client.post("/api/accounts", json={"source": "chesscom", "handle": "gghansen"}).status_code == 201  # idempotent
    assert client.get("/api/accounts").json() == [{"source": "chesscom", "handle": "gghansen"}]
    assert client.post("/api/accounts", json={"source": "fics", "handle": "x1"}).status_code == 400
    assert client.post("/api/accounts", json={"source": "lichess", "handle": "no spaces"}).status_code == 400
    assert client.delete("/api/accounts/chesscom/gghansen").status_code == 204
    assert client.get("/api/accounts").json() == []


def test_analysis_depth(client, system, tmp_path):
    assert client.put("/api/settings/analysis", json={"depth": 22}).json() == {"depth": 22}
    assert client.get("/api/settings").json()["depth"] == 22
    with db.connect(tmp_path / "chess.db") as conn:
        assert db.analysis_depth(conn) == 22  # what `analyze` and `update` will use
    assert client.put("/api/settings/analysis", json={"depth": 99}).status_code == 422


def test_schedule_and_run_now(client, system):
    # Not installed: "run now" starts a detached `knightly update`.
    assert client.post("/api/update/run").status_code == 202
    assert system["spawned"][-3:] == ["update", "--workers", "3"] and system["run_now"] == 0

    assert client.put("/api/settings/schedule", json={"enabled": True, "hour": 7, "minute": 30}).json() == {
        "hour": 7, "minute": 30, "loaded": True}
    assert system["install"] == (7, 30)
    # Installed: "run now" goes through launchd instead.
    client.post("/api/update/run")
    assert system["run_now"] == 1

    assert client.put("/api/settings/schedule", json={"enabled": False}).json() is None
    assert system["uninstall"] == 1
    assert client.put("/api/settings/schedule", json={"enabled": True, "hour": 24}).status_code == 422


def test_settings_shows_the_live_run(client, system, tmp_path):
    with db.connect(tmp_path / "chess.db") as conn:
        conn.execute("""INSERT INTO runs (status, trigger, errors, progress, finished_at)
                        VALUES ('partial', 'schedule', '["backup: disk full"]',
                                '{"plan": ["backup"], "current": null, "detail": null,
                                  "done": [{"key": "backup", "summary": null, "error": "disk full"}]}',
                                strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))""")
        conn.execute("""INSERT INTO runs (status, trigger, progress) VALUES ('running', 'manual',
                        '{"plan": ["analyze", "backup"], "current": "analyze",
                          "detail": "1 of 3 games", "done": []}')""")
    s = client.get("/api/settings").json()
    assert s["running"] is True
    assert s["current_run"]["progress"]["detail"] == "1 of 3 games"
    assert s["last_run"]["errors"] == ["backup: disk full"]
    assert s["last_run"]["progress"]["done"][0]["error"] == "disk full"


def test_engine_lines_are_computed_once_then_cached(client, tmp_path, monkeypatch):
    import chess
    import chess.engine

    calls = []

    class FakeEngine:
        def __init__(self, depth, engine_path=None):
            calls.append(depth)

        def __enter__(self):
            return lambda board: (chess.engine.PovScore(chess.engine.Cp(30), chess.WHITE),
                                  [next(iter(board.legal_moves))])

        def __exit__(self, *exc):
            pass

    monkeypatch.setattr(api.lines, "Engine", FakeEngine)
    with db.connect(tmp_path / "chess.db") as conn:
        conn.execute("UPDATE moves SET fen_before = ?, uci = 'e2e4' WHERE game_id = 2 AND ply = 1",
                     (chess.STARTING_FEN,))
    first = client.get("/api/games/2/lines/1").json()
    assert set(first) == {"best", "why"} and first["why"]["start_fen"].split()[1] == "b"
    assert client.get("/api/games/2/lines/1").json() == first
    assert calls == [18]  # second request came from the cache
    with db.connect(tmp_path / "chess.db") as conn:  # a line cached by an older lines.py...
        conn.execute("""UPDATE engine_lines SET data = json_set(data, '$.best.v', 1)""")
    client.get("/api/games/2/lines/1")
    assert calls == [18, 18]  # ...is recomputed
    assert client.get("/api/games/2/lines/99").status_code == 404


def test_finish_review(client):
    assert client.get("/api/games/1").json()["reviewed_at"] is None
    r = client.post("/api/games/1/review")
    assert r.status_code == 200
    reviewed = r.json()["reviewed_at"]
    g = client.get("/api/games/1").json()
    assert g["reviewed_at"] == reviewed
    assert [x["reviewed_at"] for x in client.get("/api/games").json()["games"] if x["id"] == 1] == [reviewed]
    assert client.post("/api/games/1/review").status_code == 200  # finishing again is fine
    assert client.post("/api/games/999/review").status_code == 404


def test_home(client):
    h = client.get("/api/home").json()
    ids = [u["id"] for u in h["units"]]
    assert sorted(ids) == ["blunders", "comebacks", "conversion", "punish"]
    blunders = next(u for u in h["units"] if u["id"] == "blunders")
    # Games 1-3 and 6 are analysed: 1, 0, 2 and 0 blunders; 3 of 4 are under 1.5.
    assert blunders["check"] == {"size": 10, "games": 4, "hits": 3, "value": 0.75}
    assert blunders["done"] is False  # needs a full unit check of 10 games
    # Today's game: unreviewed, analysed, in the last 3 days, and with a blunder (Unit 1's kind)
    # if Unit 1 is blunders; newest first otherwise.
    assert h["today"]["game"]["id"] in (1, 2, 3)
    assert h["today"]["reviewed_today"] == 0
    # Reviewing game 1, the newest, leaves nothing newer to review.
    client.post("/api/games/1/review")
    after = client.get("/api/home").json()["today"]
    assert after["reviewed_today"] == 1
    assert after["game"] is None and after["new_games"] == 0


def test_games_quick_filters(client):
    page = client.get("/api/games").json()
    # Rated games 1-4 and 6; game 6 is 40 days old. Analysed and unreviewed in the last week: 1, 2, 3.
    assert page["counts"] == {"all": 5, "to_review": 3, "wins": 2, "losses": 2, "blunders": 2, "thrown": 1}
    client.post("/api/games/2/review")
    to_review = client.get("/api/games?to_review=true").json()
    assert [g["id"] for g in to_review["games"]] == [1, 3]
    assert to_review["counts"]["to_review"] == 2 and to_review["total"] == 2
    # Counts follow search and the popover filters, not the quick filter itself.
    assert client.get("/api/games?result=win").json()["counts"]["all"] == 5
    assert client.get("/api/games?color=white").json()["counts"]["all"] == 5


def test_patterns_endpoint(client, tmp_path):
    # Game 1's blunder (ply 3) is tagged on the first request; with no stored position
    # details to go on in this fixture it waits for the engine pass.
    p = client.get("/api/patterns?range=30d").json()
    assert p["range"] == "30d"
    assert p["pending"] + sum(x["total"] for x in p["patterns"]) >= 1
    with db.connect(tmp_path / "chess.db") as conn:
        conn.execute("UPDATE moves SET pattern = 'fork' WHERE game_id = 1 AND ply = 3")
    forks = next(x for x in client.get("/api/patterns?range=30d").json()["patterns"] if x["pattern"] == "fork")
    assert forks["blunder"] == 1 and forks["total"] >= 1
