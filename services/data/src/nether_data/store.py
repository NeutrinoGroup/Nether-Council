from collections.abc import Callable
from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from uuid import UUID, uuid4

import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

EVENTS = frozenset({"conversation_started", "conversation_completed", "card_rendered", "card_download_created", "share_invoked", "invite_copied", "referred_conversation_started", "connection_error", "latency"})
METRICS = frozenset({"connect_ms", "first_audio_ms", "stop_ms", "translation_ms", "result_ms"})


@dataclass(frozen=True)
class Call:
    id: UUID
    campaign_id: str
    character_id: str
    locale: str
    mode: str = "personal"
    source_session_id: UUID | None = None


class Store:
    def __init__(self, dsn: str):
        self.dsn = dsn

    def connect(self):
        # Supavisor transaction pooling cannot retain prepared statements.
        return psycopg.connect(self.dsn, autocommit=True, prepare_threshold=None,
                               connect_timeout=5, row_factory=dict_row)

    def record(self, call: Call, event_key: UUID, event_type: str,
               *, metric: str | None = None, value: int | None = None) -> bool:
        """Authenticated server facts only. A duplicate event changes nothing."""
        if event_type not in EVENTS:
            raise ValueError("unsupported event")
        if event_type == "latency":
            if metric not in METRICS or not isinstance(value, int) or not 0 <= value <= 300_000:
                raise ValueError("invalid latency")
        elif metric is not None or value is not None:
            raise ValueError("unexpected metric")
        payload = {"call_id": str(call.id), "campaign_id": call.campaign_id,
                   "character_id": call.character_id, "locale": call.locale,
                   "mode": call.mode, "event_type": event_type}
        if metric:
            payload.update(metric=metric, value=value)
        with self.connect() as conn, conn.transaction():
            conn.execute("""insert into nether.calls(id,campaign_id,character_id,locale,mode,source_session_id)
                values (%s,%s,%s,%s,%s,%s) on conflict(id) do nothing""",
                         (call.id, call.campaign_id, call.character_id, call.locale, call.mode, call.source_session_id))
            row = conn.execute("select * from nether.calls where id=%s for update", (call.id,)).fetchone()
            identity = ("campaign_id", "character_id", "locale", "mode", "source_session_id")
            if any(row[field] != getattr(call, field) for field in identity):
                raise ValueError("call identity mismatch")
            created = conn.execute("""insert into nether.outbox(event_key,call_id,event_type,payload)
                values (%s,%s,%s,%s) on conflict(event_key) do nothing returning id""",
                                   (event_key, call.id, event_type, Jsonb(payload))).fetchone()
            if not created:
                existing = conn.execute("select call_id,event_type,payload from nether.outbox where event_key=%s", (event_key,)).fetchone()
                if existing["call_id"] != call.id or existing["event_type"] != event_type or existing["payload"] != payload:
                    raise ValueError("event key collision")
                return False
            updates = {
                "conversation_started": "started_at=coalesce(started_at,now()), status=case when status='created' then 'active' else status end",
                "referred_conversation_started": "started_at=coalesce(started_at,now()), status=case when status='created' then 'active' else status end",
                "conversation_completed": "completed_at=coalesce(completed_at,now()), status='completed'",
                "card_rendered": "card_rendered_at=coalesce(card_rendered_at,now())",
                "card_download_created": "card_saved_at=coalesce(card_saved_at,now()), card_save_count=card_save_count+1",
                "share_invoked": "share_invoked_at=coalesce(share_invoked_at,now()), share_count=share_count+1",
                "invite_copied": "invite_copied_at=coalesce(invite_copied_at,now())",
                "connection_error": "error_count=error_count+1",
            }
            if metric:
                conn.execute(sql.SQL("update nether.calls set {}=%s,revision=revision+1,updated_at=now() where id=%s").format(sql.Identifier(metric)), (value, call.id))
            else:
                conn.execute(sql.SQL("update nether.calls set {},revision=revision+1,updated_at=now() where id=%s").format(sql.SQL(updates[event_type])), (call.id,))
            return True

    def put_cache(self, namespace: str, key: str, version: int, model: str,
                  payload: dict[str, Any], ttl_seconds: int, call_id: UUID | None = None):
        maximum = 86_400 if namespace == "identity" else 604_800
        if namespace not in {"identity", "asset"} or not 0 < ttl_seconds <= maximum:
            raise ValueError("invalid cache lifetime")
        with self.connect() as conn:
            conn.execute("""insert into nether.cache(namespace,key,version,model,payload,expires_at,call_id)
              values (%s,%s,%s,%s,%s,now()+%s,%s)
              on conflict(namespace,key,version) do update set model=excluded.model,
              payload=excluded.payload,expires_at=excluded.expires_at,call_id=excluded.call_id,updated_at=now()""",
                         (namespace, key, version, model, Jsonb(payload), timedelta(seconds=ttl_seconds), call_id))

    def get_cache(self, namespace: str, key: str, version: int, model: str):
        with self.connect() as conn:
            row = conn.execute("""select payload from nether.cache where namespace=%s and key=%s
                and version=%s and model=%s and expires_at>now()""", (namespace, key, version, model)).fetchone()
            return row["payload"] if row else None

    def claim(self, limit: int = 20, lease_seconds: int = 30):
        if not 1 <= limit <= 100 or not 1 <= lease_seconds <= 300:
            raise ValueError("invalid lease")
        with self.connect() as conn, conn.transaction():
            # Recover expired workers, including a crash on the final attempt.
            conn.execute("""with expired as (
                select id from nether.outbox where status='processing' and locked_until<=now()
                order by locked_until,id for update skip locked limit 100
              ) update nether.outbox o set
                status=case when o.attempts>=o.max_attempts then 'dead' else 'pending' end,
                lease_token=null,locked_until=null,last_error='lease_expired',updated_at=now()
                from expired where o.id=expired.id""")
            return conn.execute("""with picked as (
                select id from nether.outbox where status='pending' and available_at<=now()
                and attempts<max_attempts order by available_at,created_at,id
                for update skip locked limit %s
              ) update nether.outbox o set status='processing',attempts=o.attempts+1,
                lease_token=%s,locked_until=now()+%s,updated_at=now()
              from picked where o.id=picked.id returning o.*""",
                                (limit, uuid4(), timedelta(seconds=lease_seconds))).fetchall()

    def ack(self, event: dict) -> bool:
        with self.connect() as conn:
            return bool(conn.execute("""update nether.outbox set status='done',completed_at=now(),
                lease_token=null,locked_until=null,updated_at=now()
                where id=%s and lease_token=%s and status='processing' and locked_until>now()
                returning id""", (event["id"], event["lease_token"])).fetchone())

    def fail(self, event: dict) -> bool:
        with self.connect() as conn:
            return bool(conn.execute("""update nether.outbox set
                status=case when attempts>=max_attempts then 'dead' else 'pending' end,
                available_at=now()+make_interval(secs=>least(300,power(2,attempts)::integer)),
                lease_token=null,locked_until=null,last_error='delivery_failed',updated_at=now()
                where id=%s and lease_token=%s and status='processing' and locked_until>now()
                returning id""", (event["id"], event["lease_token"])).fetchone())

    def dispatch(self, handler: Callable[[UUID, str, dict], None], limit: int = 1) -> int:
        """At-least-once. A receiver must deduplicate event_key before its effect.

        Handler timeout must fit the 30s lease. Claim one by default so queued
        events don't expire while a slow receiver handles an earlier event.
        """
        delivered = 0
        for event in self.claim(limit):
            try:
                handler(event["event_key"], event["event_type"], event["payload"])
            except Exception:
                self.fail(event)  # Persist only a safe error code, never exception/story text.
            else:
                delivered += int(self.ack(event))
        return delivered
