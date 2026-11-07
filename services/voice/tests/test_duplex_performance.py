import pytest

from nether_voice.tools import ToolDispatcher


@pytest.mark.parametrize("soul_mode", [False, True])
@pytest.mark.parametrize("cancel_source", ["client", "vad"])
def test_post_cancel_audio_and_captions_are_consumed(soul_mode, cancel_source):
    dispatcher = ToolDispatcher(auto_continue=False)
    if soul_mode:
        dispatcher.observe_client({"type": "session.update", "session": {"tools": [
            {"function": {"name": "trigger_soul_soup_ritual"}}
        ]}})
    dispatcher.observe_provider({"type": "response.created", "response": {"id": "old"}})
    for kind in ["response.audio.delta", "response.audio_transcript.delta"]:
        assert dispatcher.observe_provider({"type": kind, "response_id": "old", "delta": "AAA="}) == ([], [], False)
    if cancel_source == "client":
        dispatcher.observe_client({"type": "response.cancel"})
    else:
        dispatcher.observe_provider({"type": "input_audio_buffer.speech_started"})
    assert "old" in dispatcher.canceled
    for kind in ["response.audio.delta", "response.audio_transcript.delta"]:
        assert dispatcher.observe_provider({"type": kind, "response_id": "old", "delta": "AAA="}) == ([], [], True)
    dispatcher.observe_provider({"type": "response.created", "response": {"id": "new"}})
    for kind in ["response.audio.delta", "response.audio_transcript.delta"]:
        assert dispatcher.observe_provider({"type": kind, "response_id": "old", "delta": "AAA="}) == ([], [], True)
        assert dispatcher.observe_provider({"type": kind, "response_id": "new", "delta": "AAA="}) == ([], [], False)
    dispatcher.observe_provider({"type": "response.done", "response": {"id": "old", "status": "cancelled"}})
    assert dispatcher.active == "new"
    dispatcher.observe_provider({"type": "response.done", "response": {"id": "new", "status": "completed"}})
    assert dispatcher.active is None
