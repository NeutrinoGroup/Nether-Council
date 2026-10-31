"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { normalizeNickname } from "@nether/party-core";
import { BilingualCaption } from "../captions/BilingualCaption";
import type { Locale } from "@nether/contracts";
import { idleView, VoiceClient, type VoiceView } from "./client";
import { CharacterStage } from "../world3d/CharacterStage";
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
  const [nickname, setNickname] = useState("");
  const [view, setView] = useState<VoiceView>(idleView);
  const client = useRef<VoiceClient | null>(null);
  const band = useRef<HTMLDivElement>(null);
  const t = words[locale];
  const active = !["idle", "ended", "error"].includes(view.phase);
  useEffect(() => {
    const onHidden = () => { if (document.hidden) client.current?.stop("background"); };
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
  const readRms = useCallback(() => client.current?.rms() ?? 0, []);
  const changeLocale = (next: Locale) => {
    if (next === locale) return;
    client.current?.stop("language_change"); client.current = null;
    setView({ ...idleView }); setLocale(next);
  };
  const start = () => {
    if (!invite) return;
    client.current?.stop();
    const next = new VoiceClient(setView); client.current = next;
    const name = normalizeNickname(nickname); setNickname(name);
    void next.start(locale, invite, referral, name);
  };
  return <main className="party-shell" data-active={active} lang={locale === "zh" ? "zh-CN" : "en"}>
    <header className="party-nav"><span className="brand">{t.home}</span><div className="nav-encounter"><span>{locale === "zh" ? "今晚的奇遇" : "Tonight’s encounter"}</span>{active && <button className="locale-reset" onClick={() => changeLocale(locale === "zh" ? "en" : "zh")} aria-label={locale === "zh" ? "结束当前对话并切换为英语" : "End this conversation and switch to Chinese"}>{locale === "zh" ? "English" : "中文"}</button>}</div></header>
    <div className="voice-layout" tabIndex={0} aria-label={locale === "zh" ? "对话与准备" : "Conversation and setup"}>
      <section className="conversation" aria-labelledby="character-name">
        <div className="character-heading"><h1 id="character-name" className={locale === "zh" ? "han-display" : "latin-display"}>{t.title}</h1><p>{t.role}</p></div>
        <CharacterStage locale={locale} phase={view.phase} interruptedAt={view.interruptedAt} readRms={readRms} />
        <p className="opening-line">{t.intro}</p>
        <div className="live-state" role="status"><span className={active ? "state-dot active" : "state-dot"} aria-hidden="true" />{t.states[view.phase]}{view.phase === "reconnecting" ? ` · ${view.reconnects}/3` : ""}</div>
        <div className="caption-area"><BilingualCaption title={t.caption} caption={view.caption} locale={locale} fallback={view.phase === "ended" ? t.ended : t.empty} />
          {view.userCaption && <BilingualCaption title={t.you} caption={view.userCaption} locale={locale} participant />}
        </div>
        {active && <div className="encounter-progress"><p className="encounter-clock">{Math.floor(view.elapsedSeconds / 60)}:{String(view.elapsedSeconds % 60).padStart(2, "0")} / 3:00 · {locale === "zh" ? `${view.userTurns} 次有效发言` : `${view.userTurns} story turns`}</p>{view.claimReady && <p role="status" className="claim-prompt">{locale === "zh" ? "这段奇遇，可以收好了。还想补一句，也可以继续聊。" : "You have a story worth keeping. Add one more detail, or wrap up now."}</p>}</div>}
        {view.phase === "ended" && <div className="encounter-summary" role="status">{view.draft ? <><p>{locale === "zh" ? `${view.draft.nickname || "今晚的来宾"}，故事已收好。` : `${view.draft.nickname || "Tonight’s guest"}, your story is ready.`}</p><p>{locale === "zh" ? "故事仅保留在本页。身份生成和卡片将在后续版本开放。" : "Your story stays in this page. Identity generation and cards are coming next."}</p></> : <p>{locale === "zh" ? "还没收好一个故事。重新开麦，讲一句最近的离谱事吧。" : "No story collected yet. Start again with something ridiculous that happened lately."}</p>}{view.endReason === "time_limit" && <p>{locale === "zh" ? "三分钟到了，麦克风已关闭。" : "Three minutes are up. Your microphone is off."}</p>}</div>}
        <div className="audio-band" ref={band} aria-hidden="true">{Array.from({ length: 39 }, (_, i) => <span key={i} style={{ "--amplitude": String(0.25 + ((i * 7) % 11) / 14) } as CSSProperties} />)}</div>
      </section>
      <aside className="voice-setup" aria-label={locale === "zh" ? "开聊准备" : "Before you talk"}>
        <p className="encounter-intro">{t.invitation}</p>
        <fieldset disabled={active}><legend>{t.choose}</legend><div className="language-switch"><label><input type="radio" name="locale" value="zh" checked={locale === "zh"} onChange={() => changeLocale("zh")} />中文</label><label><input type="radio" name="locale" value="en" checked={locale === "en"} onChange={() => changeLocale("en")} />English</label></div></fieldset>
        <div className="nickname-field"><label htmlFor="nickname">{locale === "zh" ? "怎么称呼你？（选填）" : "What should we call you? (optional)"}</label><input id="nickname" autoComplete="off" maxLength={48} value={nickname} disabled={active} onChange={event => setNickname(event.target.value)} onBlur={() => setNickname(normalizeNickname(nickname))} aria-describedby="nickname-hint" /><p id="nickname-hint">{locale === "zh" ? "最多 24 个字符，仅用于本页称呼，不发送给神仙。" : "Up to 24 characters. Kept in this page; never sent to the character."}</p></div>
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
      {!active ? <button className="start-button" onClick={start} disabled={!invite || !hydrated}>{t.start}<MicIcon /></button> : <div className="live-controls">{view.canClaim && <button className={view.claimReady ? "claim-button ready" : "claim-button"} onClick={() => client.current?.finish()}>{locale === "zh" ? "收好故事" : "Keep my story"}</button>}<button onClick={() => client.current?.mute(!view.muted)} aria-pressed={view.muted}>{view.muted ? t.unmute : t.mute}</button><button onClick={() => client.current?.interrupt()} disabled={view.phase !== "speaking"}>{t.interrupt}</button><button className="stop-button" onClick={() => client.current?.stop()}>{t.stop}</button></div>}
      <p>{t.trial}</p>
    </footer>
  </main>;
}
function MicIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8" /></svg>; }
