import random

import chess
import chess.engine
import pytest
from fastapi.testclient import TestClient

from knightly import api, db, play

FOOLS_MATE = ["f2f3", "e7e5", "g2g4", "d8h4"]


def test_weaker_bots_are_more_random():
    assert play.temperature(250) > play.temperature(800) > play.temperature(1300)


def test_pick_weak_prefers_good_moves_at_higher_ratings():
    good, bad = chess.Move.from_uci("e2e4"), chess.Move.from_uci("g2g4")
    infos = [{"pv": [good], "score": chess.engine.PovScore(chess.engine.Cp(50), chess.WHITE)},
             {"pv": [bad], "score": chess.engine.PovScore(chess.engine.Cp(-400), chess.WHITE)}]
    rng = random.Random(0)
    picks = {elo: sum(play.pick_weak(infos, chess.WHITE, elo, rng) == good for _ in range(500))
             for elo in (250, 1300)}
    assert picks[1300] == 500
    assert 300 < picks[250] < 500


def test_game_row_checkmate_from_users_side():
    row = play.game_row(FOOLS_MATE, "black", "me", "Stockfish 250", 250)
    assert (row["result"], row["user_outcome"], row["opponent"]) == ("0-1", "win", "Stockfish 250")
    assert row["termination"] == "me won by checkmate"
    assert (row["source"], row["rated"], row["white_elo"]) == ("bot", 0, 250)


def test_game_row_resignation_and_unfinished():
    row = play.game_row(["e2e4"], "white", "me", "bot", 800, resigned="white")
    assert (row["result"], row["user_outcome"]) == ("0-1", "loss")
    assert api.ended_by(row["termination"]) == "Resigned"
    with pytest.raises(ValueError):
        play.game_row(["e2e4"], "white", "me", "bot", 800)


def test_save_played_game(tmp_path):
    path = tmp_path / "chess.db"
    with db.connect(path) as conn:
        db.add_account(conn, "chesscom", "me")
    client = TestClient(api.create_app(path))
    res = client.post("/api/play/games", json={"moves": FOOLS_MATE, "color": "black", "elo": 250,
                                               "bot": "Stockfish 250"})
    assert res.status_code == 201
    game = client.get(f"/api/games/{res.json()['id']}").json()
    assert (game["outcome"], game["ended_by"], game["black"], game["rated"]) == ("win", "Checkmate", "me", False)
    # Unrated, so it stays out of the overview and the default games list.
    assert client.get("/api/games").json()["total"] == 0
    assert client.post("/api/play/games", json={"moves": ["e2e5"], "color": "white", "elo": 250,
                                                "bot": "x", "resigned": "white"}).status_code == 400
