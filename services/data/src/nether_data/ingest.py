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
CHARACTER_IDS = frozenset({
    "hei-wuchang", "bai-wuchang", "zhong-kui", "meng-po",
    "frankenstein", "werewolf", "vampire",
})


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
        campaign_id = payload["campaignId"]
        character_id = payload["characterId"]
        locale = payload["locale"]
        mode = payload.get("mode", "personal")
        if not isinstance(campaign_id, str) or not 1 <= len(campaign_id) <= 80:
            raise ValueError("invalid campaign")
        if not isinstance(character_id, str) or character_id not in CHARACTER_IDS:
            raise ValueError("invalid character")
        if not isinstance(locale, str) or locale not in {"zh", "en"}:
            raise ValueError("invalid locale")
        if not isinstance(mode, str) or mode not in {"personal", "host"}:
            raise ValueError("invalid mode")
        visitor_id = None
        if "visitorId" in payload:
            raw_visitor_id = payload["visitorId"]
            if not isinstance(raw_visitor_id, str):
                raise ValueError("invalid visitor")
            visitor_id = UUID(raw_visitor_id)
            if str(visitor_id) != raw_visitor_id.lower():
                raise ValueError("invalid visitor")
        call = Call(
            id=session_id,
            campaign_id=campaign_id,
            character_id=character_id,
            locale=locale,
            mode=mode,
            source_session_id=UUID(str(payload["sourceSessionId"])) if payload.get("sourceSessionId") else None,
            visitor_id=visitor_id,
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
