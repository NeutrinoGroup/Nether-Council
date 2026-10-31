"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import type { CharacterId, Locale } from "@nether/contracts";
import { CHARACTERS, CHARACTER_IDS, getCharacter, normalizeNickname } from "@nether/party-core";
import { VoiceClient, idleView, type VoiceView } from "../voice/client";
import { CharacterStage } from "../world3d/CharacterStage";
import { BilingualCaption } from "../captions/BilingualCaption";
import { IdentityCard } from "../card/IdentityCard";
import { BgmController } from "./bgm";
import { playCelebrationChime } from "./celebration";

let clientHydrated = false;
const subscribeHydration = (notify: () => void) => {
  if (!clientHydrated) {
    clientHydrated = true;
    queueMicrotask(notify);
  }
  return () => {};
};
const hydratedSnapshot = () => true;
const serverSnapshot = () => false;

export interface HostStageProps {
  initialLocale: Locale;
  initialCharacter?: CharacterId;
  invite: string;
  hostKey?: string;
  spectatorUrl?: string;
}

export function HostStage({
  initialLocale,
  initialCharacter = "meng-po",
  invite,
  hostKey = "",
  spectatorUrl = "",
}: HostStageProps) {
  const hydrated = useSyncExternalStore(subscribeHydration, hydratedSnapshot, serverSnapshot);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [characterId, setCharacterId] = useState<CharacterId>(initialCharacter);
  const [guestCount, setGuestCount] = useState<number>(1);
  const [nickname, setNickname] = useState<string>("");
  const [view, setView] = useState<VoiceView>(idleView);
  const [celebrating, setCelebrating] = useState<boolean>(false);
  const [bgmActive, setBgmActive] = useState<boolean>(false);
  const [bgmDucked, setBgmDucked] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [generatingVerdict, setGeneratingVerdict] = useState<boolean>(false);
  const [verdictError, setVerdictError] = useState<string | null>(null);

  const client = useRef<VoiceClient | null>(null);
  const bgm = useRef<BgmController | null>(null);
  const band = useRef<HTMLDivElement>(null);

  const charMeta = getCharacter(characterId);
  const active = !["idle", "ended", "error"].includes(view.phase);

  // Initialize Spectator QR code
  useEffect(() => {
    let alive = true;
    const url = spectatorUrl || (typeof window !== "undefined" ? window.location.origin + `/play?invite=${invite}` : "");
    if (url) {
      QRCode.toDataURL(url, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 180,
        color: { dark: "#0f0814", light: "#fff3df" },
      }).then(data => {
        if (alive) setQrDataUrl(data);
      }).catch(() => {});
    }
    return () => { alive = false; };
  }, [spectatorUrl, invite]);

  // Initialize BGM controller
  useEffect(() => {
    const ctrl = new BgmController();
    bgm.current = ctrl;
    return () => {
      ctrl.stop();
    };
  }, []);

  // Audio level visualizer and BGM ducking sync
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const level = client.current?.measurePlayback() ?? 0;
      const rms = client.current?.rms() ?? 0;
      band.current?.style.setProperty("--level", String(Math.min(1, level * 7)));

      // Duck BGM when either character is speaking or user is talking into the public mic
      const speaking = view.phase === "speaking" || rms > 0.02;
      if (bgm.current?.isActive()) {
        bgm.current.setDucked(speaking);
        setBgmDucked(speaking);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [view.phase]);

  // Auto-fetch verdict when session wraps up
  useEffect(() => {
    let alive = true;
    if (view.phase === "ended" && view.draft && !view.result && !verdictError) {
      const timer = setTimeout(() => {
        if (!alive) return;
        setGeneratingVerdict(true);
        void (async () => {
          try {
            const res = await fetch("/api/verdict", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId: view.draft!.sessionId, turns: view.draft!.turns }),
            });
            const data = await res.json();
            if (alive && res.ok && data.result) {
              setView(v => ({ ...v, result: data.result }));
            }
          } catch {
          } finally {
            if (alive) setGeneratingVerdict(false);
          }
        })();
      }, 50);
      return () => { alive = false; clearTimeout(timer); };
    }
  }, [view.phase, view.draft, view.result, verdictError]);

  const readRms = useCallback(() => client.current?.rms() ?? 0, []);

  const toggleBgm = () => {
    if (!bgm.current) return;
    if (bgmActive) {
      bgm.current.stop();
      setBgmActive(false);
      setBgmDucked(false);
    } else {
      bgm.current.start();
      setBgmActive(true);
    }
  };

  const triggerCelebration = () => {
    setCelebrating(true);
    playCelebrationChime();
    setTimeout(() => {
      setCelebrating(false);
    }, 6000);
  };

  const nextGuest = () => {
    client.current?.stop("next_guest");
    client.current = null;
    setView({ ...idleView });
    setNickname("");
    setVerdictError(null);
    setGuestCount(c => c + 1);
  };

  const changeCharacter = (next: CharacterId) => {
    if (next === characterId) return;
    client.current?.stop("character_change");
    client.current = null;
    setView({ ...idleView });
    setCharacterId(next);
  };

  const changeLocale = (next: Locale) => {
    if (next === locale) return;
    client.current?.stop("language_change");
    client.current = null;
    setView({ ...idleView });
    setLocale(next);
  };

  const start = () => {
    if (!invite) return;
    client.current?.stop();
    const next = new VoiceClient(setView);
    client.current = next;
    const name = normalizeNickname(nickname);
    setNickname(name);
    void next.start(locale, invite, undefined, name, characterId, "host", hostKey);
  };

  const manualClaimVerdict = async () => {
    if (!view.draft) return;
    setGeneratingVerdict(true);
    setVerdictError(null);
    try {
      const res = await fetch("/api/verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: view.draft.sessionId, turns: view.draft.turns }),
      });
      const data = await res.json();
      if (res.ok && data.result) {
        setView(v => ({ ...v, result: data.result }));
      } else {
        setVerdictError(data.error === "NO_STORY" ? (locale === "zh" ? "故事内容较少，未成专属评价" : "Not enough story turns") : "生成失败，请重试");
      }
    } catch {
      setVerdictError("网络连接异常");
    } finally {
      setGeneratingVerdict(false);
    }
  };

  return (
    <div className="host-shell" data-celebrating={celebrating} lang={locale === "zh" ? "zh-CN" : "en"}>
      {/* 1. Header: Venue & Host Info */}
      <header className="host-header">
        <div className="host-title-block">
          <span className="host-tag">NETHER COUNCIL · HOST MODE</span>
          <h1>{locale === "zh" ? "黄泉议会 · 现场主持大屏" : "Nether Council · Live Host Stage"}</h1>
        </div>
        <div className="host-status-badges">
          <span className="guest-badge">
            {locale === "zh" ? `来宾 #${guestCount}` : `Guest #${guestCount}`}
          </span>
          <span className={`bgm-badge ${bgmActive ? (bgmDucked ? "ducked" : "active") : "inactive"}`}>
            {bgmActive ? (bgmDucked ? (locale === "zh" ? "BGM 压低避让" : "BGM Ducked") : (locale === "zh" ? "BGM 播放中" : "BGM Active")) : (locale === "zh" ? "BGM 已静音" : "BGM Muted")}
          </span>
        </div>
        {qrDataUrl && (
          <div className="host-qr-card">
            <Image src={qrDataUrl} width={90} height={90} alt="Spectator invite QR" unoptimized />
            <span>{locale === "zh" ? "全场手机扫码开聊" : "Scan to Play"}</span>
          </div>
        )}
      </header>

      {/* 2. Main Large-Screen Projection Stage */}
      <main className="host-main-stage">
        <div className="host-stage-visual">
          <div className="host-character-info">
            <h2 className={locale === "zh" ? "han-display" : "latin-display"}>{charMeta.name[locale]}</h2>
            <p className="host-character-role">{charMeta.role[locale]}</p>
          </div>
          <CharacterStage
            characterId={characterId}
            locale={locale}
            phase={view.phase}
            interruptedAt={view.interruptedAt}
            celebrating={celebrating || Boolean(view.result)}
            readRms={readRms}
          />
          <div className="audio-band host-band" ref={band} aria-hidden="true">
            {Array.from({ length: 48 }, (_, i) => (
              <span key={i} style={{ "--amplitude": String(0.2 + ((i * 5) % 13) / 15) } as CSSProperties} />
            ))}
          </div>
        </div>

        {/* Captions & Verdict on Big Screen */}
        <div className="host-stage-content">
          <div className="host-captions-container">
            <BilingualCaption
              title={locale === "zh" ? `${charMeta.name.zh}的话` : `${charMeta.name.en} says`}
              caption={view.caption}
              locale={locale}
              fallback={active ? (locale === "zh" ? "正在连通冥界话轮…" : "Connecting to nether turn…") : charMeta.intro[locale]}
            />
            {view.userCaption && (
              <BilingualCaption
                title={locale === "zh" ? "现场持麦者" : "Live Speaker"}
                caption={view.userCaption}
                locale={locale}
                participant
              />
            )}
          </div>

          {/* Session Progress / Summary */}
          {active && (
            <div className="host-live-clock">
              <span>{Math.floor(view.elapsedSeconds / 60)}:{String(view.elapsedSeconds % 60).padStart(2, "0")} / 3:00</span>
              <span> · {view.userTurns} {locale === "zh" ? "次有效话轮" : "valid turns"}</span>
              {view.claimReady && (
                <span className="claim-ready-pill">{locale === "zh" ? "故事已充实，可收尾揭晓" : "Ready to reveal title"}</span>
              )}
            </div>
          )}

          {view.phase === "ended" && !view.result && (
            <div className="host-ended-prompt">
              <p>{locale === "zh" ? "本轮对话结束，正在为该来宾定制冥界专属身份…" : "Turn concluded. Generating custom identity…"}</p>
              <button className="claim-button ready" disabled={generatingVerdict} onClick={manualClaimVerdict}>
                {generatingVerdict ? (locale === "zh" ? "定制中…" : "Generating…") : (locale === "zh" ? "立即揭晓身份卡" : "Reveal Identity Now")}
              </button>
              {verdictError && <p className="error-note">{verdictError}</p>}
            </div>
          )}

          {view.result && (
            <div className="host-result-section">
              <IdentityCard result={view.result} initialNickname={nickname} locale={locale} invite={invite} />
            </div>
          )}
        </div>
      </main>

      {/* 3. Celebration Overlay Banner */}
      {celebrating && (
        <div className="host-celebration-banner" role="alert">
          <h2>✦ {locale === "zh" ? "全场狂欢 · 恭迎冥界贵客！" : "ALL-HALL CELEBRATION ✦ WELCOME TO THE NETHER!"}</h2>
          <p>{locale === "zh" ? "举杯同庆，烦恼消散，今夜人人皆有发言权！" : "Raise your glasses! Worries banished—everyone has a voice tonight!"}</p>
        </div>
      )}

      {/* 4. Recommendation Toast every 3-5 guests */}
      {guestCount > 1 && guestCount % 4 === 0 && !celebrating && (
        <aside className="host-toast-prompt">
          <span>{locale === "zh" ? `已接待 ${guestCount} 位来宾，建议主持触发一次全场祝词！` : `Hosted ${guestCount} guests! Time for an all-hall toast!` }</span>
          <button onClick={triggerCelebration}>{locale === "zh" ? "立即全场庆祝" : "Toast Now"}</button>
        </aside>
      )}

      {/* 5. Host Control Deck (Bottom bar) */}
      <footer className="host-control-deck">
        <div className="deck-group">
          <label className="deck-label">{locale === "zh" ? "交流角色" : "Character"}</label>
          <div className="deck-chips">
            {CHARACTER_IDS.map(id => (
              <button
                key={id}
                className={`deck-chip ${id === characterId ? "selected" : ""}`}
                disabled={active}
                onClick={() => changeCharacter(id)}
              >
                {CHARACTERS[id].name[locale]}
              </button>
            ))}
          </div>
        </div>

        <div className="deck-group">
          <label className="deck-label">{locale === "zh" ? "语言" : "Language"}</label>
          <div className="deck-chips">
            <button className={`deck-chip ${locale === "zh" ? "selected" : ""}`} disabled={active} onClick={() => changeLocale("zh")}>中文场</button>
            <button className={`deck-chip ${locale === "en" ? "selected" : ""}`} disabled={active} onClick={() => changeLocale("en")}>English</button>
          </div>
        </div>

        <div className="deck-actions">
          {!active ? (
            <button className="deck-btn primary" onClick={start} disabled={!invite || !hydrated}>
              {locale === "zh" ? "开启本轮麦克风" : "Start Live Turn"}
            </button>
          ) : (
            <>
              {view.canClaim && (
                <button className="deck-btn accent" onClick={() => client.current?.finish()}>
                  {locale === "zh" ? "收好故事" : "Wrap Up"}
                </button>
              )}
              <button className="deck-btn" onClick={() => client.current?.mute(!view.muted)}>
                {view.muted ? (locale === "zh" ? "恢复麦克风" : "Unmute") : (locale === "zh" ? "静音麦克风" : "Mute")}
              </button>
              <button className="deck-btn" disabled={view.phase !== "speaking"} onClick={() => client.current?.interrupt()}>
                {locale === "zh" ? "立即停播" : "Stop Speech"}
              </button>
              <button className="deck-btn danger" onClick={() => client.current?.stop()}>
                {locale === "zh" ? "结束本轮" : "End Turn"}
              </button>
            </>
          )}

          <button className="deck-btn next" onClick={nextGuest}>
            {locale === "zh" ? "下一位来宾 ➜" : "Next Guest ➜"}
          </button>

          <button className="deck-btn celebration" onClick={triggerCelebration}>
            {locale === "zh" ? "🎉 全场祝词" : "🎉 Toast"}
          </button>

          <button className={`deck-btn bgm ${bgmActive ? "active" : ""}`} onClick={toggleBgm}>
            {bgmActive ? (locale === "zh" ? "关闭 BGM" : "Stop BGM") : (locale === "zh" ? "开启 BGM" : "Start BGM")}
          </button>
        </div>
      </footer>
    </div>
  );
}
