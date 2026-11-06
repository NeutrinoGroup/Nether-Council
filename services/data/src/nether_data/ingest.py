"""Authenticate and normalize the server's narrow telemetry payload."""

from dataclasses import dataclass
from hashlib import sha256
import hmac
import time
from uuid import UUID

from .store import Call, Store

EVENT_TYPES = frozenset({
    "conversation_started", "conversation_completed", "card_rendered", "card_download_clicked",
    "card_download_created", "share_invoked", "invite_copied",
    "referred_conversation_started", "connection_error", "latency",
})
METRICS = frozenset({"connect_ms", "first_audio_ms", "stop_ms", "translation_ms", "result_ms"})


@dataclass(frozen=True)
class IngestEvent:
    event_id: UUID
    event_type: str
    call: Call
    metric: str | None = None
    value: int | None = None


def valid_signature(body: bytes, timestamp: str, signature: str, secret: str,
                    *, now: int | None = None, max_skew: int = 60) -> bool:
    """Verify HMAC-SHA256 over ``timestamp.body`` and reject replay windows."""
    if len(secret) < 32 or not timestamp.isdigit() or len(signature) != 64:
        return False
    issued = int(timestamp)
    current = int(time.time()) if now is None else now
    if abs(current - issued) > max_skew:
        return False
    message = timestamp.encode() + b"." + body
    expected = hmac.new(secret.encode(), message, sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def parse_event(payload: dict) -> IngestEvent | None:
    """Parse the already verified Next payload; never accept arbitrary columns."""
    if payload.get("name") == "entry_viewed":
        return None
    try:
        event_id = UUID(str(payload["eventId"]))
        session_id = UUID(str(payload["sessionId"]))
        event_type = str(payload["name"])
        call = Call(
            id=session_id,
            campaign_id=str(payload["campaignId"]),
            character_id=str(payload["characterId"]),
            locale=str(payload["locale"]),
            mode=str(payload.get("mode", "personal")),
            source_session_id=UUID(str(payload["sourceSessionId"])) if payload.get("sourceSessionId") else None,
        )
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        raise ValueError("invalid event identity") from exc
    if event_type not in EVENT_TYPES:
        raise ValueError("unsupported event")
    metric = payload.get("metric")
    value = payload.get("value")
    if event_type == "latency":
        if metric not in METRICS or not isinstance(value, int) or not 0 <= value <= 300_000:
            raise ValueError("invalid latency")
    elif metric is not None or value is not None:
        raise ValueError("unexpected metric")
    return IngestEvent(event_id, event_type, call, metric, value)


def ingest(store: Store, event: IngestEvent) -> bool:
    return store.record(event.call, event.event_id, event.event_type,
                        metric=event.metric, value=event.value)
