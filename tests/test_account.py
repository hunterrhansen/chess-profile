"""Phase 5: your data (download it, delete it), per-user limits, and the admin page."""
import csv
import io
import zipfile
from datetime import date

import pytest
from fastapi.testclient import TestClient

from knightly import api, db, jobs, limits, users
from test_users import as_user, clerk, seed  # noqa: F401  (clerk is a fixture)


@pytest.fixture
def two(db_url, clerk):  # noqa: F811
    seed(db_url, "user_alice", 100, "alice_handle", "opp_of_alice")
    seed(db_url, "user_bob", 200, "bob_handle", "opp_of_bob")
    return TestClient(api.create_app(db_url))


def test_download_holds_your_data_and_nobody_elses(two):
    response = two.get("/api/export", headers=as_user("user_alice"))
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert "knightly-export-" in response.headers["content-disposition"]
    zf = zipfile.ZipFile(io.BytesIO(response.content))
    names = set(zf.namelist())
    assert {"README.txt", "games.pgn", "games.csv", "moves.csv", "accounts.csv", "game_reviews.csv"} <= names
    assert "engine_lines.csv" not in names and "jobs.csv" not in names
    everything = b"".join(zf.read(n) for n in names)
    assert b"alice_handle" in everything and b"opp_of_alice" in everything
    assert b"bob" not in everything
    games = list(csv.DictReader(io.TextIOWrapper(zf.open("games.csv"))))
    assert sorted(int(g["id"]) for g in games) == [100, 101, 102]
    assert "user_id" not in games[0]


def test_deleting_your_account_removes_everything_of_yours(two, db_url):
    assert two.delete("/api/account", headers=as_user("user_alice")).status_code == 204
    owner = db.connect(db_url)
    assert users.find(owner, "user_alice") is None
    for table in ("games", "moves", "accounts", "game_reviews"):
        owners = {r[0] for r in owner.execute(f"SELECT DISTINCT user_id FROM {table}")}
        assert owners == {users.find(owner, "user_bob")}, table
    assert two.get("/api/accounts", headers=as_user("user_bob")).json() == [
        {"source": "chesscom", "handle": "bob_handle"}]


def test_settings_show_your_data_not_the_servers(two):
    data = two.get("/api/settings", headers=as_user("user_alice")).json()
    assert data["your_data"]["games"] == 3 and data["your_data"]["analysed"] == 2
    assert data["your_data"]["approx_bytes"] == 3 * jobs.GAME_BYTES + 2 * jobs.ANALYSED_BYTES
    assert data["database"] is None and data["backups"] is None  # everyone's, and where it lives
    assert data["limits"]["max_accounts"] == limits.MAX_ACCOUNTS


def test_without_sign_in_there_is_no_account_to_delete(db_url):
    client = TestClient(api.create_app(db_url))
    assert client.delete("/api/account").status_code == 400
    assert client.get("/api/me").json()["admin"] is True  # your own Mac: you're the admin


def test_the_admin_page_is_for_admins(two, db_url, monkeypatch):
    assert two.get("/api/me", headers=as_user("user_alice")).json()["admin"] is False
    assert two.get("/api/admin", headers=as_user("user_alice")).status_code == 403

    monkeypatch.setenv("KNIGHTLY_ADMINS", "user_alice")
    client = TestClient(api.create_app(db_url))
    assert client.get("/api/me", headers=as_user("user_alice")).json()["admin"] is True
    owner = db.connect(db_url)
    bob = users.find(owner, "user_bob")
    jobs.enqueue(owner, "update", user_id=bob)
    owner.execute("UPDATE jobs SET status = 'failed', error = 'network down'")
    page = client.get("/api/admin", headers=as_user("user_alice")).json()
    assert [u["clerk_id"] for u in page["users"] if u["clerk_id"] != "local"] == ["user_alice", "user_bob"]
    by_id = {u["clerk_id"]: u for u in page["users"]}
    assert (by_id["user_bob"]["games"], by_id["user_bob"]["analysed"]) == (3, 2)
    assert [(j["clerk_id"], j["error"]) for j in page["failed"]] == [("user_bob", "network down")]
    assert page["database_bytes"] > 0

    job_id = page["failed"][0]["id"]
    assert client.post(f"/api/admin/jobs/{job_id}/retry", headers=as_user("user_alice")).status_code == 200
    assert owner.execute("SELECT status, attempts FROM jobs").fetchone() == ("queued", 0)
    assert client.post(f"/api/admin/jobs/{job_id}/retry", headers=as_user("user_alice")).status_code == 404
    assert client.post(f"/api/admin/jobs/{job_id}/retry", headers=as_user("user_bob")).status_code == 403


def test_a_few_accounts_each(db_url):
    client = TestClient(api.create_app(db_url))
    for i in range(limits.MAX_ACCOUNTS):
        assert client.post("/api/accounts", json={"source": "lichess", "handle": f"me_{i}"}).status_code == 201
    assert client.post("/api/accounts", json={"source": "lichess", "handle": "me_0"}).status_code == 201  # again: fine
    refused = client.post("/api/accounts", json={"source": "lichess", "handle": "one_more"})
    assert refused.status_code == 400 and "up to" in refused.json()["detail"]


def test_engine_routes_share_a_rate_limit(db_url, monkeypatch):
    monkeypatch.setattr(limits, "ENGINE_PER_MINUTE", 2)
    client = TestClient(api.create_app(db_url))
    assert [client.get("/api/games/999/lines/1").status_code for _ in range(2)] == [404, 404]
    assert client.post("/api/play/move", json={"fen": "8/8/8/8/8/8/8/8 w - - 0 1"}).status_code == 429


def test_rate_limit_window():
    limit = limits.RateLimit(2)
    assert [limit.allow("a", now=t) for t in (0, 1, 2)] == [True, True, False]
    assert limit.allow("b", now=2)  # per key
    assert limit.allow("a", now=60.5)  # the first call has left the window


def test_server_limits(monkeypatch):
    monkeypatch.setattr(limits.config, "on_mac", lambda: False)
    assert limits.history_since(date(2026, 10, 8)) == "2024-10"
    assert limits.backfill_room(990) == 10 and limits.backfill_room(1500) == 0
    monkeypatch.setenv("KNIGHTLY_HISTORY_MONTHS", "0")
    monkeypatch.setenv("KNIGHTLY_MAX_ANALYSED", "0")
    assert limits.history_since() is None and limits.backfill_room(10**6) is None
    monkeypatch.setattr(limits.config, "on_mac", lambda: True)
    monkeypatch.delenv("KNIGHTLY_HISTORY_MONTHS")
    assert limits.history_since() is None  # your own Mac keeps everything
