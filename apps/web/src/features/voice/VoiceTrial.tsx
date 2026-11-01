"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { CharacterId, Locale } from "@nether/contracts";
import { CHARACTERS, CHARACTER_IDS, getCharacter, normalizeNickname } from "@nether/party-core";
import { VoiceClient, idleView, type VoiceView } from "./client";
import { CharacterStage } from "../world3d/CharacterStage";
import { BilingualCaption } from "../captions/BilingualCaption";
import { useVerdict } from "../verdict/useVerdict";
import { IdentityCard } from "../card/IdentityCard";
import { InAppBrowserBanner } from "./InAppBrowserBanner";
import { errorText, words } from "./words";

let clientHydrated = false;
const subscribeHydration = (notify: () => void) => {
  if (!clientHydrated) { clientHydrated = true; queueMicrotask(notify); }
  return () => {};
};
const hydratedSnapshot = () => true;
const serverSnapshot = () => false;

export function VoiceTrial({
  initialLocale,
  initialCharacter = "meng-po",
  invite,
  referral,
}: {
  initialLocale: Locale;
  initialCharacter?: CharacterId;
  invite: string;
  referral?: string;
}) {
  const hydrated = useSyncExternalStore(subscribeHydration, hydratedSnapshot, serverSnapshot);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [characterId, setCharacterId] = useState<CharacterId>(initialCharacter);
  const [nickname, setNickname] = useState("");
  const [view, setView] = useState<VoiceView>(idleView);
  const { generatingVerdict, verdictError, claimVerdict, resetVerdict } = useVerdict(view, setView, locale);
  const client = useRef<VoiceClient | null>(null);
  const band = useRef<HTMLDivElement>(null);

  const charMeta = getCharacter(characterId);
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
    resetVerdict();
    client.current?.stop("language_change");
    client.current = null;
    setView({ ...idleView });
    setLocale(next);
  };

  const changeCharacter = (next: CharacterId) => {
    if (next === characterId) return;
    resetVerdict();
    client.current?.stop("character_change");
    client.current = null;
    setView({ ...idleView });
    setCharacterId(next);
  };

  const start = () => {
    if (!invite) return;
    resetVerdict();
    client.current?.stop();
    const next = new VoiceClient(setView);
    client.current = next;
    const name = normalizeNickname(nickname);
    setNickname(name);
    void next.start(locale, invite, referral, name, characterId);
  };

  const characterStateLabel = () => {
    if (view.finalizing) {
      return locale === "zh"
        ? `${charMeta.name.zh}正在为你写下专属身份…`
        : `${charMeta.name.en} is crafting your afterlife identity…`;
    }
    if (view.phase === "speaking") {
      return locale === "zh" ? `${charMeta.name.zh}正在说话` : `${charMeta.name.en} is speaking`;
    }
    if (view.phase === "connecting") {
      return locale === "zh" ? `正在接通${charMeta.name.zh}` : `Connecting to ${charMeta.name.en}`;
    }
    return t.states[view.phase];
  };

  return (
    <main className="party-shell" data-active={active} lang={locale === "zh" ? "zh-CN" : "en"}>
      <header className="party-nav">
        <span className="brand">{t.home}</span>
        <div className="nav-encounter">
          <span>{locale === "zh" ? "今晚的奇遇" : "Tonight’s encounter"}</span>
          {active && (
            <button
              className="locale-reset"
              onClick={() => changeLocale(locale === "zh" ? "en" : "zh")}
              aria-label={locale === "zh" ? "结束当前对话并切换为英语" : "End this conversation and switch to Chinese"}
            >
              {locale === "zh" ? "English" : "中文"}
            </button>
          )}
        </div>
      </header>

      <div className="voice-layout" tabIndex={0} aria-label={locale === "zh" ? "对话与准备" : "Conversation and setup"}>
        <section className="conversation" aria-labelledby="character-name">
          <div className="character-heading">
            <h1 id="character-name" className={locale === "zh" ? "han-display" : "latin-display"}>
              {charMeta.name[locale]}
            </h1>
            <p>{charMeta.role[locale]}</p>
          </div>
          <CharacterStage
            characterId={characterId}
            locale={locale}
            phase={view.phase}
            interruptedAt={view.interruptedAt}
            readRms={readRms}
          />
          <p className="opening-line">{charMeta.intro[locale]}</p>
          <div className="live-state" role="status">
            <span className={active ? "state-dot active" : "state-dot"} aria-hidden="true" />
            {characterStateLabel()}
            {view.phase === "reconnecting" ? ` · ${view.reconnects}/3` : ""}
          </div>
          <div className="caption-area">
            <BilingualCaption
              title={locale === "zh" ? `${charMeta.name.zh}的话` : `${charMeta.name.en} says`}
              caption={view.caption}
              locale={locale}
              fallback={view.phase === "ended" ? t.ended : t.empty}
            />
            {view.userCaption && (
              <BilingualCaption
                title={t.you}
                caption={view.userCaption}
                locale={locale}
                participant
              />
            )}
          </div>
          {active && (
            <div className="encounter-progress">
              <p className="encounter-clock">
                {Math.floor(view.elapsedSeconds / 60)}:{String(view.elapsedSeconds % 60).padStart(2, "0")} / 3:00 ·{" "}
                {locale === "zh" ? `${view.userTurns} 次有效发言` : `${view.userTurns} story turns`}
              </p>
              {view.claimReady && (
                <p role="status" className="claim-prompt">
                  {locale === "zh"
                    ? "这段奇遇，可以收好了。还想补一句，也可以继续聊。"
                    : "You have a story worth keeping. Add one more detail, or wrap up now."}
                </p>
              )}
            </div>
          )}
          {view.phase === "ended" && (
            <div className="encounter-summary" role="status">
              {view.draft ? (
                <>
                  <p>
                    {locale === "zh"
                      ? `${view.draft.nickname || "今晚的来宾"}，故事已收好。`
                      : `${view.draft.nickname || "Tonight’s guest"}, your story is ready.`}
                  </p>
                  <p>
                    {locale === "zh" ? "故事仅保留在本页。身份卡如下：" : "Your story stays in this page. Here is your identity card:"}
                  </p>
                  {!view.result && (
                    <div className="verdict-trigger-box" style={{ marginTop: "12px" }}>
                      <button className="claim-button ready" disabled={generatingVerdict} onClick={claimVerdict}>
                        {generatingVerdict
                          ? (locale === "zh" ? `${charMeta.name.zh}正在为你写下专属身份…` : "Crafting your identity…")
                          : (locale === "zh" ? "揭晓我的专属身份卡" : "Reveal my identity card")}
                      </button>
                      {verdictError && <p role="alert" className="error-note" style={{ marginTop: "8px" }}>{verdictError}</p>}
                    </div>
                  )}
                </>
              ) : (
                <p>
                  {locale === "zh"
                    ? "还没收好一个故事。重新开麦，讲一句最近的离谱事吧。"
                    : "No story collected yet. Start again with something ridiculous that happened lately."}
                </p>
              )}
              {view.endReason === "time_limit" && (
                <p>{locale === "zh" ? "三分钟到了，麦克风已关闭。" : "Three minutes are up. Your microphone is off."}</p>
              )}
            </div>
          )}
          {view.result && <IdentityCard result={view.result} initialNickname={nickname} locale={locale} invite={invite} />}
          <div className="audio-band" ref={band} aria-hidden="true">
            {Array.from({ length: 39 }, (_, i) => (
              <span key={i} style={{ "--amplitude": String(0.25 + ((i * 7) % 11) / 14) } as CSSProperties} />
            ))}
          </div>
        </section>

        <aside className="voice-setup" aria-label={locale === "zh" ? "开聊准备" : "Before you talk"}>
          <InAppBrowserBanner locale={locale} />
          <p className="encounter-intro">{t.invitation}</p>

          <fieldset disabled={active} className="character-picker">
            <legend>{locale === "zh" ? "今晚与谁对话？" : "Who would you like to speak with?"}</legend>
            <div className="character-grid" role="radiogroup" aria-label={locale === "zh" ? "角色选择" : "Character selector"}>
              {CHARACTER_IDS.map(id => {
                const item = CHARACTERS[id];
                const selected = id === characterId;
                return (
                  <label
                    key={id}
                    className={`character-chip ${selected ? "selected" : ""}`}
                  >
                    <input type="radio" name="character" value={id} checked={selected} onChange={() => changeCharacter(id)} />
                    <span className="chip-name">{item.name[locale]}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset disabled={active}>
            <legend>{t.choose}</legend>
            <div className="language-switch">
              <label>
                <input type="radio" name="locale" value="zh" checked={locale === "zh"} onChange={() => changeLocale("zh")} />
                中文
              </label>
              <label>
                <input type="radio" name="locale" value="en" checked={locale === "en"} onChange={() => changeLocale("en")} />
                English
              </label>
            </div>
          </fieldset>

          <div className="nickname-field">
            <label htmlFor="nickname">{locale === "zh" ? "怎么称呼你？（选填）" : "What should we call you? (optional)"}</label>
            <input
              id="nickname"
              autoComplete="off"
              maxLength={48}
              value={nickname}
              disabled={active}
              onChange={event => setNickname(event.target.value)}
              onBlur={() => setNickname(normalizeNickname(nickname))}
              aria-describedby="nickname-hint"
            />
            <p id="nickname-hint">
              {locale === "zh" ? "最多 24 个字符，仅用于本页称呼，不发送给神仙。" : "Up to 24 characters. Kept in this page; never sent to the character."}
            </p>
          </div>

          <section className="story-examples">
            <h2>{locale === "zh" ? `不知道怎么和${charMeta.name.zh}开口？` : `Opening topics with ${charMeta.name.en}`}</h2>
            <ul>{charMeta.topics[locale].map(example => <li key={example}>{example}</li>)}</ul>
          </section>

          <details className="mobile-opening-lines">
            <summary>{locale === "zh" ? `不知道怎么和${charMeta.name.zh}开口？` : `Opening topics with ${charMeta.name.en}`}</summary>
            <ul>{charMeta.topics[locale].map(example => <li key={example}>{example}</li>)}</ul>
          </details>

          <p className="talk-hint">{t.hint}</p>
          <p className="permission-note">{t.mic}</p>
          {view.connectMs !== undefined && (
            <details className="trial-measurements">
              <summary>{locale === "zh" ? "试听检测" : "Trial measurements"}</summary>
              <dl className="timing">
                <div><dt>{t.connection}</dt><dd>{view.connectMs} ms</dd></div>
                {view.firstAudioMs !== undefined && <div><dt>{t.first}</dt><dd>{view.firstAudioMs} ms</dd></div>}
              </dl>
            </details>
          )}
        </aside>
      </div>

      <footer className="voice-actions">
        {(invite === "" || view.error) && <div className="entry-feedback">
          {invite === "" && <p role="status" className="invite-note">{t.invite}</p>}
          {view.error && <p role="alert" className="error-note">{errorText(view.error, locale)}</p>}
        </div>}
        {!active ? (
          <button className="start-button" onClick={start} disabled={!invite || !hydrated}>
            {locale === "zh" ? `开麦，找${charMeta.name.zh}聊聊` : `Turn on mic & meet ${charMeta.name.en}`}
            <MicIcon />
          </button>
        ) : (
          <div className="live-controls">
            {view.canClaim && (
              <button
                className={view.claimReady ? "claim-button ready" : "claim-button"}
                disabled={view.finalizing}
                onClick={() => client.current?.finish()}
              >
                {locale === "zh" ? "收好故事" : "Keep my story"}
              </button>
            )}
            <button disabled={view.finalizing} onClick={() => client.current?.mute(!view.muted)} aria-pressed={view.muted}>
              {view.muted ? t.unmute : t.mute}
            </button>
            <button onClick={() => client.current?.interrupt()} disabled={view.phase !== "speaking"}>
              {locale === "zh" ? `打断${charMeta.name.zh}` : `Interrupt ${charMeta.name.en}`}
            </button>
            <button className="stop-button" onClick={() => client.current?.stop()}>
              {t.stop}
            </button>
          </div>
        )}
        <p>{locale === "zh" ? `${charMeta.name.zh}语音试场 · 7位角色已就位` : `${charMeta.name.en} voice trial · All 7 characters ready`}</p>
      </footer>
    </main>
  );
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8" />
    </svg>
  );
}
