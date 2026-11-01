"""Validated scene commands; partial JSON can never mutate the scene."""
import json
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Mood(Strict):
    mood: Literal["calm", "warm", "storm", "laughing", "angry_support", "mystical", "healing"]


class Worry(Strict):
    worry: str = Field(min_length=1, max_length=160)


class Blessing(Strict):
    blessing: str = Field(min_length=1, max_length=160)


class ChangeMood(Strict):
    action: Literal["change_mood"]
    data: Mood


class ExtractWorry(Strict):
    action: Literal["extract_worry"]
    data: Worry


class FinishRitual(Strict):
    action: Literal["finish_ritual"]
    data: Blessing


ACTION = TypeAdapter(Annotated[ChangeMood | ExtractWorry | FinishRitual, Field(discriminator="action")])


def parse_tool(name: str, arguments: str) -> dict | None:
    if not isinstance(name, str) or not isinstance(arguments, str) or len(arguments) > 2048:
        return None
    try:
        return ACTION.validate_python({"action": name, "data": json.loads(arguments)}).model_dump()
    except (ValueError, TypeError, ValidationError):
        return None


class ToolDispatcher:
    """Connection-local dedupe and response ownership. No IO on the audio path."""

    def __init__(self, auto_continue: bool = True):
        self.auto_continue = auto_continue
        self.active: str | None = None
        self.calls: set[str] = set()
        self.canceled: set[str] = set()
        self.continue_after: set[str] = set()

    def observe_client(self, event: dict):
        if event.get("type") == "response.cancel" and self.active:
            self.canceled.add(self.active)
            self.continue_after.discard(self.active)
            self.active = None

    def observe_provider(self, event: dict) -> tuple[list[dict], list[dict], bool]:
        """Returns downstream events, upstream acknowledgements, and consumption flag."""
        kind = event.get("type")
        if kind == "response.created":
            self.active = event.get("response", {}).get("id")
        elif kind == "input_audio_buffer.speech_started":
            self.observe_client({"type": "response.cancel"})
        elif kind == "response.function_call_arguments.done" and event.get("name") in {"change_mood", "extract_worry", "finish_ritual"}:
            rid, cid = event.get("response_id"), event.get("call_id")
            if rid != self.active or rid in self.canceled or not isinstance(cid, str) or not 0 < len(cid) <= 160 or cid in self.calls:
                return [], [], True
            if len(self.calls) >= 128:
                raise ValueError("TOOL_LIMIT")
            self.calls.add(cid)
            payload = parse_tool(event.get("name", ""), event.get("arguments", ""))
            downstream = [{"type": "UI_ACTION", "response_id": rid, "call_id": cid, "payload": payload}] if payload else [{"type": "gateway.tool_result", "response_id": rid, "call_id": cid}]
            output = {"ok": True} if payload else {"error": "INVALID_TOOL_ARGUMENTS"}
            self.continue_after.add(rid)
            return downstream, [{"type": "conversation.item.create", "item": {"type": "function_call_output", "call_id": cid, "output": json.dumps(output)}}], True
        elif kind == "response.done":
            response = event.get("response", {})
            rid = response.get("id")
            continuation = rid in self.continue_after and rid not in self.canceled and response.get("status") == "completed" and rid == self.active
            self.continue_after.discard(rid)
            if rid == self.active:
                self.active = None
            return [], [{"type": "response.create"}] if continuation and self.auto_continue else [], False
        return [], [], False
