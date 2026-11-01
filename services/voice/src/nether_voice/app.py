"""FastAPI duplex transport for the existing same-origin Next admission adapter.

Only the authenticated server adapter connects here. Browser cookies, app event
sequencing, captions, identities and admission stay at the existing /api/ws edge.
Qwen credentials and function dispatch live in this process.
"""
import asyncio
import hmac
import json
import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed, WebSocketException

from .tools import ToolDispatcher

app = FastAPI()


@app.get("/health")
async def health():
    return {"ok": True, "service": "nether-voice"}


async def duplex(client: WebSocket, provider, lifetime: float = 235, auto_continue: bool = True):
    dispatcher = ToolDispatcher(auto_continue)
    send_lock = asyncio.Lock()

    async def send_provider(event: dict):
        # Serializes tool acknowledgements with microphone/cancel frames.
        async with send_lock:
            async with asyncio.timeout(2):
                await provider.send(json.dumps(event, ensure_ascii=False))

    async def send_client(event: dict):
        async with asyncio.timeout(2):
            await client.send_json(event)

    async def upload():
        while True:
            raw = await client.receive_text()
            if len(raw.encode()) > 1_048_576:
                raise ValueError("MESSAGE_LIMIT")
            event = json.loads(raw)
            if not isinstance(event, dict) or not isinstance(event.get("type"), str):
                raise ValueError("INVALID_EVENT")
            dispatcher.observe_client(event)
            await send_provider(event)

    async def download():
        async for raw in provider:
            event = json.loads(raw)
            if not isinstance(event, dict):
                raise ValueError("INVALID_EVENT")
            commands, replies, consumed = dispatcher.observe_provider(event)
            # Never wait for tool IO before forwarding original streamed audio.
            for command in commands:
                await send_client(command)
            if not consumed:
                await send_client(event)
            for reply in replies:
                await send_provider(reply)

    tasks = [asyncio.create_task(upload()), asyncio.create_task(download())]
    try:
        done, _ = await asyncio.wait(tasks, timeout=lifetime, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


@app.websocket("/realtime")
async def realtime(client: WebSocket):
    secret = os.getenv("VOICE_GATEWAY_SECRET", "")
    given = client.headers.get("authorization", "")
    # Fail before opening any billable provider connection. Not a public browser API.
    if len(secret) < 32 or not hmac.compare_digest(given.encode(), f"Bearer {secret}".encode()):
        await client.close(code=1008)
        return
    key = os.getenv("QWEN_DUPLEX_API_KEY", "")
    if not key:
        await client.close(code=1011)
        return
    await client.accept()
    url = urlsplit(os.getenv("QWEN_REALTIME_URL", "wss://maas.qianwenaiapi.com/api-ws/v1/realtime"))
    model = os.getenv("QWEN_REALTIME_MODEL", "qwen-audio-3.1-realtime-plus")
    query = dict(parse_qsl(url.query))
    query["model"] = model
    address = urlunsplit(url._replace(query=urlencode(query)))
    try:
        async with connect(address, additional_headers={"Authorization": f"Bearer {key}"}, open_timeout=2.5, close_timeout=1, max_size=1_048_576, max_queue=8, write_limit=32768, ping_interval=20, ping_timeout=10) as provider:
            await duplex(client, provider, auto_continue=client.headers.get("x-nether-continuation") != "edge")
    except (WebSocketDisconnect, ConnectionClosed):
        pass
    except (TimeoutError, OSError, ValueError, WebSocketException):
        # Never echo upstream errors, credentials, transcripts or audio into logs.
        pass
    finally:
        try:
            await client.close(code=1011)
        except RuntimeError:
            pass
