"""Each test that takes `db_url` gets its own empty, migrated Postgres database, copied from a
template made once per run. Point $KNIGHTLY_TEST_DATABASE_URL at a server you can create
databases on (default: the local one, postgresql:///postgres)."""
import os
import uuid

import psycopg
import pytest

from knightly import db

ADMIN_URL = os.environ.get("KNIGHTLY_TEST_DATABASE_URL", "postgresql:///postgres")
TEMPLATE = "knightly_test_template"


def _url(name: str) -> str:
    return psycopg.conninfo.make_conninfo(ADMIN_URL, dbname=name)


def _admin(sql: str) -> None:
    with psycopg.connect(ADMIN_URL, autocommit=True) as conn:
        conn.execute(sql)


@pytest.fixture(scope="session")
def template_db():
    _admin(f"DROP DATABASE IF EXISTS {TEMPLATE} WITH (FORCE)")
    _admin(f"CREATE DATABASE {TEMPLATE}")
    db.connect(_url(TEMPLATE)).close()  # migrate it once
    yield TEMPLATE
    _admin(f"DROP DATABASE IF EXISTS {TEMPLATE} WITH (FORCE)")


@pytest.fixture
def db_url(template_db):
    name = f"knightly_test_{uuid.uuid4().hex[:12]}"
    _admin(f"CREATE DATABASE {name} TEMPLATE {template_db}")
    yield _url(name)
    _admin(f"DROP DATABASE IF EXISTS {name} WITH (FORCE)")


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    """Backups and sounds go to the test's own folder."""
    monkeypatch.setenv("KNIGHTLY_DATA_DIR", str(tmp_path))
    return tmp_path
