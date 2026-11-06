import hashlib
import hmac
import json
from uuid import uuid4

import pytest

from nether_data.ingest import parse_event, valid_signature


SECRET = "s" * 32


def signed(payload: dict, timestamp: str = "1700000000"):
    body = json.dumps(payload, separators=(",", ":")).encode()
    signature = hmac.new(SECRET.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    return body, timestamp, signature


def event(name="conversation_started", **extra):
    payload = {
        "eventId": str(uuid4()), "sessionId": str(uuid4()), "name": name,
        "campaignId": "halloween-2026", "characterId": "meng-po",
        "locale": "zh", "mode": "personal", **extra,
    }
    return payload


def test_signature_requires_secret_and_fresh_timestamp():
    body, timestamp, signature = signed(event())
    assert valid_signature(body, timestamp, signature, SECRET, now=1700000000)
    assert not valid_signature(body, timestamp, signature, SECRET, now=1700000061)
    assert not valid_signature(body, timestamp, signature, "short", now=1700000000)
    assert not valid_signature(body, timestamp, "0" * 64, SECRET, now=1700000000)


def test_parse_event_whitelists_identity_and_metric():
    parsed = parse_event(event("latency", metric="first_audio_ms", value=321))
    assert parsed and parsed.call.character_id == "meng-po" and parsed.value == 321
    assert parse_event(event("entry_viewed")) is None


@pytest.mark.parametrize("payload", [
    event("latency", metric="status", value=1),
    event("conversation_started", metric="first_audio_ms", value=1),
    event("unknown"),
    {"name": "conversation_started"},
])
def test_parse_event_rejects_untrusted_or_unsupported_fields(payload):
    with pytest.raises(ValueError):
        parse_event(payload)
