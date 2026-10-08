"""What a deployed server needs: runtime config, a health check, monitoring, backups."""
import base64

from fastapi.testclient import TestClient

from knightly import api, cli, db, jobs, monitoring, update

PUBLISHABLE = "pk_test_" + base64.b64encode(b"test-knightly.clerk.accounts.dev$").decode().rstrip("=")


def test_the_web_app_reads_its_sign_in_key_at_runtime(db_url, monkeypatch):
    monkeypatch.delenv("KNIGHTLY_CONTACT", raising=False)
    assert TestClient(api.create_app(db_url)).get("/api/config").json() == {"clerk_publishable_key": None, "contact": None}
    monkeypatch.delenv("KNIGHTLY_AUTH")
    monkeypatch.setenv("KNIGHTLY_CONTACT", "me@example.com")
    monkeypatch.setenv("CLERK_PUBLISHABLE_KEY", PUBLISHABLE)
    client = TestClient(api.create_app(db_url))
    assert client.get("/api/config").json() == {"clerk_publishable_key": PUBLISHABLE,
                                                "contact": "me@example.com"}  # no token needed


def test_health(db_url):
    client = TestClient(api.create_app(db_url))
    assert client.get("/api/health").json() == {"ok": True}


def test_monitoring_is_off_unless_configured(monkeypatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    monkeypatch.delenv("KNIGHTLY_HEARTBEAT_URL", raising=False)
    assert monitoring.init("web") is False and monitoring.heartbeat() is False
    pinged = []
    monkeypatch.setenv("KNIGHTLY_HEARTBEAT_URL", "https://uptime.example/ping/abc")
    monkeypatch.setattr(monitoring.urllib.request, "urlopen", lambda url, timeout: pinged.append(url) or open(__file__))
    assert monitoring.heartbeat() is True and pinged == ["https://uptime.example/ping/abc"]

    def down(url, timeout):
        raise OSError("no route")
    monkeypatch.setattr(monitoring.urllib.request, "urlopen", down)
    assert monitoring.heartbeat() is False  # skipped, never raised


def test_the_worker_pings_and_reports_failed_jobs(db_url, monkeypatch):
    beats, reported = [], []
    monkeypatch.setattr(monitoring, "heartbeat", lambda: beats.append(1))
    monkeypatch.setattr(monitoring, "capture", reported.append)
    monkeypatch.setattr(update, "run", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("Chess.com is down")))
    with db.connect(db_url) as conn:
        jobs.enqueue(conn, "update", user_id=1)
    jobs.work(db_url, scheduler=False, log=lambda _: None, once=True)
    assert beats == [1] and [str(e) for e in reported] == ["Chess.com is down"]


def test_backup_command(db_url, tmp_path):
    cli.main(["--db", db_url, "backup", "--dir", str(tmp_path / "dumps"), "--keep", "2"])
    dumps = list((tmp_path / "dumps").glob(update.BACKUP_GLOB))
    assert len(dumps) == 1 and dumps[0].stat().st_size > 0
