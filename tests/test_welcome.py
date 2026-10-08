"""The welcome flow's backend: looking an account up, and following its first import."""
import io
import urllib.error

from fastapi.testclient import TestClient

from knightly import api, db, lookup
from test_api import add_game, days_ago


def http_404(url):
    return urllib.error.HTTPError(url, 404, "Not Found", {}, io.BytesIO(b""))


def fake_sites(monkeypatch, missing=()):
    pages = {
        f"{lookup.CHESSCOM}/gghansen": {"username": "gghansen", "url": "https://www.chess.com/member/GGHansen"},
        f"{lookup.CHESSCOM}/gghansen/stats": {
            "chess_rapid": {"last": {"rating": 914}, "record": {"win": 300, "loss": 250, "draw": 20}},
            "chess_daily": {"last": {"rating": 1200}, "record": {"win": 10, "loss": 2, "draw": 1}},
        },
        f"{lookup.CHESSCOM}/gghansen/games/archives": {"archives": [
            "https://api.chess.com/pub/player/gghansen/games/2026/01",
            "https://api.chess.com/pub/player/gghansen/games/2026/10"]},
        f"{lookup.LICHESS}/hunterrhansen": {"username": "HunterRHansen", "createdAt": 1767225600000,
                                            "count": {"rated": 12},
                                            "perfs": {"blitz": {"games": 12, "rating": 1650}}},
    }

    def get_json(url, headers=None):
        if url in missing or url not in pages:
            raise http_404(url)
        return pages[url]

    monkeypatch.setattr(lookup, "get_json", get_json)


def test_looking_up_accounts(monkeypatch):
    fake_sites(monkeypatch)
    assert lookup.account("chesscom", "gghansen") == {
        "source": "chesscom", "handle": "GGHansen", "rating": 914, "rating_kind": "Rapid", "games": 583, "since": "2026-01"}
    assert lookup.account("lichess", "hunterrhansen") == {
        "source": "lichess", "handle": "HunterRHansen", "rating": 1650, "rating_kind": "Blitz", "games": 12, "since": "2026-01"}
    assert lookup.account("chesscom", "nobody") is None


def test_the_lookup_endpoint_says_what_went_wrong(db_url, monkeypatch):
    fake_sites(monkeypatch)
    client = TestClient(api.create_app(db_url))
    assert client.get("/api/lookup?source=chesscom&handle=gghansen").json()["games"] == 583
    nobody = client.get("/api/lookup?source=chesscom&handle=nobody")
    assert nobody.status_code == 404 and nobody.json()["detail"] == "No Chess.com account is called nobody."
    assert client.get("/api/lookup?source=fics&handle=x").status_code == 400
    assert client.get("/api/lookup?source=lichess&handle=no spaces").status_code == 400

    def down(url, headers=None):
        raise urllib.error.URLError("no network")
    monkeypatch.setattr(lookup, "get_json", down)
    assert client.get("/api/lookup?source=lichess&handle=someone").status_code == 502


def test_onboarding_follows_the_first_import(db_url):
    client = TestClient(api.create_app(db_url))
    empty = client.get("/api/onboarding").json()
    assert (empty["accounts"], empty["games"], empty["working"], empty["target"]) == ([], 0, False, 0)

    client.post("/api/accounts", json={"source": "chesscom", "handle": "newcomer"})
    assert client.get("/api/onboarding").json()["working"] is True  # an update is queued

    with db.connect(db_url) as conn:  # what the worker brings in: three games, two analysed
        add_game(conn, 1, played_at=days_ago(2), outcome="loss", moves=[(1, 85, "best"), (0, 15, "good"), (1, 10, "blunder")])
        add_game(conn, 2, played_at=days_ago(1), outcome="win", moves=[(1, 60, "miss"), (0, 40, "good")])
        add_game(conn, 3, played_at=days_ago(0), outcome="draw")
        conn.execute("UPDATE games SET variant = 'standard'")
        conn.execute("UPDATE moves SET best_san = 'Nf3', pattern = 'fork'")
    o = client.get("/api/onboarding").json()
    assert (o["games"], o["analysed"], o["target"]) == (3, 2, 3)
    assert [(f["classification"], f["opponent"]) for f in o["findings"]] == [("miss", "opp"), ("blunder", "opp")]
    assert o["summary"] | {"positions": None} == {"blunders": 1, "mistakes": 0, "misses": 1, "positions": None, "pattern": "fork"}


def test_a_new_account_is_sent_to_welcome_only_while_it_has_no_accounts(db_url):
    client = TestClient(api.create_app(db_url))
    assert client.get("/api/status").json()["accounts"] == []  # the web app redirects to /welcome
    client.post("/api/accounts", json={"source": "lichess", "handle": "someone"})
    assert [a["handle"] for a in client.get("/api/status").json()["accounts"]] == ["someone"]
