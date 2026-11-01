# FastAPI realtime gateway

This service is the Python transport and tool dispatcher for Qwen 3.1 Realtime.
The existing Next `/api/ws` remains a same-origin admission adapter so invitation
validation, HttpOnly session cookies, absolute capture limits, captions,
translation, identity generation and existing Vercel deployments keep working.

```
Browser AudioWorklet <-> /api/ws (Next admission/protocol adapter)
                       <-> /realtime (FastAPI, persistent process) <-> Qwen
```

Audio does not wait for translation or identity HTTP requests. Each direction has
its own asyncio task. A disconnect, 235-second transport limit, oversized frame,
or send blocked longer than two seconds cancels the sibling and closes Qwen.
Provider receive queues and browser playback queues are bounded. The edge keeps
its existing per-session upload rate and same-origin checks.

## Run

```sh
# Dependencies already captured in uv.lock; reproduces `uv add fastapi websockets aiohttp pydantic`.
uv sync --project services/voice --frozen
# Put a random secret of at least 32 characters in .env as VOICE_GATEWAY_SECRET.
# Add VOICE_GATEWAY_URL=ws://127.0.0.1:8001/realtime to the Next server environment.
pnpm dev:gateway
# Start the existing websocket-capable Next server with the same .env config:
pnpm dev:voice
```

QWEN_DUPLEX_API_KEY, QWEN_REALTIME_URL and QWEN_REALTIME_MODEL are read in Python.
The default model is `qwen-audio-3.1-realtime-plus`, with 16kHz PCM16LE input and
24kHz PCM16LE output. Voice, prompt, tools and VAD are selected by the existing
character/session adapter's `session.update`. `.env` is never a browser asset.
Without VOICE_GATEWAY_URL, the existing direct Node transport still works.

Deploy Python as a persistent ASGI service (not a short-lived HTTP function),
behind a reverse proxy with WebSocket upgrade support. Use `wss://` for a remote
VOICE_GATEWAY_URL. Restrict it to the Next server when possible; it requires a
separate VOICE_GATEWAY_SECRET bearer token before connecting to paid Qwen. Do not
put that secret in NEXT_PUBLIC variables or a URL. A remote deployment must also
provide the Qwen key to Python. Rotate both environments together if changing the
shared gateway secret. Do not point QWEN_REALTIME_URL back at the gateway.

## Function dispatch

Complete `response.function_call_arguments.done` arguments are validated with
Pydantic. `change_mood`, `extract_worry`, and `finish_ritual` become:

```json
{"type":"UI_ACTION","response_id":"r1","call_id":"c1","payload":{"action":"change_mood","data":{"mood":"warm"}}}
```

The edge adds its standard protocol/session/epoch/sequence envelope and converts
response_id/call_id to responseId/callId. The UI validates the same discriminated
union in `@nether/contracts`. Duplicate call IDs and canceled/foreign response IDs
are ignored. Invalid complete arguments receive a bounded tool error, not an
arbitrary scene mutation. Argument deltas never execute. `function_call_output`
acknowledges dispatch, then a single response.create continues after response.done.
With the Next adapter, X-Nether-Continuation=edge makes the edge the sole owner of
continuation, including the existing soul ritual tools. Without that header the
Python dispatcher continues its own canonical tool calls. Existing extra soul
tools pass through to the edge.

The scene command does not create a result/card or stop the live microphone.
`finish_ritual` changes the scene; explicit session finalization retains the
existing identity workflow. Mood values include calm/warm/storm and the existing
laughing/angry_support/mystical/healing character expressions.

## Verify

```sh
pnpm test:voice
pnpm verify:voice-gateway
pnpm test:e2e:realtime
```

The first two use fixture credentials and local mock Qwen sockets. The cross-
service check runs the real Next relay, a uvicorn/FastAPI subprocess and a mock
provider, and verifies simultaneous upload/playback, tool output/continuation,
UI_ACTION deduplication, interruption, late-frame rejection, text and cleanup.
Browser tests exercise actual Worklets and the bundled recorded demo audio.
They are not evidence of production provider latency or a guarantee of zero
physical-device latency. Deployment and venue rehearsal are still necessary.
