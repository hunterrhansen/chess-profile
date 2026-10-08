import shutil
import subprocess

import chess.engine
import pytest
from fastapi.testclient import TestClient

from knightly import api, bench, cli, config, db, schedule

from test_analyze import SCHOLARS_MATE


def test_mode_defaults_to_the_platform(monkeypatch):
    monkeypatch.delenv("KNIGHTLY_MODE", raising=False)
    monkeypatch.setattr(config.sys, "platform", "darwin")
    assert config.mode() == "mac" and config.on_mac()
    monkeypatch.setattr(config.sys, "platform", "linux")
    assert config.mode() == "server" and not config.on_mac()


def test_mode_from_the_environment(monkeypatch):
    monkeypatch.setattr(config.sys, "platform", "darwin")
    monkeypatch.setenv("KNIGHTLY_MODE", "server")
    assert not config.on_mac()
    monkeypatch.setenv("KNIGHTLY_MODE", "cloud")
    with pytest.raises(SystemExit, match="KNIGHTLY_MODE"):
        config.mode()


@pytest.fixture
def server(monkeypatch):
    """Server mode, with any call to a macOS tool (security, launchctl, osascript) failing the test."""
    monkeypatch.setenv("KNIGHTLY_MODE", "server")
    monkeypatch.delenv("LICHESS_TOKEN", raising=False)

    def no_mac_tools(args, **kw):
        raise AssertionError(f"ran {args[0]} in server mode")

    monkeypatch.setattr(subprocess, "run", no_mac_tools)


def test_server_mode_leaves_the_mac_alone(server):
    assert cli.keychain_token() is None
    assert api.lichess_token_saved() is False
    assert schedule.current() is None
    for action in (lambda: schedule.install("chess.db"), schedule.uninstall, schedule.run_now):
        with pytest.raises(SystemExit, match="server mode"):
            action()


def test_server_mode_settings_and_run_now(server, monkeypatch, tmp_path):
    db.connect(tmp_path / "chess.db").close()
    spawned = {}
    monkeypatch.setattr(api.subprocess, "Popen", lambda args, **kw: spawned.update(args=args, kw=kw))
    monkeypatch.setattr(api, "engine_name", lambda: None)
    client = TestClient(api.create_app(tmp_path / "chess.db"))

    s = client.get("/api/settings").json()
    assert s["schedule"] is None and s["schedule_available"] is False and s["lichess_token"] is False
    assert client.put("/api/settings/schedule", json={"enabled": True, "hour": 6, "minute": 0}).status_code == 400

    # Run now still starts `knightly update`, logging to the server's own output, not a Mac log file.
    assert client.post("/api/update/run").status_code == 202
    assert spawned["args"][-3:] == ["update", "--workers", "3"] and "stdout" not in spawned["kw"]


@pytest.mark.skipif(not shutil.which("stockfish"), reason="stockfish not installed")
def test_bench_compares_limits(tmp_path):
    conn = db.connect(tmp_path / "chess.db")
    conn.execute("INSERT INTO games (source, source_id, pgn, user_color, variant, played_at) "
                 "VALUES ('otb', 'x', ?, 'white', 'standard', '2026-01-01')", (SCHOLARS_MATE,))
    results = bench.run(conn, [chess.engine.Limit(depth=6), chess.engine.Limit(nodes=20_000)],
                        games=3, log=lambda _: None)
    assert [r["setting"] for r in results] == ["depth 6", "0.02M nodes"]
    assert results[0]["label_agreement"] is None
    assert 0 <= results[1]["label_agreement"] <= 1 and 0 <= results[1]["best_agreement"] <= 1
    assert all(r["seconds_per_game"] > 0 for r in results)
