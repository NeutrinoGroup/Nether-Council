"use client";
import { useState, type RefObject } from "react";
import type { Locale } from "@nether/contracts";
import type { VoiceClient, VoiceView } from "./client";

export function VoiceTextInput({ view, locale, client }: { view: VoiceView; locale: Locale; client: RefObject<VoiceClient | null> }) {
  const [text, setText] = useState("");
  const waiting = view.finalizing || ["permission", "connecting", "reconnecting"].includes(view.phase);
  return <>
    {view.demo && <p className="demo-status" role="status">{locale === "zh" ? "演示模式 · 预置故事与语音" : "Demo mode · scripted story and recorded voice"}</p>}
    {view.demoAudioUnavailable && <p role="status">{locale === "zh" ? "语音暂不可用，可继续文字演示。" : "Audio unavailable. Continue with the text demo."}</p>}
    {!["idle", "ended", "error"].includes(view.phase) && <form className="voice-text-fallback" onSubmit={event => { event.preventDefault(); client.current?.submitText(text); setText(""); }}>
      <label htmlFor="voice-text">{locale === "zh" ? "也可以打字说" : "Or type your message"}</label>
      <input id="voice-text" autoComplete="off" maxLength={600} value={text} onChange={event => setText(event.target.value)} disabled={waiting} />
      <button type="submit" disabled={!text.trim() || waiting}>{locale === "zh" ? "发送" : "Send"}</button>
    </form>}
  </>;
}
