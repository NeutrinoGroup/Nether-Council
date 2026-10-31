"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { Locale } from "@nether/contracts";
import { idleView, VoiceClient, type VoiceView } from "./client";
const words = {
  zh: { home: "黄泉议会", title: "孟婆", role: "南瓜忘忧汤酒保", intro: "今晚，想忘掉哪件离谱事？", invitation: "把最近的烦恼倒进汤里。她会追问、接梗，再陪你笑一笑。", choose: "用哪种语言聊？", start: "开麦，找孟婆聊聊", stop: "结束对话", mute: "静音麦克风", unmute: "恢复麦克风", interrupt: "打断孟婆", caption: "孟婆的话", you: "你刚才说", empty: "开麦后，从一件最近的离谱事说起。", examples: ["今天开了五场会，工作一点没动。", "朋友又让我“顺便”改个 PPT。", "我把截止日期记成了下个星期。"], topic: "不知道怎么开口？", hint: "直接说就好。孟婆说话时，你也可以插话。", mic: "点击后允许使用麦克风。第一次体验建议戴耳机。", invite: "需要活动邀请。请从主持人提供的链接进入。", trial: "孟婆语音试场 · 身份卡稍后开放", ended: "这碗汤先聊到这里，想起新故事再来。", connection: "连接", first: "开场音频", states: { idle: "准备开聊", permission: "正在请求麦克风", connecting: "正在接通孟婆", listening: "正在听你说", speaking: "孟婆正在说话", reconnecting: "连接断开，正在恢复", ended: "对话已结束", error: "暂时没接通" } },
  en: { home: "Nether Council", title: "Meng Po", role: "Your afterlife bartender", intro: "What’s been ridiculous lately?", invitation: "Pour a little worry into the pumpkin soup. She’ll ask, tease gently, and help you laugh it off.", choose: "Which language?", start: "Turn on mic & meet Meng Po", stop: "End conversation", mute: "Mute microphone", unmute: "Unmute microphone", interrupt: "Interrupt Meng Po", caption: "Meng Po says", you: "You just said", empty: "Start with one ridiculous thing that happened lately.", examples: ["Five meetings today. Zero actual work done.", "A friend asked for “one tiny” slide-deck favor.", "I thought the deadline was next week."], topic: "Need an opening line?", hint: "Just talk. You can interrupt her while she’s speaking.", mic: "Allow microphone access after clicking. Headphones help for a first try.", invite: "You need an event invitation. Open the link from your host.", trial: "Meng Po voice trial · Identity cards coming later", ended: "That’s one bowl for tonight. Come back with another story.", connection: "Connection", first: "Opening audio", states: { idle: "Ready when you are", permission: "Requesting microphone", connecting: "Connecting to Meng Po", listening: "Listening to you", speaking: "Meng Po is speaking", reconnecting: "Reconnecting", ended: "Conversation ended", error: "Couldn’t connect" } },
};
function errorText(code: string | undefined, locale: Locale) {
  const zh = locale === "zh";
  if (code === "MICROPHONE_DENIED") return zh ? "麦克风被拒绝了。请在地址栏允许麦克风后重试。" : "Microphone access was denied. Allow it in your address bar, then try again.";
  if (code === "FORBIDDEN") return zh ? "活动邀请已失效。请使用主持人提供的新链接。" : "This event invitation is no longer valid. Use a new link from your host.";
  if (code === "VOICE_DISABLED") return zh ? "语音入口暂时关闭，请稍后再来。" : "Voice entry is temporarily closed. Please try later.";
  return zh ? "语音连接遇到问题。请检查网络，再重新开麦。" : "Voice ran into a problem. Check your connection, then start again.";
}
const subscribeHydration = () => () => {};
const hydratedSnapshot = () => true;
const serverSnapshot = () => false;
export function VoiceTrial({ initialLocale, invite, referral }: { initialLocale: Locale; invite: string; referral?: string }) {
  const hydrated = useSyncExternalStore(subscribeHydration, hydratedSnapshot, serverSnapshot);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [view, setView] = useState<VoiceView>(idleView);
  const client = useRef<VoiceClient | null>(null);
  const band = useRef<HTMLDivElement>(null);
  const t = words[locale];
  const active = !["idle", "ended", "error"].includes(view.phase);
  useEffect(() => {
    const onHidden = () => { if (document.hidden) client.current?.stop(); };
    document.addEventListener("visibilitychange", onHidden);
    return () => { document.removeEventListener("visibilitychange", onHidden); client.current?.stop(); };
  }, []);
  useEffect(() => {
    let frame = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const tick = () => {
      const level = client.current?.measurePlayback() ?? 0;
      band.current?.style.setProperty("--level", String(reduced.matches ? 0 : Math.min(1, level * 7)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  const start = () => {
    if (!invite) return;
    client.current?.stop();
    const next = new VoiceClient(setView); client.current = next;
    void next.start(locale, invite, referral);
  };
  return <main className="party-shell" lang={locale === "zh" ? "zh-CN" : "en"}>
    <header className="party-nav"><span className="brand">{t.home}</span><span>{locale === "zh" ? "今晚的奇遇" : "Tonight’s encounter"}</span></header>
    <div className="voice-layout">
      <section className="conversation" aria-labelledby="character-name">
        <div className="character-heading"><h1 id="character-name" className={locale === "zh" ? "han-display" : "latin-display"}>{t.title}</h1><p>{t.role}</p></div>
        <p className="opening-line">{t.intro}</p>
        <div className="live-state" role="status"><span className={active ? "state-dot active" : "state-dot"} aria-hidden="true" />{t.states[view.phase]}{view.phase === "reconnecting" ? ` · ${view.reconnects}/3` : ""}</div>
        <div className="caption-area"><h2>{t.caption}</h2><p className="character-caption" aria-live="polite" aria-atomic="true">{view.caption?.sourceText ?? (view.phase === "ended" ? t.ended : t.empty)}</p>
          {view.userCaption && <div className="user-caption"><h2>{t.you}</h2><p>{view.userCaption.sourceText}</p></div>}
        </div>
        <div className="audio-band" ref={band} aria-hidden="true">{Array.from({ length: 39 }, (_, i) => <span key={i} style={{ "--amplitude": String(0.25 + ((i * 7) % 11) / 14) } as CSSProperties} />)}</div>
      </section>
      <aside className="voice-setup" aria-label={locale === "zh" ? "开聊准备" : "Before you talk"}>
        <p className="encounter-intro">{t.invitation}</p>
        <fieldset disabled={active}><legend>{t.choose}</legend><div className="language-switch"><label><input type="radio" name="locale" value="zh" checked={locale === "zh"} onChange={() => setLocale("zh")} />中文</label><label><input type="radio" name="locale" value="en" checked={locale === "en"} onChange={() => setLocale("en")} />English</label></div></fieldset>
        <section className="story-examples"><h2>{t.topic}</h2><ul>{t.examples.map(example => <li key={example}>{example}</li>)}</ul></section>
        <details className="mobile-opening-lines"><summary>{t.topic}</summary><ul>{t.examples.map(example => <li key={example}>{example}</li>)}</ul></details>
        <p className="talk-hint">{t.hint}</p>
        <p className="permission-note">{t.mic}</p>
        {invite === "" && <p role="status" className="invite-note">{t.invite}</p>}
        {view.error && <p role="alert" className="error-note">{errorText(view.error, locale)}</p>}
        {view.connectMs !== undefined && <details className="trial-measurements"><summary>{locale === "zh" ? "试听检测" : "Trial measurements"}</summary><dl className="timing"><div><dt>{t.connection}</dt><dd>{view.connectMs} ms</dd></div>{view.firstAudioMs !== undefined && <div><dt>{t.first}</dt><dd>{view.firstAudioMs} ms</dd></div>}</dl></details>}
      </aside>
    </div>
    <footer className="voice-actions">
      {!active ? <button className="start-button" onClick={start} disabled={!invite || !hydrated}>{t.start}<MicIcon /></button> : <div className="live-controls"><button onClick={() => client.current?.mute(!view.muted)} aria-pressed={view.muted}>{view.muted ? t.unmute : t.mute}</button><button onClick={() => client.current?.interrupt()} disabled={view.phase !== "speaking"}>{t.interrupt}</button><button className="stop-button" onClick={() => client.current?.stop()}>{t.stop}</button></div>}
      <p>{t.trial}</p>
    </footer>
  </main>;
}
function MicIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8" /></svg>; }
