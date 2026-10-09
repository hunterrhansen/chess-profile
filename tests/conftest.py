"""Each test that takes `db_url` gets its own empty, migrated Postgres database, copied from a
template made once per run. Point $KNIGHTLY_TEST_DATABASE_URL at a server you can create
databases on (default: the local one, postgresql:///postgres).

The template has the "local" user (id 1), and a test's own connections act for it by default
(app.user_id=1), so fixtures can insert rows as they did before users. The app under test
signs in as that user too, unless a test sets up Clerk (test_users.py)."""
import os
import uuid

import psycopg
import pytest

from knightly import db, users

ADMIN_URL = os.environ.get("KNIGHTLY_TEST_DATABASE_URL", "postgresql:///postgres")
TEMPLATE = "knightly_test_template"
LOCAL_ID = 1


def _url(name: str, **extra) -> str:
    return psycopg.conninfo.make_conninfo(ADMIN_URL, dbname=name, **extra)


def _admin(sql: str) -> None:
    with psycopg.connect(ADMIN_URL, autocommit=True) as conn:
        conn.execute(sql)


@pytest.fixture(scope="session")
def template_db():
    _admin(f"DROP DATABASE IF EXISTS {TEMPLATE} WITH (FORCE)")
    _admin(f"CREATE DATABASE {TEMPLATE}")
    with db.connect(_url(TEMPLATE)) as conn:  # migrate it once
        assert users.ensure(conn, users.LOCAL) == LOCAL_ID
    conn.close()
    yield TEMPLATE
    _admin(f"DROP DATABASE IF EXISTS {TEMPLATE} WITH (FORCE)")


@pytest.fixture
def db_url(template_db):
    name = f"knightly_test_{uuid.uuid4().hex[:12]}"
    _admin(f"CREATE DATABASE {name} TEMPLATE {template_db}")
    yield _url(name, options=f"-c app.user_id={LOCAL_ID}")
    _admin(f"DROP DATABASE IF EXISTS {name} WITH (FORCE)")


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    """Backups and sounds go to the test's own folder, and the app signs in as the local
    user (in server mode too, as on CI)."""
    monkeypatch.setenv("KNIGHTLY_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("KNIGHTLY_AUTH", "local")
    for name in ("CLERK_PUBLISHABLE_KEY", "CLERK_JWT_KEY", "CLERK_WEBHOOK_SECRET", "KNIGHTLY_ALLOWED_ORIGINS",
                 "KNIGHTLY_ALLOW_NATIVE_AUTH"):
        monkeypatch.delenv(name, raising=False)
    return tmp_path
