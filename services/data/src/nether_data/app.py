"""Private HTTP ingestion for verified server telemetry.

The endpoint is intentionally separate from realtime audio. It accepts only
the HMAC-authenticated, allow-listed event envelope and never stores transcripts,
audio, request headers or arbitrary JSON fields.
"""

import os

from fastapi import FastAPI, HTTPException, Request

from .ingest import ingest, parse_event, valid_signature
from .store import Store

app = FastAPI(title="Nether Council data ingestion", docs_url=None, redoc_url=None)


@app.get("/health")
def health():
    return {"ok": True, "service": "nether-data"}


@app.post("/v1/events", status_code=202)
async def events(request: Request):
    body = await request.body()
    if len(body) > 4096:
        raise HTTPException(status_code=413, detail="payload too large")
    if not valid_signature(body, request.headers.get("x-nether-timestamp", ""),
                           request.headers.get("x-nether-signature", ""),
                           os.getenv("NETHER_DATA_INGEST_SECRET", "")):
        raise HTTPException(status_code=401, detail="invalid signature")
    try:
        payload = await request.json()
        event = parse_event(payload)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="invalid event") from None
    if event is None:
        return {"accepted": True, "persisted": False}
    dsn = os.getenv("DATABASE_URL", "")
    if not dsn:
        raise HTTPException(status_code=503, detail="data store unavailable")
    try:
        persisted = ingest(Store(dsn), event)
    except (OSError, TimeoutError):
        raise HTTPException(status_code=503, detail="data store unavailable") from None
    return {"accepted": True, "persisted": persisted}
