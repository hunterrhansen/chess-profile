from datetime import date

from fastapi.testclient import TestClient

from knightly import api, db, puzzles

HEADER = "PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags\n"
FORK = "r3k3/8/8/1N6/8/8/8/4K3 b - - 0 1"


def write_csv(path, rows):
    path.write_text(HEADER + "".join(rows))
    return path


def row(pid, rating=1200, popularity=95, plays=1000, themes="fork short"):
    return f"{pid},{FORK},e8d8 b5c7,{rating},75,{popularity},{plays},{themes},https://lichess.org/x,\n"


def test_import_keeps_only_good_puzzles_in_our_themes(tmp_path):
    conn = db.connect(tmp_path / "chess.db")
    f = write_csv(tmp_path / "p.csv", [
        row("aaaaa"),
        row("bbbbb", popularity=10),            # disliked
        row("ccccc", plays=20),                 # hardly played
        row("ddddd", rating=2900),              # out of range
        row("eeeee", themes="endgame quiet"),   # not a theme we tag
    ])
    kept = puzzles.import_file(conn, f, log=lambda *a: None)
    assert kept["fork"] == 1
    assert [r[0] for r in conn.execute("SELECT puzzle_id FROM lichess_puzzles")] == ["aaaaa"]


def test_api_serves_and_records_puzzles(tmp_path):
    path = tmp_path / "chess.db"
    with db.connect(path) as conn:
        puzzles.import_file(conn, write_csv(tmp_path / "p.csv", [row("aaaaa"), row("bbbbb")]),
                            log=lambda *a: None)
    client = TestClient(api.create_app(path))
    first = client.get("/api/puzzles/next?theme=fork").json()
    assert first["available"] and first["done_today"] == 0
    assert first["puzzle"]["moves"] == ["e8d8", "b5c7"]
    done = client.post("/api/puzzles/answer", json={"id": first["puzzle"]["id"], "correct": True}).json()
    assert done["done_today"] == 1
    second = client.get("/api/puzzles/next?theme=fork").json()["puzzle"]
    assert second["id"] != first["puzzle"]["id"]  # a puzzle tried here isn't served again
    assert client.get("/api/puzzles/next?theme=nonsense").status_code == 400
    assert client.post("/api/puzzles/answer", json={"id": "zzzzz", "correct": True}).status_code == 404
    with db.connect(path) as conn:
        assert puzzles.done_today(conn, date.today()) == 1
