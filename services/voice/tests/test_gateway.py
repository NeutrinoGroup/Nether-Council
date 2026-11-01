import asyncio
import json

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from websockets.asyncio.server import serve

from nether_voice.app import app, duplex
from nether_voice.tools import ToolDispatcher, parse_tool


def test_tool_validation_and_dedupe():
    assert parse_tool("extract_worry", '{"worry":"开不完的会"}') == {"action": "extract_worry", "data": {"worry": "开不完的会"}}
    for name, args in [("eval", '{}'), ("change_mood", '{"mood":"invalid"}'), ("finish_ritual", '{"blessing":"ok","extra":1}'), ("extract_worry", '{"worry":'), ("extract_worry", '{"worry":1}')]:
        assert parse_tool(name, args) is None
    dispatcher = ToolDispatcher()
    dispatcher.observe_provider({"type": "response.created", "response": {"id": "r1"}})
    event = {"type": "response.function_call_arguments.done", "response_id": "r1", "call_id": "c1", "name": "change_mood", "arguments": '{"mood":"warm"}'}
    commands, replies, consumed = dispatcher.observe_provider(event)
    assert consumed and commands[0]["type"] == "UI_ACTION"
    assert replies[0]["item"]["call_id"] == "c1"
    assert dispatcher.observe_provider(event) == ([], [], True)
    # Multiple function calls require a single continuation after generation completes.
    dispatcher.observe_provider({**event, "call_id": "c2"})
    assert dispatcher.observe_provider({"type": "response.done", "response": {"id": "r1", "status": "completed"}})[1] == [{"type": "response.create"}]
    assert dispatcher.observe_provider({"type": "response.done", "response": {"id": "r1", "status": "completed"}})[1] == []


def test_cancelled_and_foreign_tools_never_mutate_ui():
    dispatcher = ToolDispatcher()
    dispatcher.observe_provider({"type": "response.created", "response": {"id": "r1"}})
    dispatcher.observe_provider({"type": "input_audio_buffer.speech_started"})
    event = {"type": "response.function_call_arguments.done", "response_id": "r1", "call_id": "late", "name": "finish_ritual", "arguments": '{"blessing":"Good night"}'}
    assert dispatcher.observe_provider(event) == ([], [], True)
    assert dispatcher.observe_provider({**event, "response_id": "foreign"}) == ([], [], True)
    assert dispatcher.observe_provider({"type": "response.done", "response": {"id": "r1", "status": "completed"}})[1] == []


def test_gateway_auth_fails_before_provider_connect(monkeypatch):
    monkeypatch.setenv("VOICE_GATEWAY_SECRET", "s" * 32)
    with TestClient(app) as client:
        assert client.get("/health").json()["ok"]
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/realtime", headers={"Authorization": "Bearer wrong"}):
                pytest.fail("unauthorized socket accepted")


@pytest.mark.asyncio
async def test_real_fastapi_and_provider_sockets_forward_duplex_and_tools(monkeypatch):
    messages = []
    closed = asyncio.Event()

    async def provider(socket):
        assert socket.request.headers["Authorization"] == "Bearer fixture"
        try:
            await socket.send(json.dumps({"type": "session.created"}))
            async for raw in socket:
                event = json.loads(raw)
                messages.append(event)
                if event["type"] == "session.update":
                    await socket.send(json.dumps({"type": "session.updated"}))
                if event["type"] == "input_audio_buffer.append":
                    for event in [
                        {"type": "response.created", "response": {"id": "r1"}},
                        {"type": "response.audio.delta", "response_id": "r1", "delta": "AAA="},
                        {"type": "response.function_call_arguments.done", "response_id": "r1", "call_id": "c1", "name": "extract_worry", "arguments": '{"worry":"meeting"}'},
                        {"type": "response.done", "response": {"id": "r1", "status": "completed"}},
                    ]:
                        await socket.send(json.dumps(event))
        finally:
            closed.set()

    async with serve(provider, "127.0.0.1", 0) as server:
        monkeypatch.setenv("QWEN_REALTIME_URL", f"ws://127.0.0.1:{server.sockets[0].getsockname()[1]}")
        monkeypatch.setenv("QWEN_DUPLEX_API_KEY", "fixture")
        monkeypatch.setenv("VOICE_GATEWAY_SECRET", "s" * 32)

        def exercise():
            with TestClient(app) as client:
                with client.websocket_connect("/realtime", headers={"Authorization": f'Bearer {"s" * 32}'}) as socket:
                    assert socket.receive_json()["type"] == "session.created"
                    socket.send_json({"type": "session.update", "session": {}})
                    assert socket.receive_json()["type"] == "session.updated"
                    socket.send_json({"type": "input_audio_buffer.append", "audio": "AAA="})
                    assert socket.receive_json()["type"] == "response.created"
                    assert socket.receive_json()["type"] == "response.audio.delta"
                    action = socket.receive_json()
                    assert action["type"] == "UI_ACTION" and action["payload"]["data"]["worry"] == "meeting"
                    assert socket.receive_json()["type"] == "response.done"
                    socket.send_json({"type": "response.cancel"})
                    # Waiting for the cancellation also proves that both tool acknowledgements were flushed.
                    socket.send_json({"type": "session.update", "session": {}})
                    assert socket.receive_json()["type"] == "session.updated"

        await asyncio.wait_for(asyncio.to_thread(exercise), 10)
        await asyncio.wait_for(closed.wait(), 3)
    assert any(event["type"] == "conversation.item.create" for event in messages)
    assert sum(event["type"] == "response.create" for event in messages) == 1
    assert any(event["type"] == "response.cancel" for event in messages)


@pytest.mark.asyncio
async def test_disconnect_cancels_blocked_sibling_and_lifetime_is_bounded():
    canceled = asyncio.Event()

    class Client:
        async def receive_text(self):
            raise WebSocketDisconnect()

    class Provider:
        def __aiter__(self):
            return self

        async def __anext__(self):
            try:
                await asyncio.Event().wait()
            finally:
                canceled.set()

    with pytest.raises(WebSocketDisconnect):
        await duplex(Client(), Provider())
    assert canceled.is_set()

    class IdleClient:
        async def receive_text(self):
            await asyncio.Event().wait()

    canceled.clear()
    await asyncio.wait_for(duplex(IdleClient(), Provider(), lifetime=0.01), 1)
    assert canceled.is_set()
