"""Integration tests against an isolated, real PostgreSQL database (not SQLite)."""
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql

from nether_data.store import Call, Store


@pytest.fixture(scope="session")
def database():
    dsn = os.environ.get("NETHER_TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("NETHER_TEST_DATABASE_URL must point at an expendable local PostgreSQL instance")
    # Never apply a test schema or truncate a configured Supabase project.
    params = psycopg.conninfo.conninfo_to_dict(dsn)
    if params.get("host") not in {"127.0.0.1", "localhost"}:
        raise RuntimeError("integration tests require a loopback database")
    name = "nether_test_" + uuid4().hex
    with psycopg.connect(dsn, autocommit=True) as admin:
        admin.execute(sql.SQL("create database {} encoding 'UTF8' template template0").format(sql.Identifier(name)))
    test_dsn = psycopg.conninfo.make_conninfo(dsn, dbname=name)
    migration = next((Path(__file__).resolve().parents[3] / "supabase/migrations").glob("*_halloween_wide_tables.sql"))
    with psycopg.connect(test_dsn, autocommit=True) as conn:
        conn.execute(migration.read_text())
    yield test_dsn
    with psycopg.connect(dsn, autocommit=True) as admin:
        admin.execute(sql.SQL("drop database {} with (force)").format(sql.Identifier(name)))


@pytest.fixture
def store(database):
    result = Store(database)
    with result.connect() as conn:
        conn.execute("truncate nether.calls cascade")
    return result


def new_call():
    return Call(uuid4(), "halloween-2026", "meng-po", "zh")


def test_exactly_three_tables_and_rls(store):
    with store.connect() as conn:
        tables = conn.execute("select tablename,rowsecurity from pg_tables where schemaname='nether'").fetchall()
        assert {t["tablename"] for t in tables} == {"calls", "cache", "outbox"}
        assert all(t["rowsecurity"] for t in tables)
        role = "nether_browser_" + uuid4().hex
        # Give a browser-like role table grants to prove RLS itself denies rows.
        conn.execute(sql.SQL("create role {} nologin").format(sql.Identifier(role)))
        try:
            conn.execute(sql.SQL("grant usage on schema nether to {}").format(sql.Identifier(role)))
            conn.execute(sql.SQL("grant select,insert on all tables in schema nether to {}").format(sql.Identifier(role)))
            store.record(new_call(), uuid4(), "conversation_started")
            conn.execute(sql.SQL("set role {}").format(sql.Identifier(role)))
            assert conn.execute("select * from nether.calls").fetchall() == []
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute("insert into nether.calls(id,campaign_id,character_id,locale,mode) values(%s,'x','meng-po','zh','personal')", (uuid4(),))
        finally:
            conn.execute("reset role")
            conn.execute(sql.SQL("drop owned by {}").format(sql.Identifier(role)))
            conn.execute(sql.SQL("drop role {}").format(sql.Identifier(role)))


def test_atomic_call_update_outbox_and_deduplication(store):
    call = new_call()
    key = uuid4()
    assert store.record(call, key, "card_download_created")
    assert not store.record(call, key, "card_download_created")
    with store.connect() as conn:
        row = conn.execute("select * from nether.calls where id=%s", (call.id,)).fetchone()
        assert row["card_save_count"] == row["revision"] == 1
        assert conn.execute("select count(*) as n from nether.outbox").fetchone()["n"] == 1
    # Constraint failure after a call INSERT must roll back the entire transaction.
    with pytest.raises(psycopg.errors.NotNullViolation):
        store.record(new_call(), None, "conversation_started")
    with store.connect() as conn:
        assert conn.execute("select count(*) as n from nether.calls").fetchone()["n"] == 1


def test_call_identity_cannot_be_reassigned(store):
    call = new_call()
    store.record(call, uuid4(), "conversation_started")
    changed = Call(call.id, call.campaign_id, "werewolf", "zh")
    with pytest.raises(ValueError, match="identity"):
        store.record(changed, uuid4(), "conversation_completed")
    with store.connect() as conn:
        assert conn.execute("select count(*) as n from nether.outbox").fetchone()["n"] == 1


def test_cache_model_version_ttl_and_identity_ownership(store):
    call = new_call()
    store.record(call, uuid4(), "conversation_started")
    store.put_cache("identity", str(call.id), 1, "qwen", {"title": "Guest"}, 60, call.id)
    assert store.get_cache("identity", str(call.id), 1, "qwen") == {"title": "Guest"}
    assert store.get_cache("identity", str(call.id), 2, "qwen") is None
    assert store.get_cache("identity", str(call.id), 1, "different-model") is None
    with pytest.raises(ValueError):
        store.put_cache("identity", "bad", 1, "qwen", {}, 86_401, call.id)
    with pytest.raises(psycopg.errors.CheckViolation):
        store.put_cache("identity", "bad", 1, "qwen", {}, 60)
    with store.connect() as conn:
        conn.execute("update nether.cache set updated_at=now()-interval '2 hours',expires_at=now()-interval '1 hour'")
    assert store.get_cache("identity", str(call.id), 1, "qwen") is None


def test_concurrent_workers_claim_disjoint_events(store):
    call = new_call()
    for _ in range(12):
        store.record(call, uuid4(), "connection_error")
    with ThreadPoolExecutor(max_workers=3) as executor:
        batches = list(executor.map(lambda _: store.claim(4), range(3)))
    events = [e for batch in batches for e in batch]
    assert len(events) == len({e["id"] for e in events}) == 12
    assert all(e["attempts"] == 1 for e in events)


def test_expired_lease_is_fenced_and_final_attempt_becomes_dead(store):
    store.record(new_call(), uuid4(), "conversation_started")
    old = store.claim()[0]
    with store.connect() as conn:
        conn.execute("update nether.outbox set locked_until=now()-interval '1 second'")
    new = store.claim()[0]
    assert new["id"] == old["id"] and new["lease_token"] != old["lease_token"]
    assert not store.ack(old) and not store.fail(old)
    assert store.ack(new) and not store.ack(new)
    store.record(new_call(), uuid4(), "conversation_started")
    final = store.claim()[0]
    with store.connect() as conn:
        conn.execute("update nether.outbox set max_attempts=attempts,locked_until=now()-interval '1 second' where id=%s", (final["id"],))
    assert store.claim() == []
    with store.connect() as conn:
        assert conn.execute("select status from nether.outbox where id=%s", (final["id"],)).fetchone()["status"] == "dead"


def test_retry_backoff_and_safe_error(store):
    store.record(new_call(), uuid4(), "conversation_started")
    def broken(*_):
        raise RuntimeError("private story or credential must never be persisted")
    assert store.dispatch(broken) == 0
    assert store.claim() == []  # Backoff prevents a hot retry loop.
    with store.connect() as conn:
        event = conn.execute("select * from nether.outbox").fetchone()
        assert event["last_error"] == "delivery_failed" and event["attempts"] == 1
        conn.execute("update nether.outbox set available_at=now()-interval '1 second'")
    delivered = []
    assert store.dispatch(lambda *args: delivered.append(args)) == 1
    assert len(delivered) == 1


def test_late_events_do_not_regress_completion_and_metrics_are_whitelisted(store):
    call = new_call()
    store.record(call, uuid4(), "conversation_completed")
    store.record(call, uuid4(), "conversation_started")
    store.record(call, uuid4(), "latency", metric="first_audio_ms", value=123)
    with pytest.raises(ValueError):
        store.record(call, uuid4(), "latency", metric="status", value=1)
    with store.connect() as conn:
        row = conn.execute("select * from nether.calls").fetchone()
        assert row["status"] == "completed" and row["first_audio_ms"] == 123


def test_reused_event_key_cannot_create_another_call(store):
    key = uuid4()
    store.record(new_call(), key, "conversation_started")
    with pytest.raises(ValueError, match="collision"):
        store.record(new_call(), key, "conversation_started")
    with store.connect() as conn:
        assert conn.execute("select count(*) as n from nether.calls").fetchone()["n"] == 1
